import { readFile, writeFile } from "node:fs/promises";
import { load } from "cheerio";
import { openResearch, articleLinks } from "./wiki-research.mjs";
const root = new URL("../", import.meta.url);
const file = (p) => new URL(p, root);
const catalog = JSON.parse(await readFile(file("public/catalog.json"), "utf8"));
const audit = JSON.parse(await readFile(file("data/wiki-audit.json"), "utf8"));
const { read, manifest } = await openResearch();
let baseline;
try {
  baseline = JSON.parse(
    await readFile(file("data/wiki-research-baseline.json"), "utf8"),
  );
} catch {
  baseline = {
    schema: 1,
    identities: Object.entries(audit.entries.skills)
      .filter(([, e]) => !e.identityVerified)
      .map(([id, e]) => ({
        id: +id,
        profession: e.profession,
        title: e.title,
        issue: e.identityIssue,
      })),
    sic: Object.entries(audit.entries).flatMap(([kind, es]) =>
      Object.entries(es).flatMap(([id, e]) =>
        e.withheld.map((row) => ({
          kind,
          id: +id,
          profession: e.profession,
          title: e.title,
          revision: e.revision,
          ...row,
        })),
      ),
    ),
  };
  await writeFile(
    file("data/wiki-research-baseline.json"),
    JSON.stringify(baseline, null, 2) + "\n",
    "utf8",
  );
}
const report = { schema: 1, entries: {} };
const identity = (html) => {
  const $ = load(html);
  const box = $(".infobox.skill").first();
  const ids = [
    ...new Set(
      box
        .find('.gamelink[data-type="skill"]')
        .toArray()
        .map((n) => +$(n).attr("data-id")),
    ),
  ];
  return {
    ids,
    revision: +(html.match(/"wgRevisionId":(\d+)/)?.[1] || 0),
    canonical: html.match(/"wgPageName":"([^"]+)"/)?.[1],
  };
};
for (const target of baseline.identities) {
  const entity = catalog.skills.find((s) => s.id === target.id);
  const entry = manifest.entries.skills[target.id];
  const slug = entry.name.replaceAll(" ", "_");
  const indexes = [
    manifest.specNames?.[entity.specialization]?.replaceAll(" ", "_"),
    `List_of_${target.profession.toLowerCase()}_skills`,
  ].filter(Boolean);
  const evidence = [];
  const candidates = new Set([entry.title]);
  for (const index of indexes) {
    const html = await read(index);
    evidence.push({ title: index, ...identity(html) });
    for (const title of articleLinks(html))
      if (title === slug || title.startsWith(slug + "_("))
        candidates.add(title);
  }
  const ranked = [...candidates].sort(
    (a, b) =>
      Number(
        !a
          .toLowerCase()
          .includes(
            manifest.specNames?.[entity.specialization]?.toLowerCase() || "(",
          ),
      ) -
      Number(
        !b
          .toLowerCase()
          .includes(
            manifest.specNames?.[entity.specialization]?.toLowerCase() || "(",
          ),
      ),
  );
  const tried = [];
  let found;
  for (const title of ranked.slice(0, 12)) {
    const html = await read(title);
    const info = identity(html);
    tried.push({ title, ...info });
    if (!info.ids.includes(target.id)) continue;
    found = { title, revision: info.revision, indexes: evidence };
    entry.title = title;
    await writeFile(
      file(`data/wiki-cache/skills-${target.id}.html`),
      html,
      "utf8",
    );
    break;
  }
  report.entries[target.id] = {
    profession: target.profession,
    name: entity.name,
    originalTitle: target.title,
    status: found ? "exact-id-verified" : "identity-unconfirmed",
    ...(found ? { verified: found } : {}),
    indexes: evidence,
    candidates: tried,
  };
  await writeFile(
    file("data/wiki-identity-research.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    file("data/wiki-pages.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  console.log(
    `${target.profession}/${target.id}: ${found ? found.title : "unconfirmed; " + tried.map((e) => e.ids.join(",") || "no skill infobox").join(" | ")}`,
  );
}
