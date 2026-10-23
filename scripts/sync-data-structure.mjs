import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseWikiStructure } from "./wiki-structure.mjs";
import { reconcileStructure } from "./data-source-policy.mjs";
import {
  atomicJson,
  loadSourcePolicy,
  loadWikiRevisions,
} from "./data-source-io.mjs";

const root = new URL("../", import.meta.url);
const file = (path) => fileURLToPath(new URL(path, root));
const json = async (path) => JSON.parse(await readFile(file(path), "utf8"));
const check = process.argv.includes("--check");
const rebuild = process.argv.includes("--rebuild");
if (check && rebuild)
  throw Error("--check and --rebuild are mutually exclusive");
const catalog = await json("public/catalog.json");
let policy;
let extraction;
if (rebuild) {
  const [manifest, reviews, revisions] = await Promise.all([
    json("data/wiki-pages.json"),
    json("data/structure-reviews.json"),
    loadWikiRevisions(catalog.professions),
  ]);
  const evidence = {
    schema: 1,
    specNames: manifest.specNames,
    entries: { traits: {}, skills: {} },
  };
  const skipped = [];
  for (const kind of ["traits", "skills"])
    for (const [id, entry] of Object.entries(revisions[kind])) {
      if (!entry.identityVerified) {
        skipped.push({ kind, id: Number(id), reason: "unverified-identity" });
        continue;
      }
      const html = await readFile(
        file(`data/wiki-cache/${kind}-${id}.html`),
        "utf8",
      );
      const parsed = parseWikiStructure(html, {
        kind,
        id: Number(id),
        title: entry.title,
        revision: entry.revision,
        specNames: manifest.specNames,
      });
      if (parsed.skipped || !Object.keys(parsed.values || {}).length)
        skipped.push({
          kind,
          id: Number(id),
          reason: parsed.skipped || "no-explicit-fields",
        });
      else evidence.entries[kind][id] = parsed;
    }
  policy = { evidence, reviews, revisions };
  extraction = { schema: 1, skipped };
} else policy = await loadSourcePolicy();

// Validate every output before replacing any snapshot. This command performs
// no network requests, including --rebuild; absent caches must be acquired by
// the existing Wiki collector under its normal rate/robots policy.
const results = [];
for (const [dataset, path] of [
  ["catalog", "public/catalog.json"],
  ["weapons", "public/weapon-skills.json"],
  ["attributes", "public/attribute-data.json"],
]) {
  const input = dataset === "catalog" ? catalog : await json(path);
  const result = reconcileStructure(input, { ...policy, dataset });
  results.push({ dataset, path, ...result });
}
const conflicts = results.flatMap((r) =>
  r.audit.conflicts.map((key) => `${r.dataset}:${key}`),
);
if (conflicts.length) {
  if (!check)
    for (const r of results)
      await atomicJson(file(`data/source-audit/${r.dataset}.json`), r.audit);
  throw Error(
    `Review Wiki/API conflicts before updating snapshots: ${conflicts.join(", ")}`,
  );
}
if (check) {
  for (const result of results) {
    const input = await json(result.path);
    if (JSON.stringify(input) !== JSON.stringify(result.output))
      throw Error(
        `Stale source policy metadata; run npm run data:structure: ${result.path}`,
      );
  }
} else {
  if (rebuild) {
    await atomicJson(file("data/wiki-structure.json"), policy.evidence);
    await atomicJson(file("data/source-audit/extraction.json"), extraction);
  }
  for (const result of results) {
    await atomicJson(
      file(`data/source-audit/${result.dataset}.json`),
      result.audit,
    );
    await atomicJson(file(result.path), result.output);
  }
}
console.log(
  JSON.stringify(
    {
      check,
      rebuilt: rebuild,
      datasets: Object.fromEntries(
        results.map((r) => [r.dataset, r.audit.summary]),
      ),
    },
    null,
    2,
  ),
);
