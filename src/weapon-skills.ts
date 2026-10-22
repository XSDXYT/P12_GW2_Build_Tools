import { twoHanded, type Build, type Catalog, type Entity } from "./domain";
import { wikiSnapshot } from "./wiki-details";

export const attunements = {
  Fire: "火焰",
  Water: "流水",
  Air: "空气",
  Earth: "大地",
};
export type Attunement = keyof typeof attunements;
export type SkillStage = { skill: Entity; label: string };
// These two edges are missing from the API. Identity and order are confirmed
// by the Wiki's spear skill list and the individual API-linked articles.
const extraChains: Record<number, number> = { 72896: 73076, 73063: 72904 };

export function mergeSkillCatalog(catalog: Catalog, skills: Entity[]): Catalog {
  const ids = new Set(catalog.skills.map((s) => s.id));
  return {
    ...catalog,
    weaponSkillsReady: true,
    skills: [
      ...catalog.skills,
      ...skills
        .filter((s) => !ids.has(s.id))
        .map((s) => ({ ...s, detailOnly: true })),
    ],
  };
}

export function followingSkills(
  root: Entity,
  catalog: Catalog,
  build: Build,
): SkillStage[] {
  const byId = new Map(catalog.skills.map((s) => [s.id, s]));
  const seen = new Set([root.id]);
  const result: SkillStage[] = [];
  const specs = build.specs.flatMap((s) => (s.id ? [s.id] : []));
  const weaponSpec = catalog.professions.find((p) => p.id === build.profession)
    ?.weapons?.[root.weapon_type]?.specialization;
  function visit(skill: Entity, depth: number) {
    if (depth > 20) return;
    const next = skill.next_chain || extraChains[skill.id];
    for (const id of [...new Set([next, skill.flip_skill].filter(Boolean))]) {
      if (seen.has(id)) continue;
      seen.add(id);
      const target = byId.get(id);
      if (
        !target ||
        (target.specialization &&
          !specs.includes(target.specialization) &&
          target.specialization !== weaponSpec &&
          !(
            build.profession === "Elementalist" &&
            target.specialization === 56 &&
            !target.dual_attunement
          ))
      )
        continue;
      // Flip is conditional, rather than a promise that every cast advances.
      const stealth = target.categories?.includes("StealthAttack");
      result.push({
        skill: target,
        label: stealth
          ? target.specialization
            ? "特长潜袭"
            : "潜袭变种"
          : next === id
            ? `连段 ${depth + 1}`
            : "条件替换",
      });
      visit(target, depth + 1);
    }
  }
  visit(root, 1);
  // Use reviewed current branches instead of historical transform_skills.
  for (const branch of wikiSnapshot.entries.skills[root.id]?.branches || []) {
    if (
      seen.has(branch.id) ||
      /变形目标|水下/.test(branch.label) ||
      (branch.requiresTrait &&
        !build.specs.some((s) => s.traits.includes(branch.requiresTrait!)))
    )
      continue;
    const skill = byId.get(branch.id);
    if (skill) {
      seen.add(skill.id);
      result.push({ skill, label: branch.label });
    }
  }
  return result;
}

export function weaponSkillSlots(
  build: Build,
  catalog: Catalog,
  weaponSet: 1 | 2,
  primary: Attunement = "Fire",
  secondary: Attunement = primary,
): (Entity | undefined)[] {
  const profession = catalog.professions.find((p) => p.id === build.profession);
  const main = build.equipment[weaponSet === 1 ? "weapon1" : "weapon2"].weapon;
  const off = twoHanded.has(main)
    ? ""
    : build.equipment[weaponSet === 1 ? "offhand1" : "offhand2"].weapon;
  const specs = build.specs.flatMap((s) => (s.id ? [s.id] : []));
  const weaver = build.profession === "Elementalist" && specs.includes(56);
  const byId = new Map(catalog.skills.map((s) => [s.id, s]));
  return [1, 2, 3, 4, 5].map((slot) => {
    const weapon = slot <= 3 || twoHanded.has(main) ? main : off;
    const definition = profession?.weapons?.[weapon];
    const references = new Map<number, any>(
      (definition?.skills || [])
        .filter(
          (s: any) =>
            s.slot === `Weapon_${slot}` &&
            (!s.offhand || s.offhand === (off || "Nothing")),
        )
        .map((s: any) => [s.id, s]),
    );
    // The profession endpoint supplies missing attunements for core offhand
    // skills, which the skills endpoint incorrectly tags as Weaver-only.
    const candidates: Entity[] = [...references]
      .flatMap<Entity>(([id, reference]) =>
        byId.get(id)
          ? [
              {
                ...byId.get(id)!,
                ...(reference.attunement
                  ? { attunement: reference.attunement }
                  : {}),
              },
            ]
          : [],
      )
      .filter((s) => weapon !== "Spear" || s.flags?.includes("NoUnderwater"));
    let valid = candidates.filter((s) => {
      if (s.dual_attunement) {
        return (
          weaver &&
          slot === 3 &&
          primary !== secondary &&
          [s.attunement, s.dual_attunement].includes(primary) &&
          [s.attunement, s.dual_attunement].includes(secondary)
        );
      }
      if (
        s.attunement &&
        s.attunement !== (weaver && slot >= 4 ? secondary : primary)
      )
        return false;
      return (
        !s.specialization ||
        specs.includes(s.specialization) ||
        s.specialization === definition.specialization ||
        (build.profession === "Elementalist" &&
          s.specialization === 56 &&
          !s.dual_attunement)
      );
    });
    if (weaver && slot === 3 && primary !== secondary) {
      const dual = valid.filter((s) => s.dual_attunement);
      if (dual.length) valid = dual;
    }
    valid.sort(
      (a, b) =>
        Number(specs.includes(b.specialization)) -
        Number(specs.includes(a.specialization)),
    );
    return valid[0];
  });
}
