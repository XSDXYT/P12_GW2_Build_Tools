import { consumableNutrition } from "./consumables";
import {
  armorSlots,
  accessorySlots,
  labels,
  statOptions,
  twoHanded,
  type Build,
  type Catalog,
  type Entity,
} from "./domain";
import { burningPrecision, chaoticPersistence } from "./game-rules";
import {
  signetRules,
  nonAttributeSignets,
  nonAttributeSignetTraits,
} from "./signet-rules";
export const primaryKeys = [
  "Power",
  "Precision",
  "Toughness",
  "Vitality",
  "CritDamage",
  "ConditionDamage",
  "ConditionDuration",
  "BoonDuration",
  "Healing",
] as const;
export type Attribute = (typeof primaryKeys)[number];
export type Totals = Record<Attribute, number>;
export const attributeLabels: Record<Attribute, string> = {
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
export const conditionLabels: Record<string, string> = {
  Burning: "燃烧",
  Bleeding: "流血",
  Poison: "中毒",
  Torment: "折磨",
  Confusion: "困惑",
  Chilled: "冰冻",
  Crippled: "残废",
  Fear: "恐惧",
  Immobilized: "定身",
  Slow: "迟缓",
  Weakness: "虚弱",
  Vulnerability: "易伤",
  Blind: "目盲",
};
export type AttributeData = {
  revision: string;
  source: string;
  profiles: Record<
    string,
    { id: number; name: string; adjustment: number; statChoices: number[] }
  >;
  items: Record<
    string,
    {
      name: string;
      text: string;
      description: string;
      bonuses: string[];
      attributes: { attribute: string; modifier: number }[];
      pve: boolean;
    }
  >;
};
export type Preview = {
  might: number;
  fury: boolean;
  flags: Record<string, boolean>;
  stacks: Record<string, number>;
};
export const emptyPreview = (): Preview => ({
  might: 0,
  fury: false,
  flags: {},
  stacks: {},
});
export type Contribution = { label: string; amount: number };
export type PreviewControl = {
  key: string;
  label: string;
  description: string;
  max?: number;
};
export type Result = {
  primary: Totals;
  primarySources: Record<Attribute, Contribution[]>;
  criticalChance: number;
  criticalDamage: number;
  criticalSources: Contribution[];
  consumableHealingBonus: number;
  consumableHealingSources: Contribution[];
  conditionDuration: number;
  boonDuration: number;
  conditions: Record<string, number>;
  durationSources: Record<string, Contribution[]>;
  warnings: string[];
  controls: PreviewControl[];
};
const aliases: Record<string, Attribute> = {
  power: "Power",
  precision: "Precision",
  toughness: "Toughness",
  vitality: "Vitality",
  ferocity: "CritDamage",
  "condition damage": "ConditionDamage",
  expertise: "ConditionDuration",
  concentration: "BoonDuration",
  healing: "Healing",
  "healing power": "Healing",
};
const zeros = (): Totals =>
  Object.fromEntries(primaryKeys.map((k) => [k, 0])) as Totals;
const clean = (text: string) =>
  text
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("−", "-");
type Conversion = {
  from: Attribute;
  to: Attribute;
  percent: number;
  label: string;
};
type Effect = {
  flats: Partial<Totals>;
  durations: Record<string, number>;
  conversions: Omit<Conversion, "label">[];
  critical: number;
  warnings: string[];
  stack?: { target: Attribute; amount: number };
  outgoingHealing?: {
    flat: number;
    scaling: { from: Attribute; percent: number }[];
  };
};
export function parseAttributeEffect(text: string): Effect {
  const result: Effect = {
    flats: {},
    durations: {},
    conversions: [],
    critical: 0,
    warnings: [],
  };
  for (const raw of clean(text).split(/\n|;/)) {
    const line = raw.trim().replace(/\.$/, "");
    if (!line) continue;
    let match = line.match(
      /^\+?(\d+(?:\.\d+)?) (?:to )?All (?:Stats|Attributes)$/i,
    );
    if (match) {
      for (const key of primaryKeys)
        result.flats[key] = (result.flats[key] || 0) + Number(match[1]);
      continue;
    }
    match = line.match(/^\+?(\d+(?:\.\d+)?)\s+([a-z ]+)$/i);
    if (match && aliases[match[2].toLowerCase()]) {
      const key = aliases[match[2].toLowerCase()];
      result.flats[key] = (result.flats[key] || 0) + Number(match[1]);
      continue;
    }
    match = line.match(
      /^Gain (.+?) Equal (?:to )?(\d+(?:\.\d+)?)% of Your (.+)$/i,
    );
    if (match) {
      const to = aliases[match[1].toLowerCase()],
        from = aliases[match[3].toLowerCase()];
      if (to && from)
        result.conversions.push({ from, to, percent: Number(match[2]) });
      else result.warnings.push("未识别的属性转换");
      continue;
    }
    match = line.match(
      /^\+?(\d+(?:\.\d+)?)%\s+(?:Increased )?(.+?) Duration$/i,
    );
    let durationName = match?.[2],
      durationValue = match ? Number(match[1]) : 0;
    if (!match) {
      const alternate = line.match(
        /^Increases? (.+?) duration by (\d+(?:\.\d+)?)%$/i,
      );
      if (alternate) {
        durationName = alternate[1];
        durationValue = Number(alternate[2]);
      } else {
        const sigil = line.match(
          /^Increase Inflicted (.+?) Duration:\s*(\d+(?:\.\d+)?)%$/i,
        );
        if (sigil) {
          durationName = sigil[1];
          durationValue = Number(sigil[2]);
        }
      }
    }
    if (durationName) {
      const rawName = durationName.trim().toLowerCase();
      const name =
        (
          {
            chill: "chilled",
            cripple: "crippled",
            blindness: "blind",
          } as Record<string, string>
        )[rawName] || rawName;
      const key =
        name === "condition"
          ? "Condition"
          : name === "boon"
            ? "Boon"
            : Object.keys(conditionLabels).find(
                (c) =>
                  c.toLowerCase() === name ||
                  (name === "poisoned" && c === "Poison"),
              );
      if (key)
        result.durations[key] = (result.durations[key] || 0) + durationValue;
      else result.warnings.push("该类持续时间效果尚未计入");
      continue;
    }
    match = line.match(/^\+?(\d+(?:\.\d+)?)% Critical (?:Chance|Hit Chance)$/i);
    if (match) {
      result.critical += Number(match[1]);
      continue;
    }
    const outgoing = line.match(
      /^\+?(\d+(?:\.\d+)?)% (?:Outgoing Healing|Healing Effectiveness|Healing to Other Allies)$/i,
    );
    const healingConversion = line.match(
      /^Gain (\d+(?:\.\d+)?)% Increased Healing to Other Allies for Every 100 (Healing Power|Concentration)$/i,
    );
    if (outgoing || healingConversion) {
      const effect = (result.outgoingHealing ||= { flat: 0, scaling: [] });
      if (outgoing) effect.flat += Number(outgoing[1]);
      if (healingConversion)
        effect.scaling.push({
          from: aliases[healingConversion[2].toLowerCase()],
          percent: Number(healingConversion[1]),
        });
      continue;
    }
    if (/(?:charge|stack)/i.test(line)) {
      const charge = line.match(
        /\+(\d+(?:\.\d+)?) (Power|Precision|Ferocity|Condition Damage|Healing Power)/i,
      );
      if (charge) {
        result.stack = {
          target: aliases[charge[2].toLowerCase()],
          amount: Number(charge[1]),
        };
        continue;
      }
    }
    if (
      /\b(?:power|precision|toughness|vitality|ferocity|expertise|concentration|healing power|duration|critical (?:chance|damage)|critically strike|all (?:attributes|stats))\b/i.test(
        line,
      ) &&
      !/(experience|fishing power|healing to other|healing effectiveness|healing power for every)/i.test(
        line,
      )
    )
      result.warnings.push("条件或百分比属性效果未计入");
  }
  return result;
}
type TraitRule = {
  target?: Attribute;
  from?: Attribute;
  gate?: string;
  extra?: boolean;
  percentKey?: "critical" | "Burning" | "Confusion";
  value?: number;
  afterConversion?: boolean;
};
const traitRules: Record<number, TraitRule[]> = {
  214: [{ target: "CritDamage", gate: "fury" }],
  221: [{ percentKey: "critical" }],
  223: [
    { target: "CritDamage" },
    { target: "CritDamage", gate: "air", extra: true },
  ],
  232: [{ target: "CritDamage", from: "Precision" }],
  275: [{ target: "ConditionDamage", from: "Toughness" }],
  296: [
    { percentKey: "Burning", value: burningPrecision.burningDurationBonus },
  ],
  320: [{ target: "Power", gate: "fire" }],
  325: [{ target: "ConditionDamage" }],
  413: [{ target: "BoonDuration" }],
  519: [
    { target: "Power", gate: "regeneration" },
    { target: "Healing", gate: "regeneration" },
  ],
  557: [{ target: "BoonDuration" }],
  566: [
    { target: "Precision", afterConversion: true },
    { target: "Power", gate: "oneHand" },
  ],
  568: [
    { target: "CritDamage", afterConversion: true },
    { percentKey: "critical", gate: "targetBurning" },
  ],
  580: [{ target: "Toughness", gate: "weapon:Shield" }],
  620: [{ target: "ConditionDamage", from: "Vitality" }],
  753: [{ percentKey: "Confusion" }],
  1059: [{ target: "BoonDuration" }],
  1099: [{ target: "ConditionDuration" }],
  1101: [
    { target: "ConditionDamage" },
    {
      target: "ConditionDamage",
      extra: true,
      gate: "weapon:Torch,Dagger,Mace",
    },
  ],
  1164: [{ target: "ConditionDamage" }],
  1192: [
    { target: "Power" },
    { target: "Power", extra: true, gate: "weapon:Sword,Spear" },
  ],
  1232: [{ target: "ConditionDuration" }],
  1245: [
    { target: "Power" },
    { target: "Power", extra: true, gate: "weapon:Dagger" },
  ],
  1272: [{ target: "CritDamage", from: "Precision" }],
  1333: [
    { target: "ConditionDuration" },
    { target: "ConditionDamage", gate: "weapon:Sword" },
  ],
  1338: [
    { target: "Power" },
    { target: "Power", gate: "weapon:Greatsword,Spear" },
  ],
  1369: [
    { target: "CritDamage" },
    { target: "CritDamage", extra: true, gate: "weapon:Axe" },
  ],
  1449: [
    { target: "Vitality", from: "Power" },
    { target: "CritDamage", from: "Power" },
  ],
  1455: [{ target: "ConditionDuration", from: "Precision" }],
  1470: [{ target: "Healing", from: "Power" }],
  1471: [{ target: "BoonDuration" }],
  1556: [{ target: "ConditionDamage", from: "Power" }],
  1865: [
    {
      target: "BoonDuration",
      gate: "regeneration",
      value: chaoticPersistence.attributes!.BoonDuration,
    },
    {
      target: "ConditionDuration",
      gate: "regeneration",
      value: chaoticPersistence.attributes!.ConditionDuration,
    },
  ],
  1927: [{ percentKey: "critical", gate: "alacrity" }],
  2193: [
    { target: "CritDamage", from: "Vitality" },
    { percentKey: "critical", gate: "fury" },
  ],
  2207: [{ target: "ConditionDuration", gate: "fury" }],
};
const gateLabels: Record<string, string> = {
  regeneration: "拥有再生",
  alacrity: "拥有敏捷",
  fire: "火焰协调",
  air: "空气协调",
  targetBurning: "目标处于燃烧状态",
};
export function activeTraits(build: Build, catalog: Catalog): Entity[] {
  const ids = new Set<number>();
  build.specs.forEach((selection, line) => {
    const spec = catalog.specs.find(
      (s) =>
        s.id === selection.id &&
        s.profession === build.profession &&
        (!s.elite || line === 2),
    );
    if (!spec) return;
    for (const id of spec.minor_traits || []) ids.add(id);
    selection.traits.forEach((id, tier) => {
      if (
        id &&
        spec.major_traits?.includes(id) &&
        catalog.traits.some((t) => t.id === id && t.tier === tier + 1)
      )
        ids.add(id);
    });
  });
  return catalog.traits.filter((t) => ids.has(t.id));
}
export function calculateAttributes(
  build: Build,
  catalog: Catalog,
  data: AttributeData,
  weaponSet: 1 | 2 = 1,
  preview: Preview = emptyPreview(),
): Result {
  const totals = zeros(),
    sources = Object.fromEntries(
      primaryKeys.map((key) => [key, [] as Contribution[]]),
    ) as Record<Attribute, Contribution[]>;
  const durationSources: Record<string, Contribution[]> = {};
  const durations: Record<string, number> = {};
  const warnings: string[] = [],
    controls: PreviewControl[] = [];
  const conversions: Conversion[] = [];
  const deferred: { key: Attribute; amount: number; label: string }[] = [];
  const criticalSources: Contribution[] = [];
  const healingEffects: {
    effect: NonNullable<Effect["outgoingHealing"]>;
    label: string;
  }[] = [];
  let criticalBonus = 0;
  let activeStackingSigil: string | undefined;
  const add = (key: Attribute, amount: number, label: string) => {
    if (Number.isFinite(amount) && amount) {
      totals[key] += amount;
      sources[key].push({ label, amount });
    }
  };
  const duration = (key: string, amount: number, label: string) => {
    if (!amount) return;
    durations[key] = (durations[key] || 0) + amount;
    (durationSources[key] ||= []).push({ label, amount });
  };
  for (const key of ["Power", "Precision", "Toughness", "Vitality"] as const)
    add(key, 1000, "80 级基础属性");
  const mainKey = weaponSet === 2 ? "weapon2" : "weapon1",
    offKey = weaponSet === 2 ? "offhand2" : "offhand1";
  const main = build.equipment[mainKey];
  const two = twoHanded.has(main.weapon);
  const weaponKeys = [mainKey, ...(two ? [] : [offKey])].filter(
    (key) => build.equipment[key as typeof mainKey].weapon,
  ) as (typeof mainKey | typeof offKey)[];
  const keys = [...armorSlots, ...accessorySlots, ...weaponKeys];
  for (const key of keys) {
    const slot = build.equipment[key];
    if (slot.statId) {
      const selected = catalog.stats.find((s) => s.id === slot.statId);
      const normalized = statOptions(catalog, key).find(
        (s) => s.name === selected?.name,
      );
      const profile =
        data.profiles[
          key.startsWith("weapon") || key.startsWith("offhand")
            ? two
              ? "twoHand"
              : "oneHand"
            : key
        ];
      if (!normalized || !profile) {
        warnings.push(`${labels[key]}词条缺少可计算的装备基准`);
      } else
        for (const attribute of normalized.attributes || []) {
          if (primaryKeys.includes(attribute.attribute))
            add(
              attribute.attribute,
              Math.round(
                attribute.multiplier * profile.adjustment + attribute.value,
              ),
              `${labels[key]} · ${normalized.name}`,
            );
        }
    }
    for (const id of slot.infusions) {
      if (!id) continue;
      const item = catalog.items.find((i) => i.id === id);
      if (!item) {
        warnings.push(`${labels[key]}灌注资料缺失`);
        continue;
      }
      for (const entry of item.details?.infix_upgrade?.attributes || [])
        if (primaryKeys.includes(entry.attribute))
          add(entry.attribute, entry.modifier, `${labels[key]} · ${item.name}`);
    }
  }
  function applyEffect(
    effect: Effect,
    label: string,
    id?: number,
    consumable = false,
  ) {
    for (const [key, value] of Object.entries(effect.flats))
      add(key as Attribute, value!, label);
    for (const [key, value] of Object.entries(effect.durations))
      duration(key, value, label);
    criticalBonus += effect.critical;
    if (effect.critical)
      criticalSources.push({ label, amount: effect.critical });
    if (consumable && effect.outgoingHealing)
      healingEffects.push({ effect: effect.outgoingHealing, label });
    for (const c of effect.conversions) conversions.push({ ...c, label });
    for (const warning of effect.warnings)
      warnings.push(`${label}：${warning}`);
    if (effect.stack && id) {
      const key = `sigil-${id}`;
      controls.push({
        key,
        label: `${label}层数`,
        description: `每层增加 ${effect.stack.amount} ${attributeLabels[effect.stack.target]}`,
        max: 25,
      });
      const stacks = Math.max(
        0,
        Math.min(25, Math.trunc(preview.stacks[key] || 0)),
      );
      if (stacks && activeStackingSigil && activeStackingSigil !== key) {
        warnings.push(`${label}：只能启用一种属性叠层法印，已忽略此法印层数`);
        return;
      }
      if (stacks) activeStackingSigil = key;
      add(effect.stack.target, stacks * effect.stack.amount, label);
    }
  }
  const runeCounts = new Map<number, number>();
  for (const key of armorSlots) {
    const id = build.equipment[key].runeId;
    if (id) runeCounts.set(id, (runeCounts.get(id) || 0) + 1);
  }
  for (const [id, count] of runeCounts) {
    const item = catalog.items.find((i) => i.id === id),
      entry = data.items[id];
    if (!item || !entry?.bonuses.length) {
      warnings.push(`${item?.name || "符文 #" + id}的属性资料缺失`);
      continue;
    }
    for (const text of entry.bonuses.slice(0, Math.min(6, count)))
      applyEffect(parseAttributeEffect(text), item.name);
  }
  const sigilIds = new Set<number>();
  for (const key of weaponKeys)
    for (const id of build.equipment[key].sigils.slice(0, two ? 2 : 1))
      if (id) sigilIds.add(id);
  // Identical sigil families do not stack, even when their rarities differ.
  const sigilFamilies = new Map<string, number>();
  for (const id of sigilIds) {
    const name = data.items[id]?.name || String(id);
    const family = name.replace(/^(?:Minor|Major|Superior) /, "");
    const rank = (value: number) =>
      ["Minor", "Major", "Superior"].findIndex((tier) =>
        data.items[value]?.name.startsWith(tier),
      );
    const previous = sigilFamilies.get(family);
    if (!previous || rank(id) > rank(previous)) sigilFamilies.set(family, id);
  }
  for (const id of sigilFamilies.values()) {
    const item = catalog.items.find((i) => i.id === id),
      entry = data.items[id];
    if (!entry) {
      warnings.push(`${item?.name || "法印 #" + id}效果资料缺失`);
      continue;
    }
    applyEffect(parseAttributeEffect(entry.text), item?.name || entry.name, id);
  }
  for (const key of ["food", "utility"] as const) {
    const id = build[key];
    if (!id) continue;
    const item = catalog.items.find((i) => i.id === id),
      entry = data.items[id];
    if (!entry) {
      warnings.push(`${item?.name || key}效果资料缺失`);
      continue;
    }
    const nutrition = consumableNutrition(item);
    if (!entry.pve || nutrition?.pve === false) {
      warnings.push(`${item?.name || entry.name}为非 PvE 消耗品，未计入`);
      continue;
    }
    if (nutrition?.excludedReason) {
      warnings.push(`${item?.name || entry.name}：${nutrition.excludedReason}`);
      continue;
    }
    const text = nutrition?.text || entry.text;
    if (text)
      applyEffect(
        parseAttributeEffect(text),
        item?.name || entry.name,
        undefined,
        true,
      );
    else warnings.push(`${item?.name || entry.name}未提供营养属性，未计入`);
  }
  const traits = activeTraits(build, catalog);
  const professionSignets = signetRules[build.profession];
  const passiveTrait = professionSignets?.passiveTrait;
  const modifierTrait = passiveTrait
    ? traits.find((t) => t.id === passiveTrait.traitId)
    : undefined;
  const passiveMultiplier = modifierTrait ? passiveTrait!.multiplier : 1;
  const retainPassive = !!(modifierTrait && passiveTrait?.retainOnCooldown);
  const stackingTrait = professionSignets?.stackingTrait;
  const stackOwner = stackingTrait
    ? traits.find((t) => t.id === stackingTrait.traitId)
    : undefined;
  if (stackingTrait && stackOwner) {
    controls.push({
      key: stackingTrait.previewKey,
      label: `${stackOwner.name}层数`,
      description: `每层 +${stackingTrait.amount} ${attributeLabels[stackingTrait.target]}，持续 ${stackingTrait.duration} 秒；独立预览当前层数`,
      max: stackingTrait.max,
    });
    const raw = preview.stacks[stackingTrait.previewKey];
    const stacks = Number.isFinite(raw)
      ? Math.max(0, Math.min(stackingTrait.max, Math.trunc(raw)))
      : 0;
    const amount = stacks * stackingTrait.amount;
    const label = `${stackOwner.name} · ${stacks} 层`;
    if (stackingTrait.feedsConversions)
      add(stackingTrait.target, amount, label);
    else deferred.push({ key: stackingTrait.target, amount, label });
  }
  const countedSkills = new Set<number>();
  const eliteSpec = catalog.specs.find(
    (s) =>
      s.id === build.specs[2].id &&
      s.profession === build.profession &&
      s.elite,
  );
  for (const [index, id] of build.skills.entries()) {
    if (!id || countedSkills.has(id)) continue;
    const skill = catalog.skills.find((s) => s.id === id);
    const kind = index === 0 ? "Heal" : index === 4 ? "Elite" : "Utility";
    if (
      !skill?.professions?.includes(build.profession) ||
      skill.type !== kind ||
      (skill.specialization &&
        !traits.some((t) => t.specialization === skill.specialization))
    )
      continue;
    countedSkills.add(id);
    const signet = professionSignets?.passives[id];
    if (signet) {
      const key = `signet-cooldown-${id}`;
      const suppression =
        signet.suppression &&
        !signet.suppression.excludedSpecializations.includes(eliteSpec?.id ?? 0)
          ? signet.suppression
          : undefined;
      if (suppression && !controls.some((c) => c.key === suppression.key))
        controls.push({
          key: suppression.key,
          label: suppression.label,
          description: suppression.description,
        });
      controls.push({
        key,
        label: `${skill.name}正在冷却`,
        description: modifierTrait
          ? `${modifierTrait.name}：${passiveMultiplier !== 1 ? `被动效果提高 ${Math.round((passiveMultiplier - 1) * 100)}%，` : ""}${retainPassive ? "冷却期间仍生效" : "冷却期间失去被动属性"}`
          : "冷却期间失去被动属性；未勾选时按技能就绪计算",
      });
      if (
        (!preview.flags[key] || retainPassive) &&
        !(suppression && preview.flags[suppression.key])
      )
        deferred.push({
          key: signet.target,
          amount: Math.round(signet.amount * passiveMultiplier),
          label: `${skill.name} · 被动${modifierTrait ? `（${modifierTrait.name}）` : ""}`,
        });
      continue;
    }
    if (nonAttributeSignets[id]) continue;
    const passive = skill?.description?.split(/\n|<br\s*\/?\s*>/i)[0] || "";
    if (
      /被动/.test(passive) &&
      /威力|精准|坚韧|体力|暴击效果|症状伤害|症状效果|增益效果|治疗效果/.test(
        passive,
      )
    )
      warnings.push(`${skill!.name}的被动属性尚未计入`);
  }
  const gate = (key: string) => {
    if (key === "fury") return preview.fury;
    if (key === "oneHand") return !!main.weapon && !two;
    if (key.startsWith("weapon:"))
      return weaponKeys.some((slot) =>
        key.slice(7).split(",").includes(build.equipment[slot].weapon),
      );
    return !!preview.flags[key];
  };
  for (const trait of traits) {
    const rules = traitRules[trait.id];
    if (!rules) {
      if (nonAttributeSignetTraits[trait.id]) continue;
      if (
        trait.facts?.some(
          (fact: any) =>
            fact.type === "BuffConversion" ||
            (fact.type === "AttributeAdjust" &&
              primaryKeys.includes(fact.target) &&
              (fact.target !== "Healing" || /2229321/.test(fact.icon || ""))) ||
            (fact.type === "Percent" &&
              /暴击率|暴击伤害|属性增加|持续时间/.test(fact.text || "")),
        )
      )
        warnings.push(`${trait.name}的属性或条件规则尚未计入`);
      continue;
    }
    for (const rule of rules) {
      if (
        rule.gate &&
        gateLabels[rule.gate] &&
        !controls.some((c) => c.key === rule.gate)
      )
        controls.push({
          key: rule.gate,
          label: gateLabels[rule.gate],
          description: trait.name,
        });
      if (rule.gate && !gate(rule.gate)) continue;
      if (rule.from && rule.target) {
        const fact = trait.facts?.find(
          (f: any) =>
            f.type === "BuffConversion" &&
            f.source === rule.from &&
            f.target === rule.target,
        );
        if (fact)
          conversions.push({
            from: rule.from,
            to: rule.target,
            percent: fact.percent,
            label: trait.name,
          });
        else warnings.push(`${trait.name}属性转换资料缺失`);
        continue;
      }
      if (rule.percentKey) {
        const fact = trait.facts?.find(
          (f: any) =>
            f.type === "Percent" &&
            (rule.percentKey === "critical"
              ? /暴击率/.test(f.text || "")
              : /持续时间/.test(f.text || "")),
        );
        const amount = rule.value ?? fact?.percent;
        if (!Number.isFinite(amount)) {
          warnings.push(`${trait.name}百分比加成资料缺失`);
          continue;
        }
        if (rule.percentKey === "critical") {
          criticalBonus += amount;
          criticalSources.push({ label: trait.name, amount });
        } else duration(rule.percentKey, amount, trait.name);
        continue;
      }
      if (rule.target) {
        const facts =
          trait.facts?.filter(
            (f: any) =>
              f.type === "AttributeAdjust" && f.target === rule.target,
          ) || [];
        const fact = facts[rule.extra ? 1 : 0];
        const value = rule.value ?? fact?.value;
        if (Number.isFinite(value)) {
          if (rule.afterConversion)
            deferred.push({
              key: rule.target,
              amount: value,
              label: trait.name,
            });
          else add(rule.target, value, trait.name);
        } else warnings.push(`${trait.name}属性加成资料缺失`);
      }
    }
  }
  // Conversion outputs, signet passives and temporary Might are excluded from the pool.
  const pool = { ...totals };
  const grouped = new Map<
    string,
    { target: Attribute; label: string; value: number }
  >();
  for (const c of conversions) {
    const key = `${c.label}:${c.to}`;
    const group = grouped.get(key) || {
      target: c.to,
      label: c.label,
      value: 0,
    };
    group.value += (pool[c.from] * c.percent) / 100;
    grouped.set(key, group);
  }
  for (const group of grouped.values())
    add(group.target, Math.round(group.value), `${group.label} · 属性转换`);
  for (const entry of deferred) add(entry.key, entry.amount, entry.label);
  if (build.relic) {
    const item = catalog.items.find((i) => i.id === build.relic),
      entry = data.items[build.relic];
    if (entry?.name === "Relic of the Aristocracy") {
      const key = "aristocracy";
      controls.push({
        key,
        label: "贵族古物层数",
        description: "每层增加 3% 症状持续时间",
        max: 5,
      });
      duration(
        "Condition",
        Math.max(0, Math.min(5, Math.trunc(preview.stacks[key] || 0))) * 3,
        item?.name || entry.name,
      );
    } else if (!entry) warnings.push(`${item?.name || "古物"}效果资料缺失`);
    else if (
      entry &&
      /all (?:attributes|stats)|concentration|expertise|precision|ferocity|healing power|vitality|toughness/i.test(
        entry.description,
      )
    )
      warnings.push(`${item?.name || entry.name}的条件属性效果尚未计入`);
  }
  const might = Math.max(
    0,
    Math.min(
      25,
      Math.trunc(Number.isFinite(preview.might) ? preview.might : 0),
    ),
  );
  add("Power", might * 30, "条件预览 · 威能");
  add("ConditionDamage", might * 30, "条件预览 · 威能");
  if (preview.fury) {
    criticalBonus += 25;
    criticalSources.push({ label: "条件预览 · 激怒", amount: 25 });
  }
  const generic = totals.ConditionDuration / 15 + (durations.Condition || 0);
  const boon = totals.BoonDuration / 15 + (durations.Boon || 0);
  const consumableHealingSources = healingEffects.flatMap(
    ({ effect, label }) => [
      ...(effect.flat ? [{ label, amount: effect.flat }] : []),
      ...effect.scaling.map(({ from, percent }) => ({
        label: `${label} · ${attributeLabels[from]} × ${percent}% ÷ 100`,
        amount: (totals[from] * percent) / 100,
      })),
    ],
  );
  return {
    consumableHealingBonus: consumableHealingSources.reduce(
      (sum, source) => sum + source.amount,
      0,
    ),
    consumableHealingSources,
    primary: totals,
    primarySources: sources,
    criticalChance: 5 + (totals.Precision - 1000) / 21 + criticalBonus,
    criticalDamage: 150 + totals.CritDamage / 15,
    criticalSources,
    conditionDuration: generic,
    boonDuration: boon,
    conditions: Object.fromEntries(
      Object.keys(conditionLabels).map((key) => [
        key,
        generic + (durations[key] || 0),
      ]),
    ),
    durationSources,
    warnings: [...new Set(warnings)],
    controls,
  };
}
