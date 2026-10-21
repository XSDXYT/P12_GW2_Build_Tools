import { readFile, writeFile } from "node:fs/promises";
import { load } from "cheerio";
import { openResearch } from "./wiki-research.mjs";
const root = new URL("../", import.meta.url),
  file = (p) => new URL(p, root);
const profession = process.argv[2];
const { read, manifest } = await openResearch();
const catalog = JSON.parse(await readFile(file("public/catalog.json"), "utf8"));
const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(file(p), "utf8"));
  } catch {
    return fallback;
  }
};
const result = await readJson("data/wiki-branches.json", {
  schema: 1,
  parents: {},
  pages: {},
  issues: [],
});
const api = await readJson("data/wiki-branch-api.json", { en: {}, zh: {} });
const revision = (html) => Number(html.match(/"wgRevisionId":(\d+)/)?.[1]) || 0;
const titleOf = (a) => decodeURIComponent(a.split("#")[0].slice(6));
function currentContent(html) {
  const $ = load(html),
    content = $(".mw-parser-output");
  // The article's present skill tables only. No version history or navboxes.
  content.find(".nav,.navbox,.toc,.infobox").remove();
  const history = content
    .children("h2")
    .filter((_, e) => $(e).find("#Version_history,#History").length)
    .first();
  if (history.length) history.nextAll().add(history).remove();
  return { $, content };
}
function skillLinks(html) {
  const { $, content } = currentContent(html),
    out = [];
  content.find("table").each((_, table) => {
    const headers = $(table)
      .find("tr")
      .first()
      .children("th")
      .map((_, e) => $(e).text().trim())
      .get();
    const skillColumn = headers.indexOf("Skill");
    if (skillColumn < 0 || !headers.includes("Description")) return;
    let condition = "",
      requiresTrait;
    $(table)
      .find("tr")
      .slice(1)
      .each((_, tr) => {
        const cells = $(tr).children("td");
        if (!cells.length) {
          const t = $(tr).text().trim();
          if (t) condition = t;
          return;
        }
        if (cells.length === 1 && Number(cells.attr("colspan")) > 1) {
          const text = $(tr).text().replace(/\s+/g, " ").trim();
          if (/^With\b/.test(text)) {
            const titles = $(tr)
              .find('a[href^="/wiki/"]')
              .toArray()
              .map((a) => titleOf($(a).attr("href")));
            requiresTrait =
              Number(
                Object.entries(manifest.entries.traits).find(([, e]) =>
                  titles.includes(e.title),
                )?.[0],
              ) || "unknown";
          }
          return;
        }
        const a = cells.eq(skillColumn).find('a[href^="/wiki/"]').first();
        if (!a.length) return;
        const title = titleOf(a.attr("href"));
        const heading = $(table).prevAll("h2,h3").first().text();
        const mode = /Aquatic|Underwater/i.test(heading + " " + condition)
          ? "水下"
          : /Terrestrial/i.test(heading + " " + condition)
            ? "陆地"
            : "";
        // Conditional trait skills remain hidden until an explicit trait gate exists.
        const gate = requiresTrait;
        requiresTrait = undefined;
        if (gate === "unknown" || /With |trait/i.test(condition)) return;
        if (
          !out.some(
            (e) =>
              e.title === title &&
              (e.context || "") === mode &&
              e.requiresTrait === gate,
          )
        )
          out.push({
            title,
            ...(mode ? { context: mode } : {}),
            ...(gate ? { requiresTrait: gate } : {}),
          });
      });
  });
  return out;
}
const parents = catalog.skills.filter(
  (s) =>
    s.professions?.includes(profession) &&
    (s.subskills?.length ||
      s.transform_skills?.length ||
      s.bundle_skills?.length ||
      s.categories?.includes("Minion") ||
      [30792, 62567, 77238, 42938].includes(s.id)),
);
if (!parents.length) {
  console.log(`${profession}: no new linked branches in this batch`);
  process.exit(0);
}
for (const parent of parents) {
  const info = manifest.entries.skills[parent.id];
  if (!info) continue;
  const html = await read(info.title),
    $ = load(html);
  const sources = [{ title: info.title, revision: revision(html) }];
  let links = skillLinks(html);
  // Elixir X explicitly links its random outcomes; its API transform list is incomplete.
  const extraTitles =
    parent.id === 5832
      ? ["Rampage", "Tornado", "Whirlpool"]
      : parent.id === 42938
        ? ["Photon_Forge"]
        : [];
  for (const title of extraTitles) {
    if (
      !$(".mw-parser-output a")
        .toArray()
        .some((n) => $(n).attr("href") === `/wiki/${title}`)
    )
      throw Error(`Missing parent link: ${parent.id}/${title}`);
    const extra = await read(title);
    sources.push({ title, revision: revision(extra) });
    const children = skillLinks(extra);
    if (!children.length && load(extra)(".infobox.skill").length)
      children.push({ title, context: "水下" });
    links.push(
      ...children.map((e) => ({
        ...e,
        context: [
          {
            Rampage: "怒神附体",
            Tornado: "飓风形态",
            Whirlpool: "漩涡形态",
            Photon_Forge: "光子熔炉",
          }[title],
          e.context,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    );
  }
  if (parent.categories?.includes("Minion")) {
    const box = $(".infobox.skill").first();
    box.find("dd").each((_, dd) => {
      if (!$(dd).find(`a[href="/wiki/${info.title}"]`).length) return;
      for (const a of $(dd).find('a[href^="/wiki/"]').toArray()) {
        const title = titleOf($(a).attr("href"));
        if (title !== info.title && !links.some((e) => e.title === title))
          links.push({ title, context: "召唤物指令" });
      }
    });
  }
  const branches = [];
  for (const link of links) {
    if (
      link.title === info.title ||
      /Leave_Transform|Return|Exit/.test(link.title)
    )
      continue;
    if (
      link.title.startsWith("Glyph_of_") &&
      !parent.categories?.includes("Glyph")
    )
      continue;
    const body = await read(link.title),
      child = load(body);
    const ids = [
      ...new Set(
        child('.infobox.skill .gamelink[data-type="skill"]')
          .toArray()
          .map((n) => +child(n).attr("data-id")),
      ),
    ];
    if (!ids.length) {
      result.issues.push({
        parent: parent.id,
        title: link.title,
        reason: "No skill ID on linked page",
      });
      continue;
    }
    const id = ids[0];
    const sub = parent.subskills?.find((e) => ids.includes(e.id));
    const relatedIds = [
      parent.flip_skill,
      ...(parent.transform_skills || []),
      ...(parent.bundle_skills || []),
    ].filter(Boolean);
    const chosen =
      sub?.id ?? relatedIds.find((expected) => ids.includes(expected)) ?? id;
    result.pages[link.title] = { id: chosen, ids, revision: revision(body) };
    const form = sub?.attunement
      ? {
          Fire: "火焰协调",
          Water: "流水协调",
          Air: "空气协调",
          Earth: "大地协调",
        }[sub.attunement]
      : sub
        ? sub.form === "CelestialAvatar"
          ? "天界化身形态"
          : "非天界化身形态"
        : undefined;
    if (link.title === "Deactivate_Photon_Forge_(hot)")
      link.context += " · 满热量";
    if (link.title === "Deactivate_Photon_Forge") link.context += " · 未满热量";
    branches.push({
      ...link,
      id: chosen,
      ...(form ? { context: form } : {}),
      ...(parent.id === 29519 ? { audience: "变形目标" } : {}),
    });
  }
  result.parents[parent.id] = {
    profession,
    revision: revision(html),
    sources,
    branches,
  };
  await writeFile(
    file("data/wiki-branches.json"),
    JSON.stringify(result, null, 2) + "\n",
    "utf8",
  );
  console.log(`${profession}/${parent.id}: ${branches.length} branches`);
}
const usedTitles = new Set(
  Object.values(result.parents).flatMap((p) => p.branches.map((b) => b.title)),
);
result.pages = Object.fromEntries(
  Object.entries(result.pages).filter(([title]) => usedTitles.has(title)),
);
await writeFile(
  file("data/wiki-branches.json"),
  JSON.stringify(result, null, 2) + "\n",
  "utf8",
);
const ids = [...new Set(Object.values(result.pages).map((p) => p.id))];
for (const lang of ["en", "zh"]) {
  const missing = ids.filter((id) => !api[lang][id]);
  for (let i = 0; i < missing.length; i += 150) {
    const response = await fetch(
      `https://api.guildwars2.com/v2/skills?ids=${missing.slice(i, i + 150).join(",")}&lang=${lang}`,
      { signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok) throw Error(`API ${response.status}`);
    for (const skill of await response.json()) api[lang][skill.id] = skill;
    await writeFile(
      file("data/wiki-branch-api.json"),
      JSON.stringify(api, null, 2) + "\n",
      "utf8",
    );
  }
}
console.log(`${profession}: cached linked pages and bilingual API identities`);
