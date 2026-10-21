import type { Entity } from "./domain";
import { attributeLabels } from "./attributes";
import {
  audienceLabel,
  reviewedTraitProfiles,
  type Audience,
  type ReviewedTrait,
} from "./game-rules";
import { pveSources, pveTrait } from "./pve-traits";
import { wikiDetails } from "./wiki-details";

export type DetailKind = "trait" | "skill";
export type GameFact = {
  type?: string;
  text?: string;
  icon?: string;
  value?: number | boolean;
  target?: string;
  source?: string;
  percent?: number;
  duration?: number;
  status?: string;
  description?: string;
  apply_count?: number;
  distance?: number;
  hit_count?: number;
  dmg_multiplier?: number;
  field_type?: string;
  finisher_type?: string;
  prefix?: { icon?: string; status?: string };
  requires_trait?: number;
  overrides?: number;
};
export type DetailFact = {
  label: string;
  detail: string;
  icon?: string;
  prefixIcon?: string;
  description?: string;
  stacks?: number;
  modified: boolean;
  effectId?: string;
  audience?: Audience;
  recipient?: string;
  trigger?: string;
  healing?: { base: number; coefficient: number };
  scaling?: { value: number; healingPower: number; formula: string };
};
export type GameDetails = {
  description: string;
  facts: DetailFact[];
  unresolved: { label: string; reason: string; records: DetailFact[] }[];
  reviewed: boolean;
  sources: string[];
  checkedAt?: string;
  mode?: "pve";
  notes?: string[];
  sourceUrl?: string;
  selectedTraitNotes?: { id: number; name: string; description: string }[];
  branches?: { label: string; facts: DetailFact[]; sourceUrl: string }[];
};
export function gameText(value = "") {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}
const terms: Record<string, string> = {
  Recharge: "冷却时间",
  "Apply Buff/Condition": "效果",
  Time: "持续时间",
  Damage: "伤害",
  Number: "数量",
  Percent: "比例",
  Distance: "距离",
  Range: "射程",
  Duration: "持续时间",
  "Combo Field": "组合技区域",
  "Combo Finisher": "组合技终结",
  "Breaks stun": "解除昏迷",
  StunBreak: "解除昏迷",
  Unblockable: "无法格挡",
  Fire: "火焰",
  Water: "流水",
  Ice: "寒冰",
  Lightning: "闪电",
  Light: "光明",
  Dark: "黑暗",
  Ethereal: "幻光",
  Smoke: "烟雾",
  Poison: "毒素",
  Blast: "爆炸",
  Leap: "跳跃",
  Projectile: "投射物",
  Whirl: "旋风",
};
const translate = (value = "") => terms[value] || gameText(value);
const statName = (value = "") =>
  attributeLabels[value as keyof typeof attributeLabels] || translate(value);
const intensityEffects = new Set([
  "威能",
  "稳固",
  "流血",
  "燃烧",
  "中毒",
  "折磨",
  "困惑",
  "易伤",
]);
const n = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));

function formatFact(
  fact: GameFact,
  kind: DetailKind,
  modified: boolean,
): DetailFact | null {
  const label = gameText(fact.text || "");
  const row: DetailFact = {
    label: translate(label) || "效果",
    detail: "",
    icon: fact.icon,
    prefixIcon: fact.prefix?.icon,
    description: gameText(fact.description),
    modified,
  };
  const value = typeof fact.value === "number" ? fact.value : undefined;
  switch (fact.type) {
    case "Buff":
    case "PrefixedBuff":
      // Specific API labels may distinguish personal/ally/trigger packets.
      // Never replace them with a generic boon name.
      row.label =
        [
          fact.prefix?.status,
          label && label !== "Apply Buff/Condition"
            ? translate(label)
            : fact.status,
        ]
          .filter(Boolean)
          .join(" · ") || "效果";
      row.detail =
        fact.duration != null
          ? fact.duration
            ? `${n(fact.duration)} 秒`
            : "持续生效"
          : "";
      if (fact.apply_count != null && fact.apply_count > 0) {
        if (intensityEffects.has(fact.status || "")) {
          row.stacks = fact.apply_count;
          row.detail += `${row.detail ? " · " : ""}${fact.apply_count} 层`;
        } else if (fact.apply_count > 1) {
          row.detail += `${row.detail ? " · " : ""}施加 ${fact.apply_count} 次`;
        }
      }
      break;
    case "AttributeAdjust":
      row.label = label || statName(fact.target);
      row.detail =
        value != null ? `${value >= 0 ? "+" : ""}${n(value)}` : "数值未提供";
      break;
    case "BuffConversion":
      row.label = `${statName(fact.source)} → ${statName(fact.target)}`;
      row.detail = fact.percent != null ? `${n(fact.percent)}%` : "比例未提供";
      break;
    case "Percent":
      row.detail = fact.percent != null ? `${n(fact.percent)}%` : "比例未提供";
      break;
    case "Recharge":
      row.label =
        label === "Recharge" || !label
          ? kind === "trait"
            ? "内置冷却"
            : "冷却时间"
          : translate(label);
      row.detail = value != null ? `${n(value)} 秒` : "数值未提供";
      break;
    case "Time":
    case "Duration":
      row.detail =
        value != null || fact.duration != null
          ? `${n(value ?? fact.duration!)} 秒`
          : "数值未提供";
      break;
    case "Range":
    case "Distance":
      row.detail =
        value != null || fact.distance != null
          ? n(value ?? fact.distance!)
          : "数值未提供";
      break;
    case "Number":
      row.detail = value != null ? n(value) : "数值未提供";
      break;
    case "Damage":
      row.detail =
        fact.dmg_multiplier != null
          ? `系数 ×${n(fact.dmg_multiplier)}`
          : "系数未提供";
      if (fact.hit_count != null) row.detail += ` · ${fact.hit_count} 次命中`;
      break;
    case "HealingAdjust":
      row.detail = "治疗数值未提供";
      break;
    case "ComboField":
      row.label = label || "组合技区域";
      row.detail = translate(fact.field_type);
      break;
    case "ComboFinisher":
      row.label = label || "组合技终结";
      row.detail = `${translate(fact.finisher_type)}${fact.percent != null ? ` · ${n(fact.percent)}%` : ""}`;
      break;
    case "StunBreak":
    case "Unblockable":
      row.label = label ? translate(label) : translate(fact.type);
      break;
    case "NoData":
      if (!label) return null;
      break;
    default:
      if (!label && value == null) return null;
      if (value != null) row.detail = n(value);
  }
  return row;
}

function reviewedFacts(profile: ReviewedTrait, entity: Entity): DetailFact[] {
  const rows: DetailFact[] = [];
  const icon = (type: string, status?: string) =>
    entity.facts?.find(
      (fact: GameFact) =>
        fact.type === type && (!status || fact.status === status),
    )?.icon;
  const add = (
    label: string,
    detail: string,
    factIcon?: string,
  ): DetailFact => {
    const row = { label, detail, icon: factIcon, modified: false };
    rows.push(row);
    return row;
  };
  if (profile.cooldown != null)
    add("内置冷却", `${n(profile.cooldown)} 秒`, icon("Recharge"));
  if (profile.criticalTriggerChance != null)
    add(
      "暴击时触发几率",
      `${n(profile.criticalTriggerChance)}%`,
      icon("Percent"),
    );
  for (const effect of profile.effects) {
    const row = add(
      effect.label,
      `${n(effect.duration)} 秒${effect.stacks != null ? ` · ${effect.stacks} 层` : ""}`,
      icon("Buff", effect.status),
    );
    row.effectId = effect.id;
    row.audience = effect.audience;
    row.recipient = audienceLabel(effect.audience);
    row.trigger = effect.trigger;
    row.description = effect.description;
    row.stacks = effect.stacks;
  }
  if (profile.burningDurationBonus != null)
    add(
      "持续时间延长",
      `${n(profile.burningDurationBonus)}%（燃烧）`,
      entity.facts?.find(
        (fact: GameFact) =>
          fact.type === "Percent" && /持续时间/.test(fact.text || ""),
      )?.icon,
    );
  for (const [key, value] of Object.entries(profile.attributes || {})) {
    const row = add(
      statName(key),
      `+${n(value)}`,
      key === "BoonDuration"
        ? "https://render.guildwars2.com/file/6574560606F6BA1B32E9CF0F6C9709D1C1F2D9A6/2207782.png"
        : "https://render.guildwars2.com/file/4977CD5BAF0A7B6412DCC775C3909F7D4EFE4C65/2229319.png",
    );
    row.recipient = "仅自身";
    row.trigger = profile.condition;
  }
  if (profile.targets != null)
    add("目标数", `${profile.targets}（含自身）`, icon("Number"));
  if (profile.radius != null) add("半径", n(profile.radius), icon("Distance"));
  return rows;
}

/** Keep explicit recipient semantics only while every modeled number agrees with Wiki. */
export function reviewedProfileMatchesWiki(
  profile: ReviewedTrait,
  facts: DetailFact[],
) {
  const matches = (label: string, amount: number, unit = "") =>
    facts.some(
      (f) =>
        f.label === label &&
        new RegExp(
          `^[+]?${String(amount).replace(".", "\\.")}${unit}(?:$|[ ·（])`,
        ).test(f.detail),
    );
  if (profile.cooldown != null && !matches("内置冷却", profile.cooldown, " 秒"))
    return false;
  if (profile.radius != null && !matches("半径", profile.radius)) return false;
  if (profile.targets != null && !matches("目标数", profile.targets))
    return false;
  for (const [key, value] of Object.entries(profile.attributes || {}))
    if (!matches(statName(key), value)) return false;
  for (const effect of profile.effects) {
    const label = effect.id === "allied-fury" ? "激怒" : effect.label;
    if (!matches(label, effect.duration, " 秒")) return false;
    if (
      effect.stacks != null &&
      !facts.some((f) => f.label === label && (f.stacks ?? 1) === effect.stacks)
    )
      return false;
    if (
      profile.id === 707 &&
      !facts.some((f) => f.label === label && f.detail.includes("+25%"))
    )
      return false;
  }
  if (
    profile.criticalTriggerChance != null &&
    !matches("暴击时触发几率", profile.criticalTriggerChance, "%")
  )
    return false;
  if (
    profile.burningDurationBonus != null &&
    !matches("持续时间延长", profile.burningDurationBonus, "%")
  )
    return false;
  return true;
}

function pveFacts(entity: Entity): DetailFact[] | undefined {
  const definition = pveTrait(entity.id);
  if (!definition) return;
  const statTargets: Record<string, string> = Object.fromEntries(
    Object.entries(attributeLabels).map(([key, label]) => [label, key]),
  );
  const icon = (type: string, status?: string) =>
    entity.facts?.find(
      (fact: GameFact) =>
        fact.type === type && (!status || fact.status === status),
    )?.icon;
  const facts: DetailFact[] = definition.rows.map((row) => {
    const target = statTargets[row.label];
    const statIcon = target
      ? entity.facts?.find(
          (fact: GameFact) =>
            fact.type === "AttributeAdjust" &&
            fact.target === target &&
            /22293|2207782/.test(fact.icon || ""),
        )?.icon
      : undefined;
    return {
      label: row.label,
      detail: `${target && row.amount > 0 ? "+" : ""}${n(row.amount)}${row.unit === "s" ? " 秒" : row.unit === "%" ? "%" : ""}`,
      icon: statIcon || (/冷却/.test(row.label) ? icon("Recharge") : undefined),
      modified: false,
    };
  });
  for (const [index, effect] of definition.effects.entries()) {
    const intensity = intensityEffects.has(effect.status);
    const count = effect.stacks || 1;
    facts.push({
      label: effect.status,
      detail: `${n(effect.duration)} 秒${intensity ? ` · ${count} 层` : count > 1 ? ` · 施加 ${count} 次` : ""}${effect.applications && effect.applications > 1 ? ` · ${effect.applications} 次应用` : ""}`,
      icon: icon("Buff", effect.status) || icon("PrefixedBuff", effect.status),
      modified: false,
      ...(intensity ? { stacks: count } : {}),
      recipient: effect.recipient,
      trigger: effect.trigger,
      effectId: `pve-${entity.id}-${index}`,
    });
  }
  return facts;
}

export function gameDetails(
  entity: Entity,
  kind: DetailKind,
  selectedTraits: ReadonlySet<number>,
  context: { healingPower?: number } = {},
): GameDetails {
  // overrides addresses the ORIGINAL facts array, before filtering, grouping, or appending.
  const base: { fact: GameFact; modified: boolean }[] = (
    entity.facts || []
  ).map((fact: GameFact) => ({ fact, modified: false }));
  for (const fact of (entity.traited_facts || []) as GameFact[]) {
    if (!fact.requires_trait || !selectedTraits.has(fact.requires_trait))
      continue;
    if (
      fact.overrides != null &&
      fact.overrides >= 0 &&
      fact.overrides < (entity.facts?.length || 0)
    )
      base[fact.overrides] = { fact, modified: true };
    else base.push({ fact, modified: true });
  }
  const profile =
    kind === "trait" ? reviewedTraitProfiles[entity.id] : undefined;
  const wiki = wikiDetails(entity.id, kind, selectedTraits, context);
  // Wiki owns numeric truth. Preserve independently reviewed recipient semantics
  // only when their modeled values still agree; conflicts use Wiki directly.
  if (
    profile &&
    (!wiki ||
      (wiki.reviewed && reviewedProfileMatchesWiki(profile, wiki.facts)))
  )
    return {
      description: gameText(entity.description) || profile.description || "",
      facts: reviewedFacts(profile, entity),
      unresolved: [],
      reviewed: true,
      sources: [...(wiki?.sources || []), ...profile.sources],
      sourceUrl: wiki?.sourceUrl,
      checkedAt: profile.checkedAt,
      mode: "pve",
    };
  if (wiki)
    return {
      description: gameText(entity.description),
      ...wiki,
      unresolved: [],
      ...(wiki.reviewed ? { mode: "pve" as const } : {}),
    };
  if (kind === "trait") {
    const facts = pveFacts(entity);
    return {
      description: gameText(entity.description),
      facts: facts || [],
      unresolved: [],
      reviewed: !!facts,
      sources: pveSources(entity.id),
      ...(facts ? { mode: "pve" as const } : {}),
    };
  }
  const groups = new Map<string, DetailFact[]>();
  for (const { fact, modified } of base) {
    const row = formatFact(fact, kind, modified);
    if (!row) continue;
    const key = JSON.stringify([
      fact.type,
      row.label,
      fact.target,
      fact.source,
      fact.prefix?.status,
    ]);
    const group = groups.get(key) || [];
    // Even identical values can be separate self/ally/stage packets. Only a
    // reviewed model may decide that they are duplicates or alternatives.
    group.push(row);
    groups.set(key, group);
  }
  const facts: DetailFact[] = [],
    unresolved: GameDetails["unresolved"] = [];
  for (const group of groups.values()) {
    if (group.length === 1) facts.push(group[0]);
    else
      unresolved.push({
        label: group[0].label,
        reason: "原始资料未区分效果对象、触发阶段或玩法，暂不作 PvE 效果结论。",
        records: group,
      });
  }
  return {
    description: gameText(entity.description),
    facts,
    unresolved,
    reviewed: false,
    sources: [],
  };
}

export function detailFacts(
  entity: Entity,
  kind: DetailKind,
  selectedTraits: ReadonlySet<number>,
): DetailFact[] {
  return gameDetails(entity, kind, selectedTraits).facts;
}
