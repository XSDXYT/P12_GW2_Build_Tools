import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const allowed = {
  traits: new Set(["tier", "slot", "specialization"]),
  skills: new Set(["professions", "slot", "type", "weapon_type", "attunement"]),
};
const professionNames = new Set([
  "Guardian",
  "Warrior",
  "Engineer",
  "Ranger",
  "Thief",
  "Elementalist",
  "Mesmer",
  "Necromancer",
  "Revenant",
]);
export const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const equal = (field, a, b) =>
  isDeepStrictEqual(
    field === "professions" && Array.isArray(a) ? [...a].sort() : a,
    field === "professions" && Array.isArray(b) ? [...b].sort() : b,
  );

export function validateStructure(evidence, revisions) {
  if (evidence.schema !== 1 || !evidence.entries || !evidence.specNames)
    throw Error("Invalid Wiki structure schema");
  for (const [kind, entries] of Object.entries(evidence.entries)) {
    if (!allowed[kind]) throw Error(`Unsupported Wiki structure kind: ${kind}`);
    for (const [key, entry] of Object.entries(entries)) {
      const ref = revisions[kind]?.[key];
      if (
        entry.id !== Number(key) ||
        !Number.isSafeInteger(entry.id) ||
        entry.id <= 0 ||
        !ref?.identityVerified ||
        !Number.isSafeInteger(entry.revision) ||
        entry.revision <= 0 ||
        ref.revision !== entry.revision ||
        ref.title !== entry.title
      )
        throw Error(`Stale or unverified Wiki structure: ${kind}/${key}`);
      const expectedUrl = `https://wiki.guildwars2.com/wiki/${encodeURIComponent(entry.title)}?oldid=${entry.revision}`;
      if (entry.url !== expectedUrl || !Object.keys(entry.values).length)
        throw Error(`Invalid Wiki structure source: ${kind}/${key}`);
      for (const [field, value] of Object.entries(entry.values)) {
        if (!allowed[kind].has(field) || !entry.evidence[field]?.trim())
          throw Error(
            `Unsupported or unevidenced Wiki field: ${kind}/${key}/${field}`,
          );
        let valid = false;
        if (field === "tier")
          valid = Number.isInteger(value) && value >= 0 && value <= 3;
        else if (field === "specialization")
          valid =
            Number.isSafeInteger(value) && Boolean(evidence.specNames[value]);
        else if (field === "professions")
          valid =
            Array.isArray(value) &&
            value.length > 0 &&
            new Set(value).size === value.length &&
            value.every((p) => professionNames.has(p));
        else if (field === "slot" && kind === "traits")
          valid = ["Minor", "Major"].includes(value);
        else if (["slot", "type"].includes(field))
          valid = ["Heal", "Utility", "Elite"].includes(value);
        else if (field === "attunement")
          valid = ["Fire", "Water", "Air", "Earth"].includes(value);
        else if (field === "weapon_type")
          valid = [
            "Axe",
            "Dagger",
            "Mace",
            "Pistol",
            "Scepter",
            "Sword",
            "Focus",
            "Shield",
            "Torch",
            "Warhorn",
            "Greatsword",
            "Hammer",
            "Longbow",
            "Shortbow",
            "Rifle",
            "Staff",
            "Spear",
            "Trident",
            "Harpoon",
            "Speargun",
          ].includes(value);
        if (!valid)
          throw Error(`Invalid Wiki field value: ${kind}/${key}/${field}`);
      }
    }
  }
}

export function reconcileStructure(
  input,
  { dataset, evidence, reviews, revisions },
) {
  if (!["catalog", "weapons", "attributes"].includes(dataset))
    throw Error("Unknown source dataset");
  validateStructure(evidence, revisions);
  if (reviews.schema !== 1 || !Array.isArray(reviews.rules))
    throw Error("Invalid structure reviews");
  const rules = new Map();
  for (const rule of reviews.rules) {
    const entry = evidence.entries[rule.kind]?.[rule.id];
    const key = `${rule.kind}/${rule.id}/${rule.field}`;
    if (
      rules.has(key) ||
      !entry ||
      !Object.hasOwn(entry.values, rule.field) ||
      entry.revision !== rule.revision ||
      !equal(rule.field, entry.values[rule.field], rule.wikiValue) ||
      !Object.hasOwn(rule, "apiValue") ||
      !rule.reason?.trim()
    )
      throw Error(`Invalid or stale structure review: ${key}`);
    rules.set(key, rule);
  }
  const output = structuredClone(input);
  const rows = [];
  const conflicts = [];
  const overrides = [];
  const previous = new Map();
  for (const override of input.sourcePolicy?.overrides || []) {
    const key = `${override.kind}/${override.id}/${override.field}`;
    if (previous.has(key)) throw Error(`Duplicate retained API value: ${key}`);
    previous.set(key, override);
  }
  let apiOnlyEntities = 0;
  for (const kind of ["traits", "skills"]) {
    if (!Array.isArray(output[kind])) continue;
    const ids = new Set();
    for (const entity of output[kind]) {
      if (
        !Number.isSafeInteger(entity.id) ||
        entity.id <= 0 ||
        ids.has(entity.id)
      )
        throw Error(`Invalid or duplicate API identity: ${kind}/${entity.id}`);
      ids.add(entity.id);
      const entry = evidence.entries[kind][entity.id];
      if (!entry) {
        apiOnlyEntities++;
        continue;
      }
      for (const [field, wikiValue] of Object.entries(entry.values)) {
        const key = `${kind}/${entity.id}/${field}`;
        const retained = previous.get(key);
        previous.delete(key);
        if (
          retained &&
          (!Object.hasOwn(retained, "wikiValue") ||
            !Number.isSafeInteger(retained.revision) ||
            retained.revision <= 0 ||
            !equal(field, entity[field], retained.wikiValue))
        )
          throw Error(`Changed previously resolved structure: ${key}`);
        const apiValue = retained ? retained.apiValue : entity[field];
        const rule = rules.get(key);
        let status;
        if (equal(field, apiValue, wikiValue)) status = "confirmed";
        else if (apiValue === undefined || (retained && retained.apiMissing))
          status = "wiki-filled";
        else if (rule && equal(field, apiValue, rule.apiValue))
          status = "wiki-corrected";
        else {
          status = "needs-review";
          conflicts.push(key);
        }
        if (status !== "needs-review") {
          if (status !== "confirmed")
            entity[field] = structuredClone(wikiValue);
          if (status !== "confirmed")
            overrides.push({
              kind,
              id: entity.id,
              field,
              wikiValue: structuredClone(wikiValue),
              revision: entry.revision,
              ...(apiValue === undefined ? { apiMissing: true } : { apiValue }),
            });
        }
        rows.push({
          kind,
          id: entity.id,
          field,
          status,
          ...(apiValue === undefined ? { apiMissing: true } : { apiValue }),
          wikiValue,
          url: entry.url,
          revision: entry.revision,
        });
      }
    }
  }
  if (previous.size)
    throw Error(
      `Missing evidence for retained API values: ${[...previous.keys()].join(",")}`,
    );
  // Never let a per-trait correction silently disagree with its parent line.
  if (dataset === "catalog") {
    const byId = new Map(output.traits.map((t) => [t.id, t]));
    for (const spec of output.specs) {
      for (const [field, slot] of [
        ["minor_traits", "Minor"],
        ["major_traits", "Major"],
      ]) {
        const positions = new Set();
        for (const id of spec[field] || []) {
          const trait = byId.get(id);
          if (!trait || trait.specialization !== spec.id || trait.slot !== slot)
            conflicts.push(`specs/${spec.id}/${field}/${id}`);
          if (!trait) continue;
          const validTier =
            Number.isInteger(trait.tier) &&
            trait.tier <= 3 &&
            trait.tier >= (slot === "Major" ? 1 : 0);
          const validOrder =
            slot !== "Major" ||
            (Number.isInteger(trait.order) &&
              trait.order >= 0 &&
              trait.order <= 2);
          const position =
            slot === "Major" ? `${trait.tier}/${trait.order}` : `${trait.tier}`;
          if (!validTier || !validOrder || positions.has(position))
            conflicts.push(`specs/${spec.id}/${field}/${id}/position`);
          positions.add(position);
        }
      }
    }
    const specs = new Map(output.specs.map((s) => [s.id, s]));
    for (const trait of output.traits) {
      const field = trait.slot === "Major" ? "major_traits" : "minor_traits";
      const spec = specs.get(trait.specialization);
      // Elite weapon proficiencies are tier-0 minors, not members of the
      // three fixed minor_traits slots returned by /specializations.
      const proficiency =
        spec?.elite && trait.slot === "Minor" && trait.tier === 0;
      if (!proficiency && !spec?.[field]?.includes(trait.id))
        conflicts.push(`traits/${trait.id}/parent`);
    }
    const statIds = new Set(output.stats.map((s) => s.id));
    for (const ids of Object.values(output.statChoices || {}))
      if (!Array.isArray(ids) || ids.some((id) => !statIds.has(id)))
        throw Error("Invalid API stat choice identities");
  }
  const summary = {
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    filled: rows.filter((r) => r.status === "wiki-filled").length,
    corrected: rows.filter((r) => r.status === "wiki-corrected").length,
    conflicts: conflicts.length,
    apiOnlyEntities,
  };
  output.sourcePolicy = {
    schema: 1,
    structure: "api-with-reviewed-wiki",
    effects: "wiki-pve-first",
    evidenceDigest: digest(evidence),
    summary,
    overrides,
  };
  const audit = {
    schema: 1,
    dataset,
    evidenceDigest: digest(evidence),
    summary,
    conflicts,
    rows,
  };
  return { output, audit };
}
