import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { load } from "cheerio";
import { format } from "prettier";
import { parseConsumablePage, translateNutrition } from "./consumable-wiki.mjs";

const base = "https://wiki.wishingstar.top";
const headers = {
  "User-Agent":
    "P12-GW2-Build-Tools/0.0004 (consumable research; offline snapshots)",
};
const cached = process.argv.includes("--cached");
const refresh = process.argv.includes("--refresh") && !cached;
const raw = JSON.parse(
  await readFile("data/attribute-items.en.json", "utf8"),
).items;
const catalog = JSON.parse(await readFile("public/catalog.json", "utf8"));
const missing = raw.filter(
  (i) =>
    ["Food", "Utility"].includes(i.details?.type) &&
    !i.details?.description &&
    !i.details?.infix_upgrade?.buff?.description,
);
const targets = [
  ...missing,
  ...raw.filter((i) => [99842, 99845, 102135, 67528].includes(i.id)),
];
const path = (id) => `data/wiki-consumable-cache/${id}.html`;
await mkdir("data/wiki-consumable-cache", { recursive: true });
async function acquire(id, title) {
  if (!refresh) {
    try {
      return await readFile(path(id), "utf8");
    } catch {
      if (cached)
        throw Error(
          `Missing cached article ${id}; acquire pages before rebuilding.`,
        );
    }
  }
  await delay(1500);
  const response = await fetch(
    `${base}/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
    { headers, signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok && response.status !== 404)
    throw Error(
      `Stop: HTTP ${response.status}, ${title}. Cache retained; no retry.`,
    );
  const html = await response.text();
  await writeFile(path(id), html);
  return html;
}
if (!cached) {
  const response = await fetch(`${base}/robots.txt`, {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  const robots = await response.text();
  if (
    !response.ok ||
    !robots.includes("User-agent:") ||
    /Disallow:\s*(?:\/\s*$|\/wiki\/\s*$)/im.test(robots)
  )
    throw Error("Cannot verify article collection permission");
}
// The index explicitly lists each feast's effects. Its exact API name must be unique.
const indexHtml = await acquire("index-Ascended_feast", "Ascended feast");
const reviews = JSON.parse(
  await readFile("data/consumable-reviews.json", "utf8"),
);
const indexed = new Map();
if (indexHtml) {
  const $ = load(indexHtml);
  const revision = Number(indexHtml.match(/"wgRevisionId":(\d+)/)?.[1]);
  $("script,style,sup").remove();
  $("table").each((_, table) => {
    if (
      !$(table)
        .find("th")
        .first()
        .text()
        .trim()
        .match(/^Feast$/)
    )
      return;
    $(table)
      .find("tr")
      .each((_, row) => {
        const cells = $(row).children("td");
        if (cells.length < 4) return;
        const name = cells
          .eq(0)
          .find("a")
          .filter((_, a) => $(a).text().trim())
          .last()
          .text()
          .trim();
        const matches = raw.filter(
          (i) => i.name === name && i.details?.type === "Food",
        );
        if (matches.length !== 1 || !revision) return;
        const values = [1, 2, 3].map((i) =>
          cells.eq(i).text().replace(/\s+/g, " ").trim(),
        );
        const pve = !values[0].includes("Stats only apply in WvW");
        values[0] = values[0].replace("Stats only apply in WvW.", "").trim();
        indexed.set(matches[0].id, {
          text:
            values.join("\n") +
            "\n+10% Karma\n+5% All Experience Gained\n+20% Magic Find\n+20% Gold Find\n+10% WXP Gained",
          duration: 3600,
          sourceUrl: `${base}/wiki/Ascended_feast?oldid=${revision}`,
          pve,
          identity: "exact unique API name in explicit Wiki effect table",
        });
      });
  });
}
const entries = {},
  audit = [];
const pages = new Map();
for (const [n, item] of targets.entries()) {
  const html = await acquire(item.id, item.name);
  pages.set(item.id, {
    html,
    page: html ? parseConsumablePage(html, item.id) : { reason: "尚未采集" },
  });
  if (!cached && (n + 1) % 25 === 0) console.log(`${n + 1}/${targets.length}`);
}
// Resolve directly described servings before feasts that explicitly reference them.
targets.sort(
  (a, b) =>
    Number(!!pages.get(b.id).page.text) - Number(!!pages.get(a.id).page.text),
);
for (const item of targets) {
  const { html, page } = pages.get(item.id);
  let nutrition, equivalentIds;
  const review = reviews[item.id];
  if (
    review &&
    (page.revision !== review.revision ||
      !load(html)(".mw-parser-output")
        .text()
        .replace(/\s+/g, " ")
        .includes(review.evidence))
  )
    throw Error(`Consumable review is stale: ${item.id}`);
  if (page.disputed) {
    audit.push({
      id: item.id,
      name: item.name,
      status: "disputed",
      sourceUrl: page.sourceUrl,
    });
    continue;
  }
  if (page.text) {
    const normalize = (value) =>
      value?.replace(/\s+/g, " ").trim().toLowerCase();
    const chinese =
      normalize(item.details?.description) === normalize(page.text)
        ? catalog.items.find((i) => i.id === item.id)?.details?.description
        : undefined;
    nutrition = { ...page, chinese };
  } else if (review) {
    const equivalent = raw.find((i) => i.id === review.sameAs);
    nutrition = {
      ...page,
      text: review.text ?? equivalent.details.description,
      excludedReason: review.excludedReason,
      chinese:
        review.description ??
        (equivalent
          ? catalog.items.find((i) => i.id === equivalent.id)?.details
              ?.description
          : undefined),
      duration: review.duration,
    };
    if (equivalent) equivalentIds = [equivalent.id];
  } else if (indexed.has(item.id)) nutrition = indexed.get(item.id);
  else if (page.equivalences?.length === 1) {
    const name = page.equivalences[0].name;
    const matches = raw.filter(
      (i) =>
        i.name === name &&
        i.details?.type === "Food" &&
        (i.details.description || entries[i.id]?.text),
    );
    const texts = new Set(
      matches.map((i) => i.details.description || entries[i.id]?.text),
    );
    if (matches.length && texts.size === 1) {
      equivalentIds = matches.map((i) => i.id);
      const chinese =
        entries[matches[0].id]?.description ||
        catalog.items.find((i) => i.id === matches[0].id)?.details?.description;
      nutrition = {
        ...page,
        text: entries[matches[0].id]?.text || matches[0].details.description,
        chinese,
      };
    }
  }
  if (nutrition) {
    const description = nutrition.chinese || translateNutrition(nutrition.text);
    // Never publish unreviewed English as a Chinese effect description.
    if (!/[a-z]{3}/i.test(description)) {
      entries[item.id] = {
        name: item.name,
        text: nutrition.text,
        description,
        duration: nutrition.duration,
        sourceUrl: nutrition.sourceUrl,
        pve: nutrition.pve,
        excludedReason: nutrition.excludedReason,
      };
      audit.push({
        id: item.id,
        name: item.name,
        status: nutrition.excludedReason ? "contextual" : "verified",
        sourceUrl: nutrition.sourceUrl,
        equivalentIds,
        identity: nutrition.identity || "exact page game ID",
        apiText: item.details?.description || "",
        wikiText: nutrition.text,
      });
    } else
      audit.push({
        id: item.id,
        name: item.name,
        status: "translation-review",
        sourceUrl: nutrition.sourceUrl,
        text: nutrition.text,
        description,
      });
  } else
    audit.push({
      id: item.id,
      name: item.name,
      status: page.reason || "no-nutrition-or-equivalence",
      sourceUrl: page.sourceUrl,
      equivalences: page.equivalences,
      quote: page.quote,
    });
}
async function atomic(file, data) {
  await writeFile(
    file + ".tmp",
    await format(JSON.stringify(data), { parser: "json" }),
  );
  await rename(file + ".tmp", file);
}
await atomic("src/data/consumables.json", { schema: 1, entries });
await atomic("data/consumable-audit.json", {
  schema: 1,
  missingApiCount: missing.length,
  entryCount: Object.keys(entries).length,
  verifiedCount: audit.filter((e) => e.status === "verified").length,
  contextualCount: audit.filter((e) => e.status === "contextual").length,
  entries: audit.sort((a, b) => a.id - b.id),
});
console.log(
  `Verified ${Object.keys(entries).length}/${targets.length}; missing API nutrition ${missing.length}`,
);
