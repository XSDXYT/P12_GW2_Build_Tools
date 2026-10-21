import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { load } from "cheerio";

const root = new URL("../", import.meta.url);
const file = (path) => new URL(path, root);
const mirror = "https://wiki.wishingstar.top";
const userAgent = "GW2-Build-Tools/0.3 (Wiki research; offline snapshots)";
// Disambiguation targets verified from the articles' own visible links, then validated by game ID.
const titleOverrides = {
  traits: {
    1910: "Shield_Proficiency_(chronomancer)",
    2087: "Axe_Proficiency_(mirage)",
    2214: "Dagger_Proficiency_(virtuoso)",
  },
  skills: { 56930: "Split_Second_(skill)" },
};
const cached = process.argv.includes("--cached");
const fetchOnly = process.argv.includes("--fetch-only");
const refresh = process.argv.includes("--refresh");
const profession =
  process.argv.find((v, i, a) => a[i - 1] === "--profession") || "Mesmer";
const interval = 1500;
const catalog = JSON.parse(await readFile(file("public/catalog.json"), "utf8"));
if (!catalog.professions.some((p) => p.id === profession))
  throw Error("Unknown profession");
const specs = new Set(
  catalog.specs.filter((s) => s.profession === profession).map((s) => s.id),
);
const selected = {
  traits: catalog.traits.filter((t) => specs.has(t.specialization)),
  skills: catalog.skills.filter((s) => s.professions?.includes(profession)),
};
await mkdir(file("data/wiki-cache/"), { recursive: true });
async function json(path) {
  return JSON.parse(await readFile(file(path), "utf8"));
}
async function atomic(path, contents) {
  await writeFile(file(`${path}.tmp`), contents);
  await rename(file(`${path}.tmp`), file(path));
}
async function get(url, allowMissing = false) {
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404 && allowMissing)
    return { notFound: true, text: await response.text() };
  if (!response.ok)
    throw Error(
      `Stop: HTTP ${response.status}; Retry-After=${response.headers.get("retry-after") || "none"}; ${url}. Cached pages retained; no automatic retry.`,
    );
  return response.text();
}
let manifest;
try {
  manifest = await json("data/wiki-pages.json");
} catch {
  /* First acquisition. */
}
if (
  !cached &&
  (!manifest ||
    refresh ||
    Object.entries(selected).some(([k, es]) =>
      es.some((e) => !manifest.entries[k][e.id]),
    ))
) {
  const entries = manifest?.entries || { traits: {}, skills: {} };
  for (const [kind, entities] of Object.entries(selected)) {
    const english = JSON.parse(
      await get(
        `https://api.guildwars2.com/v2/${kind}?ids=${entities.map((e) => e.id).join(",")}&lang=en`,
      ),
    );
    if (!Array.isArray(english) || english.length !== entities.length)
      throw Error(`Incomplete English ${kind} identity catalog`);
    const local = JSON.parse(
      await get(
        `https://api.guildwars2.com/v2/${kind}?ids=${entities.map((e) => e.id).join(",")}&lang=zh`,
      ),
    );
    if (!Array.isArray(local) || local.length !== entities.length)
      throw Error("Incomplete Chinese identity catalog");
    Object.assign(
      entries[kind],
      Object.fromEntries(
        english.map((e) => [
          e.id,
          {
            title: titleOverrides[kind]?.[e.id] || e.name.replaceAll(" ", "_"),
            name: e.name,
            facts: e.facts || [],
            chineseFacts: local.find((z) => z.id === e.id)?.facts || [],
            profession,
          },
        ]),
      ),
    );
  }
  const specData = JSON.parse(
    await get(
      `https://api.guildwars2.com/v2/specializations?ids=${[...specs].join(",")}&lang=en`,
    ),
  );
  manifest = {
    schema: 1,
    professions: [
      ...new Set([...(manifest?.professions || ["Mesmer"]), profession]),
    ],
    specNames: {
      ...manifest?.specNames,
      ...Object.fromEntries(specData.map((s) => [s.id, s.name])),
    },
    identitySource: "https://api.guildwars2.com/v2",
    entries,
  };
  await atomic(
    "data/wiki-pages.json",
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
if (!manifest)
  throw Error("Missing data/wiki-pages.json; run acquisition first");
if (!cached) {
  const robots = await get(`${mirror}/robots.txt`);
  if (!robots.includes("User-agent:")) throw Error("Cannot verify robots.txt");
  // Only ordinary /wiki/ article paths. Never use the disallowed API or Special endpoints.
  if (/Disallow:\s*(?:\/\s*$|\/wiki\/\s*$)/im.test(robots))
    throw Error("robots.txt disallows article collection");
  let done = 0;
  const total = Object.values(selected).reduce((n, es) => n + es.length, 0);
  for (const [kind, entities] of Object.entries(selected)) {
    for (const entity of entities) {
      const entry = manifest.entries[kind][entity.id];
      if (!entry || /^(?:Special|Spezial|Spécial|Especial):/i.test(entry.title))
        throw Error(`Invalid article identity: ${kind}/${entity.id}`);
      const path = `data/wiki-cache/${kind}-${entity.id}.html`;
      let existing;
      try {
        existing = await readFile(file(path), "utf8");
      } catch {
        /* Cache miss. */
      }
      if (
        existing &&
        titleOverrides[kind]?.[entity.id] &&
        !existing.includes(`"wgPageName":"${titleOverrides[kind][entity.id]}"`)
      )
        existing = undefined;
      if (titleOverrides[kind]?.[entity.id])
        entry.title = titleOverrides[kind][entity.id];
      if (refresh || !existing) {
        await delay(interval);
        const result = await get(
          `${mirror}/wiki/${encodeURIComponent(entry.title)}`,
          true,
        );
        const html =
          typeof result === "string"
            ? result
            : result.text + "\n<!--GW2_WIKI_HTTP_404-->";
        if (
          !html.includes("GW2_WIKI_HTTP_404") &&
          (!html.includes("mw-parser-output") || !html.includes("wgRevisionId"))
        )
          throw Error(`Unexpected article/challenge body: ${entry.title}`);
        await atomic(path, html);
      }
      done++;
      if (done % 10 === 0 || done === total)
        console.log(`Wiki cache ${done}/${total}`);
    }
  }
  // Resolve only links actually present on a disambiguation/hatnote page.
  // Every candidate is still checked against the requested game ID.
  for (const [kind, entities] of Object.entries(selected))
    for (const entity of entities) {
      const path = `data/wiki-cache/${kind}-${entity.id}.html`;
      const html = await readFile(file(path), "utf8");
      const $ = load(html);
      const singular = kind === "traits" ? "trait" : "skill";
      if ($(`.infobox.${singular} .gamelink[data-id="${entity.id}"]`).length)
        continue;
      const name = manifest.entries[kind][entity.id].name;
      const slug = name.replaceAll(" ", "_");
      const specialization = manifest.specNames?.[entity.specialization]
        ?.toLowerCase()
        .replaceAll(" ", "_");
      const candidates = [
        ...new Set(
          $('.mw-parser-output a[href^="/wiki/"]')
            .toArray()
            .map((n) => decodeURIComponent($(n).attr("href").slice(6)))
            .filter(
              (title) =>
                title.startsWith(slug + "_(") &&
                !title.includes("/") &&
                !title.includes("#"),
            ),
        ),
      ];
      // Hatnotes may point to a separate disambiguation article. Weapon
      // proficiency redirects can point to a different elite specialization.
      // Follow these bounded indexes, then still require the exact game ID.
      const indexes = candidates.filter((t) => t.endsWith("_(disambiguation)"));
      if (
        kind === "traits" &&
        /Proficiency$/.test(name) &&
        manifest.specNames?.[entity.specialization]
      )
        indexes.push(
          manifest.specNames[entity.specialization].replaceAll(" ", "_"),
        );
      for (const title of [...new Set(indexes)].slice(0, 2)) {
        const indexPath = `data/wiki-cache/index-${encodeURIComponent(title)}.html`;
        let body;
        try {
          body = await readFile(file(indexPath), "utf8");
        } catch {
          await delay(interval);
          const response = await get(
            `${mirror}/wiki/${encodeURIComponent(title)}`,
            true,
          );
          if (typeof response !== "string") continue;
          body = response;
          await atomic(indexPath, body);
        }
        const index = load(body);
        for (const target of index('.mw-parser-output a[href^="/wiki/"]')
          .toArray()
          .map((n) => decodeURIComponent(index(n).attr("href").slice(6)))) {
          if (
            target.startsWith(slug + "_(") &&
            !target.includes("/") &&
            !target.includes("#") &&
            !target.endsWith("_(disambiguation)") &&
            !candidates.includes(target)
          )
            candidates.push(target);
        }
      }
      const preferred = candidates.filter(
        (title) =>
          title
            .toLowerCase()
            .includes(specialization || profession.toLowerCase()) ||
          title === slug + `_(${singular})`,
      );
      for (const title of (preferred.length ? preferred : candidates).slice(
        0,
        8,
      )) {
        await delay(interval);
        const response = await get(
          `${mirror}/wiki/${encodeURIComponent(title)}`,
          true,
        );
        if (typeof response !== "string") continue;
        const body = response;
        const candidate = load(body);
        if (
          !candidate(`.infobox.${singular} .gamelink[data-id="${entity.id}"]`)
            .length
        )
          continue;
        await atomic(path, body);
        manifest.entries[kind][entity.id].title = title;
        console.log(`Resolved ${kind}/${entity.id}: ${title}`);
        break;
      }
    }
  await atomic(
    "data/wiki-pages.json",
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
if (!fetchOnly) {
  const { createWikiSnapshot } = await import("./wiki-details.mjs");
  const descriptionCorrections = await json(
    "data/wiki-descriptions.zh-CN.json",
  );
  const snapshot = await createWikiSnapshot({
    catalog,
    manifest,
    descriptionCorrections,
    reviews: await json("data/wiki-reviews.json"),
    readHtml: (kind, id) =>
      readFile(file(`data/wiki-cache/${kind}-${id}.html`), "utf8"),
  });
  const { attachWikiBranches } = await import("./wiki-branches.mjs");
  const branches = await attachWikiBranches({
    snapshot,
    manifest,
    config: await json("data/wiki-branches.json"),
    api: await json("data/wiki-branch-api.json"),
    reviews: await json("data/wiki-reviews.json"),
    readArticle: async (title) => {
      try {
        return await readFile(
          file(`data/wiki-cache/articles/${encodeURIComponent(title)}.html`),
          "utf8",
        );
      } catch {
        const original = Object.entries(manifest.entries.skills).find(
          ([, e]) => e.title === title,
        );
        if (!original)
          throw Error(`Missing cached Wiki branch article: ${title}`);
        return readFile(
          file(`data/wiki-cache/skills-${original[0]}.html`),
          "utf8",
        );
      }
    },
  });
  const { attachTraitModifiers } = await import("./wiki-trait-modifiers.mjs");
  const traitModifiers = await attachTraitModifiers({
    snapshot, catalog,
    config: await json("data/wiki-trait-modifiers.json"),
    readHtml: (kind,id) => readFile(file(`data/wiki-cache/${kind}-${id}.html`),"utf8"),
  });
  await mkdir(file("src/data/"), { recursive: true });
  await atomic(
    "data/wiki-audit.json",
    JSON.stringify(
      {
        schema: 1,
        generatedAt: snapshot.generatedAt,
        coverage: snapshot.professionCoverage,
        branchCoverage: snapshot.branchCoverage,
        branches,
        traitModifiers,
        entries: Object.fromEntries(
          Object.entries(snapshot.entries).map(([k, es]) => [
            k,
            Object.fromEntries(
              Object.entries(es).map(([id, e]) => [
                id,
                {
                  title: e.title,
                  revision: e.revision,
                  profession: e.profession,
                  identityVerified: e.identityVerified,
                  ...(e.identityIssue
                    ? { identityIssue: e.identityIssue }
                    : {}),
                  crossChecks: e.crossChecks || [],
                  withheld: e.withheld || [],
                  reviewedRows: e.reviewedRows || [],
                  skipped: e.skipped || [],
                },
              ]),
            ),
          ]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  if (
    snapshot.branchCoverage.skippedRows > 0 ||
    Object.values(snapshot.coverage).some((c) => c.skippedRows > 0)
  )
    throw Error(
      "Untranslated Wiki rows recorded in data/wiki-audit.json; existing runtime snapshots retained. Resolve and rerun --cached.",
    );
  await mkdir(file("src/data/wiki/"), { recursive: true });
  for (const p of catalog.professions.map((p) => p.id)) {
    const entries = Object.fromEntries(
      Object.entries(snapshot.entries).map(([k, es]) => [
        k,
        Object.fromEntries(
          Object.entries(es)
            .filter(([, e]) => e.profession === p)
            .map(([id, e]) => {
              const {
                crossChecks,
                skipped,
                withheld,
                reviewedRows,
                identityIssue,
                ...runtime
              } = e;
              return [id, runtime];
            }),
        ),
      ]),
    );
    await atomic(
      `src/data/wiki/${p.toLowerCase()}.json`,
      JSON.stringify({ entries }, null, 2) + "\n",
    );
  }
  const { entries: _entries, ...metadata } = snapshot;
  await atomic(
    "src/data/wiki-details.json",
    JSON.stringify(metadata, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      { profession, coverage: snapshot.professionCoverage[profession] },
      null,
      2,
    ),
  );
}
