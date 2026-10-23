import data from "./data/profession-mechanics.json" with { type: "json" };
import type { Build, Catalog, Entity } from "./domain";
import { petNaturalCommands } from "./pet-skills";

export const mechanicData = data;
export const landPets: Entity[] = data.pets;
export const morphIds: number[] = data.morphIds;
export const jadeCore: Entity = data.jadeCore;
export const archetypeNames: Record<string, string> = {
  Stout: "坚韧",
  Deadly: "致命",
  Versatile: "多面",
  Ferocious: "凶猛",
  Supportive: "支援",
};
export function mergeMechanicCatalog(catalog: Catalog): Catalog {
  const ids = new Set(catalog.skills.map((s) => s.id));
  const items = catalog.items.some((i) => i.id === jadeCore.id)
    ? catalog.items
    : [...catalog.items, jadeCore];
  const legendSkillIds = new Set(
    data.legends.flatMap((l) => [l.heal, ...l.utilities, l.elite]),
  );
  const result = {
    ...catalog,
    items,
    skills: [
      ...catalog.skills,
      ...data.skills
        .filter((s) => !ids.has(s.id))
        .map((s) =>
          legendSkillIds.has(s.id) ? { ...s, detailOnly: false } : s,
        ),
    ],
  };
  const allIds = new Set(result.skills.map((s) => s.id));
  for (const pet of landPets)
    for (const skill of petNaturalCommands(pet, result))
      if (skill.id > 0 && !allIds.has(skill.id)) {
        result.skills.push(skill);
        allIds.add(skill.id);
      }
  const mechIds = new Set(
    catalog.traits
      .filter((t) => t.specialization === 70 && t.slot === "Major")
      .flatMap((t) => (t.skills || []).map((s: Entity) => s.id)),
  );
  // Preserve the caster in Markdown and related-skill details as well as F-slots.
  result.skills = result.skills.map((s) =>
    s.type === "Pet"
      ? { ...s, mechanicActor: "pet" }
      : mechIds.has(s.id)
        ? { ...s, mechanicActor: "mech" }
        : s,
  );
  return result;
}
export function eliteSpec(build: Build, catalog: Catalog) {
  return catalog.specs.find(
    (s) =>
      s.elite &&
      s.profession === build.profession &&
      build.specs.some((b) => b.id === s.id),
  )?.id;
}
export function legendOptions(build: Build, catalog: Catalog): Entity[] {
  const spec = eliteSpec(build, catalog);
  const restrictions: Record<string, number> = {
    Legend1: 52,
    Legend5: 63,
    Legend7: 69,
    Legend8: 79,
  };
  return data.legends
    .filter((l) => !restrictions[l.id] || restrictions[l.id] === spec)
    .flatMap((l) => {
      const skill = catalog.skills.find((s) => s.id === l.swap);
      return skill ? [{ ...skill, detailOnly: false }] : [];
    });
}
export function legendFor(id: number | null | undefined) {
  return data.legends.find((l) => l.swap === id);
}
export function legendSkills(id: number | null | undefined): (number | null)[] {
  const legend = legendFor(id);
  return legend
    ? [legend.heal, ...legend.utilities, legend.elite]
    : Array(5).fill(null);
}
export function mechanicIssues(build: Build, catalog: Catalog): string[] {
  const value = build.mechanics;
  if (!value) return [];
  const errors: string[] = [];
  const spec = eliteSpec(build, catalog);
  const unique = (ids: (number | null)[]) =>
    new Set(ids.filter(Boolean)).size === ids.filter(Boolean).length;
  if (
    value.morphs &&
    (build.profession !== "Engineer" ||
      spec !== 75 ||
      !unique(value.morphs) ||
      value.morphs.some((id) => id && !morphIds.includes(id)))
  )
    errors.push("流金师形态技能与职业、专精不兼容或存在重复。");
  if (
    value.pets &&
    (build.profession !== "Ranger" ||
      !unique(value.pets) ||
      value.pets.some((id) => id && !landPets.some((p) => p.id === id)))
  )
    errors.push("宠物选择无效；请使用不同的陆地宠物。");
  if (
    value.legends &&
    (build.profession !== "Revenant" ||
      !unique(value.legends) ||
      value.legends.some(
        (id) => id && !legendOptions(build, catalog).some((l) => l.id === id),
      ))
  )
    errors.push("传奇姿态与当前职业或精英特长不兼容。");
  if (value.familiar && (build.profession !== "Elementalist" || spec !== 80))
    errors.push("魔宠元素只适用于唤元师。");
  if (value.legends?.[0]) {
    const allowed = legendSkills(value.legends[0]);
    if (
      build.skills.some(
        (id, i) =>
          id &&
          (i === 0 || i === 4
            ? id !== allowed[i]
            : !allowed.slice(1, 4).includes(id)),
      )
    )
      errors.push("技能组合与第一组传奇姿态不一致。");
  }
  return errors;
}
export function normalizeMechanics(build: Build, catalog: Catalog) {
  const value = build.mechanics;
  if (!value) return;
  const spec = eliteSpec(build, catalog);
  if (build.profession !== "Engineer" || spec !== 75) delete value.morphs;
  if (build.profession !== "Ranger") delete value.pets;
  if (build.profession !== "Elementalist" || spec !== 80) delete value.familiar;
  if (build.profession !== "Revenant") delete value.legends;
  if (value.legends) {
    const allowed = new Set(legendOptions(build, catalog).map((l) => l.id));
    const old = value.legends[0];
    value.legends = value.legends.map((id) =>
      id && allowed.has(id) ? id : null,
    );
    if (old && !value.legends[0]) build.skills = Array(5).fill(null);
  }
  if (!Object.keys(value).length) delete build.mechanics;
}
export type MechanicPreview = {
  activePet: 0 | 1;
  activeLegend: 0 | 1;
  transformed: boolean;
  berserk: boolean;
};
export const emptyMechanicPreview = (): MechanicPreview => ({
  activePet: 0,
  activeLegend: 0,
  transformed: false,
  berserk: false,
});
export type MechanicSlot = {
  key: string;
  label: string;
  skill?: Entity;
  following: Entity[];
  selectMorph?: number;
  attunement?: string;
  command?: string;
  toggle?: "pet" | "transform" | "legend";
  actor?: "pet" | "mech";
};
export function mechanicSlots(
  build: Build,
  catalog: Catalog,
  preview: MechanicPreview,
  weaponSet: 1 | 2 = 1,
  attunement = "Fire",
): MechanicSlot[] {
  const spec = eliteSpec(build, catalog);
  const traits = new Set(build.specs.flatMap((s) => s.traits));
  const find = (id: number | null | undefined) =>
    catalog.skills.find((s) => s.id === id);
  const slot = (
    n: number,
    id?: number | null,
    following: number[] = [],
    extra: Partial<MechanicSlot> = {},
  ): MechanicSlot => ({
    key: `F${n}`,
    label: `F${n}`,
    skill: find(id),
    following: following.flatMap((id) => (find(id) ? [find(id)!] : [])),
    ...extra,
  });
  const fixed = (ids: number[]) => ids.map((id, i) => slot(i + 1, id));
  if (build.profession === "Engineer") {
    const belt = build.skills.map((id, i) =>
      slot(i + 1, find(id)?.toolbelt_skill),
    );
    if (spec === 70) {
      const command = (tier: number) =>
        catalog.traits.find(
          (t) =>
            t.specialization === 70 &&
            t.tier === tier &&
            t.slot === "Major" &&
            traits.has(t.id),
        )?.skills?.[0]?.id;
      return [
        slot(1, command(1), [], { actor: "mech" }),
        slot(2, command(2), [], { actor: "mech" }),
        slot(3, command(3), [], { actor: "mech" }),
        slot(4, 63050, [63089]),
      ];
    }
    if (spec === 75)
      return [
        belt[0],
        ...Array.from({ length: 3 }, (_, i) =>
          slot(i + 2, build.mechanics?.morphs?.[i], [], { selectMorph: i }),
        ),
        slot(5, traits.has(2334) ? 76651 : 76642),
      ];
    if (spec === 43) belt[4] = slot(5, 56920);
    if (spec === 57) belt[4] = slot(5, 42938);
    return belt;
  }
  if (build.profession === "Guardian") {
    if (spec === 27) return fixed([29887, 30783, 30029]);
    if (spec === 62) return fixed([44364, 41780, 42259]);
    if (spec === 65) return fixed([62668, 62603, 62648]);
    if (spec === 81) return fixed([78837, 78604, 78358, 77073]);
    return fixed([9115, 9120, 9118]);
  }
  if (build.profession === "Mesmer") {
    if (spec === 40) return fixed([56930, 56928, 56873, 10192, 29830]);
    if (spec === 66) return fixed([62617, 62616, 62602, 68273, 62597]);
    if (spec === 73) return fixed([76552, 76746, 77079, 77077, 76931]);
    return fixed([10191, 10190, 10287, 10192]);
  }
  if (build.profession === "Necromancer") {
    if (spec === 60) return fixed([44946, 40813, 43448, 44428, 44663]);
    return [
      slot(
        1,
        ({ 34: 30792, 64: 62567, 76: 77238 } as Record<number, number>)[
          spec || 0
        ] || 10574,
      ),
    ];
  }
  if (build.profession === "Elementalist") {
    const ids = [5492, 5493, 5494, 5495];
    const overloads = [29706, 29415, 29719, 29618];
    const elements = ["Fire", "Water", "Air", "Earth"];
    const slots = ids.map((id, i) =>
      slot(i + 1, id, spec === 48 ? [overloads[i]] : [], {
        attunement: elements[i],
      }),
    );
    if (spec === 56) slots.push(slot(5, 80231));
    if (spec === 67) {
      const spheres: Record<string, number> = {
        Fire: 63396,
        Water: 62723,
        Air: 62940,
        Earth: 62837,
      };
      slots.push(slot(5, spheres[attunement]));
    }
    if (spec === 80) {
      const familiars: Record<string, number[]> = {
        Fire: [76643, 77074],
        Water: [77225, 77357],
        Air: [77370, 76618],
        Earth: [77226, 76681],
      };
      const pair = familiars[build.mechanics?.familiar || "Fire"];
      slots.push(slot(5, pair[0], [pair[1]]));
    }
    return slots;
  }
  if (build.profession === "Ranger") {
    const pet = data.pets.find(
      (p) => p.id === build.mechanics?.pets?.[preview.activePet],
    );
    if (spec === 55 && preview.transformed)
      return [
        slot(1, pet?.mergedSkills[0]),
        slot(2, pet?.mergedSkills[1]),
        slot(3, pet?.mergedSkills[2]),
        slot(4, undefined, [], { command: "切换宠物预览", toggle: "pet" }),
        slot(5, 43014, [], { toggle: "transform" }),
      ];
    const natural = pet ? petNaturalCommands(pet, catalog) : [];
    const slots =
      spec === 72 && preview.transformed
        ? [
            slot(1, 63209, [], { actor: "pet" }),
            slot(2, 63258, [], { actor: "pet" }),
            slot(3, 63094, [], { actor: "pet" }),
          ]
        : spec === 72
          ? [
              slot(1, natural[0]?.id, [], { skill: natural[0], actor: "pet" }),
              slot(2, pet?.skills[0], [], { actor: "pet" }),
              slot(3, natural[1]?.id, [], { skill: natural[1], actor: "pet" }),
            ]
          : [
              slot(1, undefined, [], { command: "攻击我的目标" }),
              slot(2, pet?.skills[0], [], { actor: "pet" }),
              slot(3, undefined, [], { command: "返回主人身边" }),
            ];
    slots.push(
      slot(4, undefined, [], { command: "切换宠物预览", toggle: "pet" }),
    );
    if (spec === 5) slots.push(slot(5, 31869));
    if (spec === 55) slots.push(slot(5, 42944, [], { toggle: "transform" }));
    if (spec === 72)
      slots.push(
        slot(5, preview.transformed ? 63147 : 63344, [], {
          toggle: "transform",
        }),
      );
    if (spec === 78) slots.push(slot(5, 76787, [77213]));
    return slots;
  }
  if (build.profession === "Warrior") {
    if (spec === 68) return fixed([62745, 62803]);
    const weapon =
      build.equipment[weaponSet === 1 ? "weapon1" : "weapon2"].weapon;
    const bursts: Record<string, number> = {
      Axe: 14353,
      Dagger: 45252,
      Greatsword: 14375,
      Hammer: 14387,
      Longbow: 14506,
      Mace: 14414,
      Rifle: 14396,
      Sword: 80203,
      Staff: 71932,
      Spear: 73024,
    };
    const primal: Record<string, number> = {
      Axe: 30851,
      Dagger: 69290,
      Greatsword: 29852,
      Hammer: 30879,
      Longbow: 29923,
      Mace: 29679,
      Rifle: 29644,
      Sword: 30682,
      Staff: 71875,
      Spear: 73103,
    };
    const counter: Record<string, number> = {
      Axe: 43566,
      Dagger: 69297,
      Greatsword: 42707,
      Hammer: 40601,
      Longbow: 42803,
      Mace: 41110,
      Rifle: 42041,
      Sword: 80252,
      Staff: 72089,
      Spear: 73014,
    };
    const slots = [
      slot(
        1,
        (spec === 61
          ? counter
          : spec === 18 && preview.berserk
            ? primal
            : bursts)[weapon],
      ),
    ];
    if (spec === 18) slots.push(slot(2, 30435));
    if (spec === 61) slots.push(slot(2, 44165));
    if (spec === 74) slots.push(slot(2, 77342), slot(3, 76782));
    return slots;
  }
  if (build.profession === "Thief") {
    if (spec === 77)
      return [
        slot(1, 77397),
        slot(2, undefined, [], { command: "防御神器 · 随机获得" }),
        slot(3, undefined, [], { command: "进攻神器 · 随机获得" }),
      ];
    if (spec === 71) return [slot(1, 63067), slot(2, 63155)];
    return [
      slot(1, spec === 58 ? 43390 : 13014),
      slot(2, undefined, [], { command: "失窃技能 · 随目标变化" }),
    ];
  }
  if (build.profession === "Revenant") {
    const legend = build.mechanics?.legends?.[preview.activeLegend];
    const standby =
      build.mechanics?.legends?.[preview.activeLegend === 0 ? 1 : 0];
    const slots = [
      slot(1, standby, [], { command: "切换传奇预览", toggle: "legend" }),
    ];
    if (spec === 52) slots.push(slot(2, 29371));
    else if (spec === 63)
      slots.push(slot(2, 44076), slot(3, 42836), slot(4, 45537));
    else if (spec === 69) slots.push(slot(2, 62757));
    else if (spec === 79) {
      const potential: Record<number, number> = {
        76610: 78661,
        28494: 78615,
        28195: 78501,
        28134: 78845,
        28419: 78895,
      };
      slots.push(
        slot(2, legend ? potential[legend] : undefined),
        slot(3, 77371),
      );
    } else slots.push(slot(2, 55029));
    return slots;
  }
  return [];
}
