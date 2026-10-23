import {
  armorSlots,
  accessorySlots,
  twoHanded,
  type Build,
  type Catalog,
  type Entity,
  type InfusionGroup,
} from "./domain";

export const infusionAttributes: Record<string, string> = {
  Power: "威力",
  Precision: "精准",
  Toughness: "坚韧",
  Vitality: "体力",
  CritDamage: "暴击效果",
  ConditionDamage: "症状伤害",
  ConditionDuration: "症状效果",
  BoonDuration: "增益效果",
  Healing: "治疗效果",
};
export function infusionParts(item?: Entity) {
  const entries: { attribute: string; modifier: number }[] =
    item?.details?.infix_upgrade?.attributes || [];
  return {
    primary: entries.find((entry) => entry.attribute in infusionAttributes),
    agony:
      entries.find((entry) => entry.attribute === "AgonyResistance")
        ?.modifier || 0,
  };
}
export function infusionName(item?: Entity, value?: number): string {
  if (!item) return "灌注资料缺失";
  const { primary, agony } = infusionParts(item);
  if (primary)
    return `${infusionAttributes[primary.attribute]} +${value ?? primary.modifier}${agony ? ` · 痛苦 +${agony}` : ""}`;
  if (agony) return `痛苦抗性 +${agony}`;
  return item.name;
}

// One official item per effect; cosmetic/competitive duplicates remain readable in old files.
export function infusionOptions(catalog: Catalog): Entity[] {
  const choices = new Map<string, Entity>();
  const items = catalog.items
    .filter((item) =>
      item.details?.infusion_upgrade_flags?.includes("Infusion"),
    )
    .sort((a, b) => a.id - b.id);
  for (const item of items) {
    const entries = item.details?.infix_upgrade?.attributes || [];
    const { primary, agony } = infusionParts(item);
    const stat =
      primary?.modifier === 5 &&
      (agony === 0 || agony === 9) &&
      entries.length === (agony ? 2 : 1);
    const pure =
      !primary &&
      entries.length === 1 &&
      agony > 0 &&
      /^\+\d+痛苦灌注$/.test(item.name);
    if (!stat && !pure) continue;
    const key = `${primary?.attribute || "AgonyResistance"}/${agony}`;
    if (!choices.has(key))
      choices.set(key, {
        id: item.id,
        name: infusionName(item),
        details: {
          infusion_upgrade_flags: ["Infusion"],
          infix_upgrade: { attributes: entries },
        },
      });
  }
  return [...choices.values()].sort((a, b) => {
    const x = infusionParts(a),
      y = infusionParts(b);
    const category = (part: typeof x) =>
      !part.primary ? 2 : part.agony === 9 ? 0 : 1;
    return (
      category(x) - category(y) ||
      (x.primary && y.primary
        ? Object.keys(infusionAttributes).indexOf(x.primary.attribute) -
          Object.keys(infusionAttributes).indexOf(y.primary.attribute)
        : x.agony - y.agony)
    );
  });
}

export function currentInfusions(build: Build, set: 1 | 2): InfusionGroup[] {
  const configured = build.infusionLoadouts?.[set];
  if (configured !== undefined) return configured;
  const main = set === 1 ? "weapon1" : "weapon2";
  const off = set === 1 ? "offhand1" : "offhand2";
  const weapons = [
    main,
    ...(twoHanded.has(build.equipment[main].weapon) ? [] : [off]),
  ].filter((key) => build.equipment[key as typeof main].weapon);
  const counts = new Map<number, number>();
  for (const key of [...armorSlots, ...accessorySlots, ...weapons])
    for (const id of build.equipment[key as keyof Build["equipment"]].infusions)
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts].map(([id, count]) => ({ id, count }));
}

export function mergeInfusions(groups: InfusionGroup[]): InfusionGroup[] {
  const result: InfusionGroup[] = [];
  for (const group of groups) {
    const match = result.find(
      (entry) =>
        entry.id === group.id && entry.attributeValue === group.attributeValue,
    );
    if (match) match.count += group.count;
    else result.push({ ...group });
  }
  return result;
}
