import { z } from "zod";
import { encounterModes } from "./encounter-modes";
import { zlibSync, Unzlib, strToU8, strFromU8 } from "fflate";
import { mechanicIssues } from "./profession-mechanics";
import { descriptionStyleSchema } from "./markdown-style";
export const armorSlots = [
  "head",
  "shoulders",
  "chest",
  "hands",
  "legs",
  "feet",
] as const;
export const accessorySlots = [
  "back",
  "accessory1",
  "accessory2",
  "amulet",
  "ring1",
  "ring2",
] as const;
export const weaponSlots = [
  "weapon1",
  "offhand1",
  "weapon2",
  "offhand2",
] as const;
export const allSlots = [
  ...armorSlots,
  ...accessorySlots,
  ...weaponSlots,
] as const;
export const labels: Record<string, string> = {
  head: "头部",
  shoulders: "肩部",
  chest: "胸部",
  hands: "手部",
  legs: "腿部",
  feet: "足部",
  back: "背部",
  accessory1: "饰品 Ⅰ",
  accessory2: "饰品 Ⅱ",
  amulet: "项链",
  ring1: "戒指 Ⅰ",
  ring2: "戒指 Ⅱ",
  weapon1: "主手 Ⅰ",
  offhand1: "副手 Ⅰ",
  weapon2: "主手 Ⅱ",
  offhand2: "副手 Ⅱ",
};
const id = z.number().int().positive().nullable();
const slotSchema = z
  .object({
    statId: id,
    runeId: id,
    sigils: z.array(id).max(2),
    infusions: z.array(id).max(3),
    weapon: z.string().max(30),
  })
  .strict();
const shape = Object.fromEntries(
  allSlots.map((s) => [s, slotSchema]),
) as Record<(typeof allSlots)[number], typeof slotSchema>;
export const buildTagsSchema = z
  .array(z.string().trim().min(1).max(24))
  .max(8)
  .transform((tags) => [...new Set(tags)]);
const infusionGroupSchema = z
  .object({
    id: z.number().int().positive(),
    count: z.number().int().min(1).max(18),
    attributeValue: z.number().int().min(1).max(30).optional(),
  })
  .strict();
const infusionLoadoutSchema = z
  .array(infusionGroupSchema)
  .max(18)
  .refine(
    (groups) => groups.reduce((total, group) => total + group.count, 0) <= 18,
    "每个武器组最多配置 18 枚灌注。",
  );
export type InfusionGroup = z.infer<typeof infusionGroupSchema>;
export const encountersSchema = z
  .array(
    z
      .object({
        instance: z.string().trim().min(1).max(60),
        boss: z.string().trim().max(60).optional(),
        mode: z.enum(encounterModes).optional(),
      })
      .strict(),
  )
  .max(20)
  .transform((encounters) =>
    encounters.filter(
      (entry, index) =>
        encounters.findIndex(
          (other) =>
            other.instance === entry.instance &&
            (other.boss || "") === (entry.boss || "") &&
            other.mode === entry.mode,
        ) === index,
    ),
  );
export const buildSchema = z
  .object({
    version: z.literal(1),
    id: z.string().max(80),
    name: z.string().max(80),
    description: z.string().max(60000).optional(),
    descriptionStyle: descriptionStyleSchema.optional(),
    tags: buildTagsSchema.optional(),
    encounters: encountersSchema.optional(),
    profession: z.enum([
      "Guardian",
      "Warrior",
      "Engineer",
      "Ranger",
      "Thief",
      "Elementalist",
      "Mesmer",
      "Necromancer",
      "Revenant",
    ]),
    equipment: z.object(shape).strict(),
    relic: id,
    food: id,
    utility: id,
    jadeBotCore: z.literal(96613).nullable().optional(),
    infusionLoadouts: z
      .object({
        "1": infusionLoadoutSchema.optional(),
        "2": infusionLoadoutSchema.optional(),
      })
      .strict()
      .optional(),
    mechanics: z
      .object({
        morphs: z.array(id).length(3).optional(),
        pets: z.array(id).length(2).optional(),
        legends: z.array(id).length(2).optional(),
        familiar: z.enum(["Fire", "Water", "Air", "Earth"]).optional(),
      })
      .strict()
      .optional(),
    skills: z.array(id).length(5),
    specs: z
      .array(z.object({ id, traits: z.array(id).length(3) }).strict())
      .length(3),
  })
  .strict();
export type Build = z.infer<typeof buildSchema>;
export type Slot = Build["equipment"][(typeof allSlots)[number]];
export function createBuild(profession: Build["profession"] = "Mesmer"): Build {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: "未命名配装",
    profession,
    equipment: Object.fromEntries(
      allSlots.map((s) => [
        s,
        {
          statId: null,
          runeId: null,
          sigils: [null, null],
          infusions: Array(
            s === "back" || s.startsWith("ring")
              ? s === "back"
                ? 2
                : 3
              : s.startsWith("accessory") || armorSlots.includes(s as never)
                ? 1
                : weaponSlots.includes(s as never)
                  ? 1
                  : 0,
          ).fill(null),
          weapon: "",
        },
      ]),
    ) as Build["equipment"],
    relic: null,
    food: null,
    utility: null,
    skills: Array(5).fill(null),
    specs: Array.from({ length: 3 }, () => ({
      id: null,
      traits: [null, null, null],
    })),
  };
}
export function encodeShare(b: Build) {
  const bytes = zlibSync(strToU8(JSON.stringify(buildSchema.parse(b))));
  if (bytes.length > 9000)
    throw Error("链接过长，请使用“下载 BD”保存 JSON 文件。");
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  if (encoded.length > 12000)
    throw Error("链接过长，请使用“下载 BD”保存 JSON 文件。");
  return encoded;
}
export function decodeShare(s: string): Build {
  if (s.length > 12000 || !s || !/^[\w-]+$/.test(s))
    throw Error("分享链接格式不正确或过长。");
  const bytes = Uint8Array.from(
    atob(s.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
  let size = 0;
  const parts: Uint8Array[] = [];
  const stream = new Unzlib((chunk) => {
    size += chunk.length;
    if (size > 262144) throw Error("分享内容超出大小限制。");
    parts.push(chunk);
  });
  stream.push(bytes, true);
  const out = new Uint8Array(size);
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.length;
  }
  return parseBuild(strFromU8(out));
}
export function parseBuild(raw: string): Build {
  if (new TextEncoder().encode(raw).length > 262144) throw Error("文件过大。");
  return buildSchema.parse(JSON.parse(raw));
}
export type Entity = {
  id: number;
  name: string;
  icon?: string;
  description?: string;
  [key: string]: any;
};
export type Catalog = {
  weaponSkillsReady?: boolean;
  revision: string;
  professions: any[];
  specs: Entity[];
  traits: Entity[];
  skills: Entity[];
  stats: Entity[];
  statChoices?: { equipment: number[]; trinket: number[] };
  items: Entity[];
};
export function statOptions(catalog: Catalog, slot: string): Entity[] {
  const group = accessorySlots.includes(slot as never)
    ? "trinket"
    : "equipment";
  const ids = catalog.statChoices?.[group];
  const allowed = ids ? new Set(ids) : null;
  const seen = new Set<string>();
  const preferred = ["狂战士", "天界", "毒蛇"];
  return catalog.stats
    .filter((stat) => !allowed || allowed.has(stat.id))
    .filter((stat) => {
      if (seen.has(stat.name)) return false;
      seen.add(stat.name);
      return true;
    })
    .sort((a, b) => {
      const rank = (name: string) =>
        preferred.includes(name) ? preferred.indexOf(name) : 100;
      return (
        rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "zh-CN")
      );
    });
}
export const twoHanded = new Set([
  "Greatsword",
  "Hammer",
  "Longbow",
  "Shortbow",
  "Rifle",
  "Staff",
  "Spear",
]);
export function issues(b: Build, c: Catalog, _complete = false): string[] {
  const errors: string[] = mechanicIssues(b, c);
  const p = c.professions.find((p) => p.id === b.profession);
  const specs = b.specs.map((s) => c.specs.find((x) => x.id === s.id));
  const chosen = b.specs.flatMap((s) => (s.id ? [s.id] : []));
  if (new Set(chosen).size !== chosen.length) errors.push("特性线不能重复。");
  if (specs.filter((s) => s?.elite).length > 1)
    errors.push("只能选择一个精英特长。");
  b.specs.forEach((s, i) => {
    const spec = specs[i];
    if (spec?.elite && i !== 2) errors.push("精英特长只能放在第三条特性线。");
    if (s.id && (!spec || spec.profession !== b.profession))
      errors.push(`特性线 ${i + 1} 不属于当前职业。`);
    s.traits.forEach((id, t) => {
      if (id) {
        const trait = c.traits.find((x) => x.id === id);
        if (
          !trait ||
          trait.specialization !== s.id ||
          trait.tier !== t + 1 ||
          trait.slot !== "Major"
        )
          errors.push(`特性线 ${i + 1} 第 ${t + 1} 阶选择无效。`);
      }
    });
  });
  const kinds = ["Heal", "Utility", "Utility", "Utility", "Elite"];
  const skillIds = b.skills.filter(Boolean);
  if (new Set(skillIds).size !== skillIds.length) errors.push("技能不能重复。");
  b.skills.forEach((id, i) => {
    if (!id) {
      return;
    }
    const s = c.skills.find((s) => s.id === id);
    if (
      !s ||
      s.detailOnly ||
      !s.professions?.includes(b.profession) ||
      s.type !== kinds[i] ||
      (s.specialization && !chosen.includes(s.specialization))
    )
      errors.push(`技能槽 ${i + 1} 与职业或特性不兼容。`);
  });
  for (const key of allSlots) {
    const s = b.equipment[key];
    if (s.statId && !c.stats.some((x) => x.id === s.statId))
      errors.push(`${labels[key]}属性已失效。`);
    const selectedStat = c.stats.find((x) => x.id === s.statId);
    if (
      selectedStat &&
      !statOptions(c, key).some((x) => x.name === selectedStat.name)
    )
      errors.push(
        `${labels[key]}的“${selectedStat.name}”不是当前可选配装词条，请重新选择。`,
      );
    const validItem = (id: number | null, check: (e: Entity) => boolean) =>
      !id || c.items.some((x) => x.id === id && check(x));
    if (
      !validItem(
        s.runeId,
        (x) => armorSlots.includes(key as never) && x.details?.type === "Rune",
      )
    )
      errors.push(`${labels[key]}符文无效。`);
    if (
      s.sigils.some(
        (id) =>
          !validItem(
            id,
            (x) =>
              weaponSlots.includes(key as never) && x.details?.type === "Sigil",
          ),
      )
    )
      errors.push(`${labels[key]}法印无效。`);
    if (
      s.infusions.some(
        (id) =>
          !validItem(id, (x) =>
            x.details?.infusion_upgrade_flags?.includes("Infusion"),
          ),
      )
    )
      errors.push(`${labels[key]}灌注无效。`);
    const max = key.startsWith("ring")
      ? 3
      : key === "back"
        ? 2
        : key === "amulet"
          ? 0
          : weaponSlots.includes(key as never) && twoHanded.has(s.weapon)
            ? 2
            : 1;
    if (s.infusions.length > max) errors.push(`${labels[key]}灌注槽过多。`);
    if (weaponSlots.includes(key as never)) {
      if (
        s.weapon &&
        (!p?.weapons[s.weapon] ||
          (!p.weapons[s.weapon].flags.includes(
            key.startsWith("offhand") ? "Offhand" : "Mainhand",
          ) &&
            !p.weapons[s.weapon].flags.includes("TwoHand")))
      )
        errors.push(`${labels[key]}武器不可用。`);
      if (s.sigils.filter(Boolean).length > (twoHanded.has(s.weapon) ? 2 : 1))
        errors.push(`${labels[key]}法印槽过多。`);
    }
  }
  for (const n of [1, 2])
    if (twoHanded.has(b.equipment[`weapon${n}` as "weapon1"].weapon)) {
      const o = b.equipment[`offhand${n}` as "offhand1"];
      if (
        o.weapon ||
        o.statId ||
        o.sigils.some(Boolean) ||
        o.infusions.some(Boolean)
      )
        errors.push(`武器组 ${n} 双手武器不能同时配置副手。`);
    }
  for (const groups of Object.values(b.infusionLoadouts || {})) {
    for (const group of groups || []) {
      const item = c.items.find((item) => item.id === group.id);
      if (!item?.details?.infusion_upgrade_flags?.includes("Infusion")) {
        errors.push("灌注配置包含无效物品。");
        continue;
      }
      if (group.attributeValue !== undefined) {
        const attributes = item.details?.infix_upgrade?.attributes || [];
        const primary = attributes.filter(
          (entry: any) => entry.attribute !== "AgonyResistance",
        );
        if (
          primary.length !== 1 ||
          ![
            "Power",
            "Precision",
            "Toughness",
            "Vitality",
            "CritDamage",
            "ConditionDamage",
            "ConditionDuration",
            "BoonDuration",
            "Healing",
          ].includes(primary[0].attribute)
        )
          errors.push("仅单属性灌注可设置单枚属性值。");
      }
    }
  }
  for (const [key, check] of [
    ["relic", (e: Entity) => e.type === "Relic"],
    ["food", (e: Entity) => e.details?.type === "Food"],
    ["utility", (e: Entity) => e.details?.type === "Utility"],
  ] as const) {
    if (b[key] && !c.items.some((e) => e.id === b[key] && check(e)))
      errors.push(`${key} 物品失效或类别不匹配。`);
  }
  return [...new Set(errors)];
}

export function commonStatOptions(catalog: Catalog): Entity[] {
  const equipment = statOptions(catalog, "head");
  const trinkets = new Set(
    statOptions(catalog, "ring1").map((stat) => stat.name),
  );
  return equipment.filter((stat) => trinkets.has(stat.name));
}
export function applyEquipmentStat(
  build: Build,
  catalog: Catalog,
  statId: number,
): number {
  const stat = commonStatOptions(catalog).find(
    (option) => option.id === statId,
  );
  if (!stat) throw Error("该词条不能应用于整套装备。");
  const targets = allSlots.filter((key) => {
    if (!weaponSlots.includes(key as never)) return true;
    const slot = build.equipment[key];
    if (!slot.weapon) return false;
    if (key === "offhand1" && twoHanded.has(build.equipment.weapon1.weapon))
      return false;
    if (key === "offhand2" && twoHanded.has(build.equipment.weapon2.weapon))
      return false;
    return true;
  });
  const choices = targets.map((key) => ({
    key,
    stat: statOptions(catalog, key).find((option) => option.name === stat.name),
  }));
  if (choices.some((choice) => !choice.stat))
    throw Error("部分槽位不支持该词条，未修改装备。");
  for (const choice of choices)
    build.equipment[choice.key].statId = choice.stat!.id;
  return choices.length;
}
