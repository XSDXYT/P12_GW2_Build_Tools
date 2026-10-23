import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { load } from "cheerio";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const file = (name) => new URL(name, root);
const cache = "data/weapon-skill-cache/profession-mechanics/";
const cached = process.argv.includes("--cached");
const refresh = process.argv.includes("--refresh");
if (cached && refresh)
  throw Error("--cached and --refresh are mutually exclusive");
await fs.mkdir(file(cache), { recursive: true });
const json = async (name) => JSON.parse(await fs.readFile(file(name), "utf8"));
async function api(kind, lang, ids = "all") {
  const key = `${kind}-${lang}${ids === "all" ? "" : "-" + createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 20)}.json`;
  if (!refresh && existsSync(file(cache + key))) return json(cache + key);
  if (cached) throw Error(`Missing cached response: ${key}`);
  const response = await fetch(
    `https://api.guildwars2.com/v2/${kind}?ids=${ids === "all" ? ids : ids.join(",")}&lang=${lang}`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok)
    throw Error(`API ${kind} HTTP ${response.status}; no retry`);
  const value = await response.json();
  if (!Array.isArray(value) || (ids !== "all" && value.length !== ids.length))
    throw Error(`Incomplete ${kind} response`);
  await fs.writeFile(file(cache + key), JSON.stringify(value, null, 2) + "\n");
  return value;
}
const catalog = await json("public/catalog.json");
const weapons = await json("public/weapon-skills.json");
const petsEN = await api("pets", "en");
const petsZH = await api("pets", "zh");
const legends = await api("legends", "en");
const known = new Set([...catalog.skills, ...weapons.skills].map((s) => s.id));
const seeds = new Set([
  ...catalog.skills.filter((s) => s.type === "Profession").map((s) => s.id),
  ...catalog.skills.flatMap((s) =>
    s.toolbelt_skill ? [s.toolbelt_skill] : [],
  ),
  ...catalog.traits.flatMap((t) => (t.skills || []).map((s) => s.id)),
  ...petsEN.flatMap((p) => p.skills.map((s) => s.id)),
  ...legends.flatMap((l) => [l.swap, l.heal, l.elite, ...l.utilities]),
  63067,
  63155,
]);
seeds.delete(0);
const en = new Map(),
  zh = new Map();
for (let depth = 0; depth < 4; depth++) {
  const todo = [...seeds].filter((id) => !en.has(id)).sort((a, b) => a - b);
  if (!todo.length) break;
  for (let i = 0; i < todo.length; i += 150) {
    const ids = todo.slice(i, i + 150);
    for (const s of await api("skills", "en", ids)) en.set(s.id, s);
    for (const s of await api("skills", "zh", ids)) zh.set(s.id, s);
  }
  for (const s of en.values())
    for (const id of [
      s.flip_skill,
      s.next_chain,
      s.toolbelt_skill,
      ...(s.bundle_skills || []),
      ...(s.transform_skills || []),
    ].filter(Boolean))
      seeds.add(id);
}
const core = (await api("items", "zh", [96613]))[0];
const evidence = [];
async function article(title) {
  const html = await fs.readFile(
    file(`data/wiki-cache/articles/${title}.html`),
    "utf8",
  );
  const revision = Number(html.match(/"wgRevisionId":(\d+)/)?.[1]);
  if (!revision || !html.includes("mw-parser-output"))
    throw Error(`Unverified Wiki cache: ${title}`);
  evidence.push({
    title,
    revision,
    url: `https://wiki.guildwars2.com/wiki/${title}?oldid=${revision}`,
  });
  return load(html);
}
const $ = await article("Soulbeast");
const archetypes = ["Stout", "Deadly", "Versatile", "Ferocious", "Supportive"];
const petMeta = new Map();
const archTable = $("table")
  .filter(
    (_, table) =>
      $(table).text().includes("Attribute Bonus") &&
      $(table).text().includes("Archetype"),
  )
  .first();
archTable
  .find("tr")
  .slice(3)
  .each((_, row) => {
    const family = $(row).children("th").first().text().trim();
    $(row)
      .children("td")
      .each((index, cell) => {
        $(cell)
          .find('a[href^="/wiki/Juvenile_"]')
          .each((_, a) => {
            const title = decodeURIComponent(
              $(a).attr("href").slice(6),
            ).replaceAll("_", " ");
            petMeta.set(title, { family, archetype: archetypes[index] });
          });
      });
  });
// New Castora species: official Wiki pet infobox/merged-skill tables reviewed
// 2026-10-23 via the readable search index. Do not infer their family from API order.
petMeta.set("Juvenile River Otter", {
  family: "River Otter",
  archetype: "Supportive",
});
petMeta.set("Juvenile Ley Vampire Bat", {
  family: "Ley Vampire Bat",
  archetype: "Versatile",
});
for (const title of [
  "Juvenile_River_Otter",
  "Juvenile_Ley_Vampire_Bat",
  "Juvenile_Raptor_Swiftwing",
  "Power_Core",
])
  evidence.push({
    title,
    url: `https://wiki.guildwars2.com/wiki/${title}`,
    reviewedAt: "2026-10-23",
    access: "official-wiki-search-index",
  });
const families = {
  Bear: [43136, 43060],
  Bird: [44991, 42042],
  Canine: [43726, 42894],
  Devourer: [43068, 41461],
  Drake: [41537, 41575],
  Feline: [40625, 44514],
  Moa: [44617, 43548],
  Porcine: [41406, 46432],
  Spider: [44097, 43671],
  Wyvern: [46386, 41908],
  Phoenix: [64038, 41908],
  Bristleback: [41206, 45479],
  Smokescale: [42907, 40255],
  "Fanged Iboga": [44384, 40111],
  Jacaranda: [43788, 43701],
  "Rock Gazelle": [41524, 45743],
  "Siege Turtle": [64699, 66258],
  "Aether Hunter": [71282, 70889],
  "Sky-Chak Striker": [71499, 71546],
  Spinegazer: [72851, 72636],
  Warclaw: [73733, 73938],
  "Janthiri Bee": [75771, 75814],
  "River Otter": [80035, 80031],
  "Ley Vampire Bat": [81024, 80985],
};
const beastByArch = {
  Stout: 45797,
  Deadly: 40588,
  Versatile: 43375,
  Ferocious: 42809,
  Supportive: 44626,
};
const specialFamily = {
  46: "Smokescale",
  48: "Wyvern",
  51: "Wyvern",
  52: "Bristleback",
  57: "Jacaranda",
  59: "Rock Gazelle",
  61: "Fanged Iboga",
  65: "Phoenix",
  66: "Siege Turtle",
  67: "Aether Hunter",
  68: "Sky-Chak Striker",
  69: "Spinegazer",
  70: "Warclaw",
  71: "Janthiri Bee",
};
const aquatic = new Set([21, 40, 41, 42, 43]);
const pets = petsEN
  .filter((p) => !aquatic.has(p.id))
  .map((p) => {
    const z = petsZH.find((z) => z.id === p.id);
    const meta = petMeta.get(p.name);
    if (!meta?.archetype || !z)
      throw Error(`Missing reviewed pet identity: ${p.name}`);
    let family =
      specialFamily[p.id] ||
      { Avian: "Bird", Ursine: "Bear" }[meta.family] ||
      meta.family;
    if (family === "Unique") family = p.name.replace("Juvenile ", "");
    let merged = families[family];
    if (p.id === 63) merged = [40625, 67382];
    if (p.id === 72) merged = [79203, 78091];
    // Wallow has its own merged attacks rather than the porcine pair.
    if (p.id === 64) merged = [41406, 64882];
    let beastSkills = p.skills.map((s) => en.get(s.id)).filter(Boolean);
    if (beastSkills.length > 1) {
      const landOnly = beastSkills.filter((s) =>
        s.flags?.includes("NoUnderwater"),
      );
      if (landOnly.length !== 1)
        throw Error(`Ambiguous land pet skill: ${p.name}`);
      beastSkills = landOnly;
    }
    return {
      id: p.id,
      name: z.name,
      englishName: p.name,
      icon: p.icon,
      description: z.description,
      family,
      archetype: meta.archetype,
      skills: beastSkills.map((s) => s.id),
      mergedSkills: merged ? [...merged, beastByArch[meta.archetype]] : [],
      wikiUrl: `https://wiki.guildwars2.com/wiki/${p.name.replaceAll(" ", "_")}`,
    };
  });
await article("Amalgam");
await article("Evoker");
const morphIds = catalog.traits
  .find((t) => t.id === 2377)
  .skills.filter((s) => s.id !== 76642)
  .map((s) => s.id);
if (morphIds.length !== 7 || new Set(morphIds).size !== 7)
  throw Error("Expected seven reviewed morph choices");
const petSkillIds = new Set(pets.flatMap((p) => p.skills));
const skills = [...zh.values()]
  .filter((s) => !known.has(s.id))
  .map((s) => ({
    ...s,
    englishName: en.get(s.id).name,
    detailOnly: true,
    ...(petSkillIds.has(s.id) ? { mechanicActor: "pet" } : {}),
  }));
const output = {
  schema: 1,
  source: "https://api.guildwars2.com/v2",
  wikiEvidence: evidence,
  pets,
  morphIds,
  legends,
  jadeCore: {
    ...core,
    englishName: "Jade Bot Core: Tier 10",
    vitality: 235,
    wikiUrl: "https://wiki.guildwars2.com/wiki/Power_Core",
  },
  skillNames: Object.fromEntries([...en.values()].map((s) => [s.id, s.name])),
  skills,
};
const temp = file("src/data/profession-mechanics.json.tmp");
await fs.writeFile(temp, JSON.stringify(output, null, 2) + "\n");
await fs.rename(temp, file("src/data/profession-mechanics.json"));
console.log(
  `Mechanic snapshot: ${pets.length} land pets, ${skills.length} supplemental skills, ${morphIds.length} morphs; Wiki caches retained.`,
);
