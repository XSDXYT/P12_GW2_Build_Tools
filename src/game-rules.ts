// Independently reviewed PvE facts, not imported from a simulator. API records
// alone do not identify recipients, balance modes, or distinct effect packets.
export type Audience =
  | { kind: "self" }
  | { kind: "allies"; maximum: number; includesSelf: boolean }
  | { kind: "enemy" };
export type ReviewedEffect = {
  id: string;
  label: string;
  status: string;
  duration: number;
  audience: Audience;
  trigger: string;
  description: string;
  stacks?: number;
};
export type ReviewedTrait = {
  id: number;
  checkedAt: string;
  sources: string[];
  description?: string;
  cooldown?: number;
  targets?: number;
  radius?: number;
  condition?: string;
  attributes?: Partial<Record<"BoonDuration" | "ConditionDuration", number>>;
  burningDurationBonus?: number;
  criticalTriggerChance?: number;
  effects: ReviewedEffect[];
};

export const masterFencer: ReviewedTrait = {
  id: 707,
  checkedAt: "2026-10-20",
  sources: [
    "https://wiki.guildwars2.com/wiki/Master_Fencer",
    "https://wiki.guildwars2.com/wiki/Fury",
  ],
  description: "暴击触发时，自身和附近队友分别获得激怒，持续时间不同。",
  cooldown: 8,
  targets: 5,
  radius: 360,
  effects: [
    {
      id: "personal-fury",
      label: "个人激怒",
      status: "激怒",
      duration: 8,
      audience: { kind: "self" },
      trigger: "暴击触发",
      description: "暴击率 +25%（PvE）；持续时间可叠加。",
    },
    {
      id: "allied-fury",
      label: "盟友激怒",
      status: "激怒",
      duration: 4,
      audience: { kind: "allies", maximum: 4, includesSelf: false },
      trigger: "暴击触发",
      description: "暴击率 +25%（PvE）；持续时间可叠加。",
    },
  ],
};
export const chaoticPersistence: ReviewedTrait = {
  id: 1865,
  checkedAt: "2026-10-20",
  sources: [
    "https://wiki.guildwars2.com/wiki/Chaotic_Persistence",
    "https://wiki.guildwars2.com/wiki/Game_updates/2026-04-14",
  ],
  condition: "拥有再生时",
  attributes: { BoonDuration: 250, ConditionDuration: 100 },
  effects: [],
};
export const burningPrecision: ReviewedTrait = {
  id: 296,
  checkedAt: "2026-10-20",
  sources: ["https://wiki.guildwars2.com/wiki/Burning_Precision"],
  cooldown: 5,
  burningDurationBonus: 20,
  criticalTriggerChance: 33,
  effects: [
    {
      id: "critical-burning",
      label: "燃烧",
      status: "燃烧",
      duration: 3,
      stacks: 1,
      audience: { kind: "enemy" },
      trigger: "符合条件的暴击",
      description: "施加给敌人；每秒造成症状伤害。",
    },
  ],
};
export const reviewedTraitProfiles: Readonly<Record<number, ReviewedTrait>> = {
  [masterFencer.id]: masterFencer,
  [chaoticPersistence.id]: chaoticPersistence,
  [burningPrecision.id]: burningPrecision,
};

export function audienceLabel(audience: Audience) {
  if (audience.kind === "self") return "仅自身";
  if (audience.kind === "enemy") return "敌方目标";
  return `附近至多 ${audience.maximum} 名${audience.includesSelf ? "友方（含自身）" : "队友（不含自身）"}`;
}
