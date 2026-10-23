import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBuild, issues } from "../src/domain.ts";
import { mergeSkillCatalog } from "../src/weapon-skills.ts";
import {
  mergeMechanicCatalog,
  mechanicData,
  landPets,
  morphIds,
  emptyMechanicPreview,
  mechanicSlots,
  legendSkills,
} from "../src/profession-mechanics.ts";
import { petNaturalCommands } from "../src/pet-skills.ts";

const read = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const catalog = mergeMechanicCatalog(
  mergeSkillCatalog(
    read("../public/catalog.json"),
    read("../public/weapon-skills.json").skills,
  ),
);
assert.equal(mechanicData.schema, 1);
assert.equal(mechanicData.jadeCore.id, 96613);
assert.equal(mechanicData.jadeCore.vitality, 235);
assert.equal(
  new Set(catalog.skills.map((s) => s.id)).size,
  catalog.skills.length,
  "Duplicate supplemental skill IDs",
);
assert.equal(new Set(landPets.map((p) => p.id)).size, landPets.length);
assert.equal(morphIds.length, 7);
const skillIds = new Set(catalog.skills.map((s) => s.id));
for (const id of morphIds) assert.ok(skillIds.has(id), `Missing morph ${id}`);
for (const pet of landPets) {
  assert.ok(
    pet.name && pet.icon && pet.wikiUrl,
    `Missing pet identity ${pet.id}`,
  );
  assert.equal(pet.skills.length, 1, `Ambiguous land beast command ${pet.id}`);
  assert.equal(pet.mergedSkills.length, 3, `Missing merge skills ${pet.id}`);
  for (const id of [...pet.skills, ...pet.mergedSkills])
    assert.ok(skillIds.has(id), `Unresolved pet skill ${pet.id}/${id}`);
  assert.equal(
    petNaturalCommands(pet, catalog).length,
    2,
    `Missing natural commands ${pet.id}`,
  );
}
const legendSpecs: Record<string, number> = {
  Legend1: 52,
  Legend5: 63,
  Legend7: 69,
  Legend8: 79,
};
for (const legend of mechanicData.legends) {
  const b = createBuild("Revenant");
  b.specs[2].id = legendSpecs[legend.id] || null;
  b.mechanics = { legends: [legend.swap, null] };
  b.skills = legendSkills(legend.swap);
  assert.deepEqual(issues(b, catalog), [], `Invalid legend ${legend.id}`);
}
for (const spec of catalog.specs.filter((s) => s.elite)) {
  const b = createBuild(spec.profession);
  b.specs[2].id = spec.id;
  const slots = mechanicSlots(b, catalog, emptyMechanicPreview());
  assert.ok(slots.length >= 1 && slots.length <= 5, `Invalid slots ${spec.id}`);
  assert.equal(new Set(slots.map((s) => s.key)).size, slots.length);
}
console.log(
  `Mechanic references checked offline: ${landPets.length} land pets, ${morphIds.length} morphs, ${mechanicData.legends.length} legends; no Wiki/API requests.`,
);
