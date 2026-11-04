const attributes = new Set([
  "Power",
  "Precision",
  "Toughness",
  "Vitality",
  "CritDamage",
  "ConditionDamage",
  "ConditionDuration",
  "BoonDuration",
  "Healing",
]);
const gates = new Set([
  "fury",
  "quickness",
  "fire",
  "air",
  "regeneration",
  "alacrity",
  "targetBurning",
  "targetBleeding",
  "berserk",
  "reaperShroud",
  "activeShade",
  "soulbeastMerged",
  "healthAbove50",
  "healthBelow50",
  "arcaneLightning",
  "might10",
  "oneHand",
  "revealed",
  "healthAbove75",
  "health50to75",
  "resolution",
  "targetDisabled",
  "targetDefiant",
  "targetDefiantOnly",
  "targetFlanked",
  "targetWithin450",
  "targetWeakness",
  "targetTorment",
  "targetBoonless",
  "targetHealthBelow50",
  "stealth",
  "hiddenKiller",
  "dangerTime",
  "enduranceFull",
  "celestialAvatar",
  "playerShroud",
]);

/** Reviewed player attributes only. API facts never supply a numeric fallback. */
export async function attachTraitAttributes({
  snapshot,
  config,
  catalog,
  source,
  evidence,
}) {
  const audit = [],
    seen = new Set();
  snapshot.traitAttributeBonuses = [];
  for (const definition of config.attributeBonuses || []) {
    const page = snapshot.entries.traits[definition.trait];
    const trait = catalog.traits.find((t) => t.id === definition.trait);
    const profession = catalog.specs.find(
      (s) => s.id === trait?.specialization,
    )?.profession;
    if (
      seen.has(definition.trait) ||
      !page?.identityVerified ||
      !config.professions.includes(page.profession) ||
      profession !== page.profession ||
      page.revision !== definition.revision
    )
      throw Error(`Invalid attribute trait identity: ${definition.trait}`);
    seen.add(definition.trait);
    const html = await source("traits", definition.trait, definition.revision);
    if (
      !definition.evidence?.length ||
      !definition.guards?.length ||
      definition.evidence.some(
        (text) => !text || !evidence(html).includes(text),
      ) ||
      definition.guards.some(
        (g) =>
          !page.rows.some((r) => r.label === g.label && r.detail === g.detail),
      )
    )
      throw Error(`Attribute evidence changed: ${definition.trait}`);
    for (const extra of definition.evidenceSources || []) {
      const html = await source(extra.kind, extra.id, extra.revision);
      if (!evidence(html).includes(extra.evidence))
        throw Error(
          `Additional attribute evidence changed: ${definition.trait}/${extra.id}`,
        );
    }
    const controls = definition.controls || [];
    if (
      new Set(controls.map((c) => c.key)).size !== controls.length ||
      controls.some(
        (c) =>
          !/^[a-zA-Z][\w-]*$/.test(c.key) ||
          !c.label ||
          !c.description ||
          (c.max !== undefined &&
            (!Number.isInteger(c.max) || c.max < 1 || c.max > 30)) ||
          c.excludeSpecializations?.some(
            (id) =>
              !catalog.specs.some(
                (s) => s.id === id && s.profession === profession && s.elite,
              ),
          ),
      )
    )
      throw Error(`Invalid attribute preview control: ${definition.trait}`);
    if (!definition.rules?.length)
      throw Error(`Missing attribute rules: ${definition.trait}`);
    for (const r of definition.rules) {
      if (
        (!attributes.has(r.target) &&
          ![
            "critical",
            "criticalMultiplier",
            "outgoingHealing",
            "duration",
          ].includes(r.target)) ||
        !Number.isFinite(r.amount) ||
        r.amount <= 0 ||
        (r.from && (!attributes.has(r.from) || !attributes.has(r.target))) ||
        (r.perMight && r.from) ||
        (r.perStack && r.perMight) ||
        (r.perStack && !controls.some((c) => c.key === r.perStack && c.max)) ||
        [...(r.gates || []), ...(r.anyGates || [])].some(
          (g) => !gates.has(g) && !/^weapon:(?:[A-Za-z]+,)*[A-Za-z]+$/.test(g),
        ) ||
        (r.scaleWith &&
          (!attributes.has(r.scaleWith) ||
            r.target !== "outgoingHealing" ||
            r.from)) ||
        (r.target === "duration" &&
          !["Burning", "Confusion"].includes(r.effect)) ||
        (r.effect && r.target !== "duration") ||
        r.requiresTraits ||
        r.withoutTraits
      )
        throw Error(`Unsupported attribute rule: ${definition.trait}`);
    }
    const rule = {
      trait: definition.trait,
      profession,
      name: trait.name,
      rules: definition.rules,
      controls,
      source: { title: page.title, revision: definition.revision },
    };
    snapshot.traitAttributeBonuses.push(rule);
    audit.push(rule);
  }
  return audit;
}

export async function attachWeaponReplacements({
  snapshot,
  config,
  source,
  evidence,
}) {
  snapshot.traitWeaponReplacements = [];
  for (const d of config.weaponReplacements || []) {
    const trait = snapshot.entries.traits[d.trait];
    const before = snapshot.entries.skills[d.before.id],
      after = snapshot.entries.skills[d.after.id];
    if (
      !trait?.identityVerified ||
      trait.revision !== d.revision ||
      !before?.identityVerified ||
      !after?.identityVerified ||
      before.profession !== trait.profession ||
      after.profession !== trait.profession ||
      before.revision !== d.before.revision ||
      after.revision !== d.after.revision ||
      !evidence(await source("traits", d.trait, d.revision)).includes(
        d.evidence,
      )
    )
      throw Error(`Weapon replacement evidence changed: ${d.trait}`);
    snapshot.traitWeaponReplacements.push({
      trait: d.trait,
      profession: trait.profession,
      before: d.before.id,
      after: d.after.id,
      source: { title: trait.title, revision: d.revision },
    });
  }
  return snapshot.traitWeaponReplacements;
}
