import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
const cached = process.argv.includes("--cached");
const cachePath = "data/weapon-skill-cache/api.json";
const catalog = JSON.parse(await readFile("public/catalog.json", "utf8"));
const fragments = await Promise.all(
  catalog.professions.map(async (p) =>
    JSON.parse(
      await readFile(`src/data/wiki/${p.id.toLowerCase()}.json`, "utf8"),
    ),
  ),
);
const branches = fragments.flatMap((f) =>
  Object.values(f.entries.skills).flatMap((e) => e.branches || []),
);
const roots = [
  ...new Set([
    ...catalog.professions.flatMap((p) =>
      Object.values(p.weapons).flatMap((w) => w.skills.map((s) => s.id)),
    ),
    ...catalog.skills
      .flatMap((s) => [s.next_chain, s.flip_skill])
      .filter(Boolean),
    ...branches.map((b) => b.id),
    73076,
    72904,
  ]),
];
let cache;
try {
  cache = JSON.parse(await readFile(cachePath, "utf8"));
} catch {
  cache = { en: {}, zh: {} };
}
if (process.argv.includes("--refresh")) {
  if (cached) throw Error("--cached and --refresh are mutually exclusive");
  cache = { en: {}, zh: {} };
}
for (const lang of ["en", "zh"]) {
  const entries = cache[lang];
  let pending = roots;
  const visited = new Set();
  while (pending.length) {
    const batchIds = [...new Set(pending)].filter((id) => !visited.has(id));
    if (!batchIds.length) break;
    for (const id of batchIds) visited.add(id);
    const missing = batchIds.filter((id) => !entries[id]);
    if (cached && missing.length)
      throw Error(`Missing cached ${lang} skills: ${missing.join(",")}`);
    for (let offset = 0; offset < missing.length; offset += 180) {
      const ids = missing.slice(offset, offset + 180);
      const response = await fetch(
        `https://api.guildwars2.com/v2/skills?ids=${ids.join(",")}&lang=${lang}`,
        {
          headers: {
            "User-Agent": "P12-GW2-Build-Tools/0.0005 (skill data sync)",
          },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok)
        throw Error(`API ${response.status}; snapshot unchanged`);
      const records = await response.json();
      if (
        !Array.isArray(records) ||
        ids.some((id) => !records.some((s) => s.id === id))
      )
        throw Error("Incomplete API identities");
      for (const skill of records) entries[skill.id] = skill;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    pending = batchIds
      .flatMap((id) => [
        entries[id].next_chain,
        entries[id].prev_chain,
        entries[id].flip_skill,
      ])
      .filter(Boolean);
  }
}
if (!cached) cache.fetchedAt = new Date().toISOString();
await mkdir("data/weapon-skill-cache", { recursive: true });
await writeFile(cachePath, JSON.stringify(cache));
const skills = Object.values(cache.zh)
  .sort((a, b) => a.id - b.id)
  .map((skill) => {
    if (cache.en[skill.id]?.id !== skill.id || !skill.name || !skill.icon)
      throw Error(`Invalid bilingual identity ${skill.id}`);
    return { ...skill, englishName: cache.en[skill.id].name };
  });
const output = {
  schema: 1,
  fetchedAt: cache.fetchedAt,
  source: "https://api.guildwars2.com/v2/skills",
  skills,
};
await writeFile("public/weapon-skills.json.tmp", JSON.stringify(output));
await rename("public/weapon-skills.json.tmp", "public/weapon-skills.json");
console.log(
  `Weapon and related skills: ${skills.length}; all ${roots.length} roots verified`,
);
