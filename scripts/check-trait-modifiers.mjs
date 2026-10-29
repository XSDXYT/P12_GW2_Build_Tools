import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { attachTraitModifiers } from "./wiki-trait-modifiers.mjs";

// Read-only, completely offline audit. The reviewed config is never seeded/reset.
const root = new URL("../", import.meta.url),
  file = (p) => new URL(p, root);
const json = async (path) => JSON.parse(await readFile(file(path), "utf8"));
const [catalog, config, metadata, audit] = await Promise.all([
  json("public/catalog.json"),
  json("data/wiki-trait-modifiers.json"),
  json("src/data/wiki-details.json"),
  json("data/wiki-audit.json"),
]);
const fragments = await Promise.all(
  metadata.professions.map((p) =>
    json(`src/data/wiki/${p.toLowerCase()}.json`),
  ),
);
const snapshot = {
  entries: Object.fromEntries(
    ["skills", "traits"].map((kind) => [
      kind,
      Object.assign({}, ...fragments.map((f) => f.entries[kind])),
    ]),
  ),
};
const expected = structuredClone(snapshot);
for (const entries of Object.values(snapshot.entries))
  for (const entry of Object.values(entries)) {
    delete entry.modifiers;
    for (const branch of entry.branches || []) delete branch.modifiers;
  }
const generated = await attachTraitModifiers({
  snapshot,
  config,
  catalog,
  readHtml: (kind, id) =>
    readFile(
      file(
        kind === "articles"
          ? `data/wiki-cache/articles/${encodeURIComponent(id)}.html`
          : `data/wiki-cache/${kind}-${id}.html`,
      ),
      "utf8",
    ),
});
for (const [kind, entries] of Object.entries(snapshot.entries))
  for (const [id, entry] of Object.entries(entries))
    assert.deepEqual(
      JSON.parse(JSON.stringify(entry)),
      expected.entries[kind][id],
      `Trait projections differ at ${kind}/${id}: run npm run data:wiki -- --cached`,
    );
assert.deepEqual(
  snapshot.modifierCoverage,
  metadata.modifierCoverage,
  "Modifier metadata differs",
);
assert.deepEqual(
  snapshot.traitDurationBonuses,
  metadata.traitDurationBonuses,
  "Duration metadata differs",
);
assert.deepEqual(generated, audit.traitModifiers, "Modifier audit differs");
const coverage = {};
for (const p of config.professions) {
  const ids = new Set(
    catalog.traits
      .filter(
        (t) =>
          catalog.specs.find((s) => s.id === t.specialization)?.profession ===
          p,
      )
      .map((t) => t.id),
  );
  const rules = generated.rules.filter((r) => ids.has(r.trait));
  const durations = generated.durations.filter((r) => ids.has(r.trait));
  coverage[p] = {
    rules: rules.length,
    targets: new Set(rules.map((r) => r.target)).size,
    traits: new Set([...rules, ...durations].map((r) => r.trait)).size,
    durationTraits: durations.length,
  };
}
console.log(
  JSON.stringify({ coverage, summary: snapshot.modifierCoverage }, null, 2),
);
