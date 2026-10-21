import type { Attribute } from "./attributes";
import type { Build } from "./domain";

type ProfessionSignets = {
  passives: Readonly<
    Partial<
      Record<
        number,
        {
          target: Attribute;
          amount: number;
          suppression?: {
            key: string;
            label: string;
            description: string;
            excludedSpecializations: number[];
          };
        }
      >
    >
  >;
  passiveTrait?: {
    traitId: number;
    multiplier: number;
    retainOnCooldown: boolean;
  };
  stackingTrait?: {
    traitId: number;
    previewKey: string;
    target: Attribute;
    amount: number;
    max: number;
    duration: number;
    feedsConversions: boolean;
  };
};

// Fixed level-80 PvE facts, independent of translated descriptions and mixed API facts.
// Sources and reference revision: docs/ATTRIBUTES.md and BUILD_EDITOR_REFERENCE.md.
export const signetRules: Readonly<
  Partial<Record<Build["profession"], ProfessionSignets>>
> = {
  Guardian: {
    passives: {
      9093: { target: "Power", amount: 180 },
      9151: { target: "ConditionDamage", amount: 180 },
      9163: { target: "BoonDuration", amount: 120 },
    },
    passiveTrait: { traitId: 579, multiplier: 1.2, retainOnCooldown: true },
  },
  Mesmer: {
    passives: {
      10232: { target: "ConditionDamage", amount: 180 },
      10234: { target: "ConditionDuration", amount: 180 },
    },
    // Blurred Inscriptions (752) improves actives, not these passive grants.
  },
  Elementalist: {
    passives: {
      5542: { target: "Precision", amount: 180 },
    },
    passiveTrait: { traitId: 287, multiplier: 1, retainOnCooldown: true },
    // Signet of Earth (5571) reduces strike damage; it no longer grants Toughness.
  },
  Warrior: {
    passives: {
      14404: { target: "Power", amount: 180 },
      14410: { target: "Precision", amount: 180 },
    },
    stackingTrait: {
      traitId: 1344,
      previewKey: "signet-mastery",
      target: "CritDamage",
      amount: 100,
      max: 5,
      duration: 60,
      feedsConversions: true,
    },
    // Signet Mastery stacks do not enhance or retain equipped signet passives.
  },
  Ranger: {
    passives: {
      12500: { target: "Toughness", amount: 180 },
      12491: { target: "CritDamage", amount: 180 },
    },
    // Stoneform grants active boons, not passive enhancement or retention.
  },
  Thief: {
    passives: {
      13046: { target: "Power", amount: 180 },
      13062: { target: "Precision", amount: 180 },
    },
  },
  Necromancer: {
    passives: {
      10622: {
        target: "Power",
        amount: 180,
        suppression: {
          key: "signet-shroud",
          label: "处于帷幕状态",
          description:
            "怨恨纹章被动在帷幕中失效；仅预览此纹章，不模拟其他帷幕效果",
          excludedSpecializations: [60],
        },
      },
    },
    // Signets of Suffering (909) no longer enhances/retains signet passives.
  },
  // Their signets have no direct player attribute grants in the current catalog.
  Engineer: { passives: {} },
  Revenant: { passives: {} },
};

// Audited non-attribute passives. These remain selectable/detail-readable, but must
// not be guessed into player stats or reported as missing attribute calculations.
// The complete ID classification is regression-checked against the local catalog.
export const nonAttributeSignets: Readonly<Partial<Record<number, string>>> = {
  9158: "移除症状",
  9150: "受到伤害减免",
  30461: "治疗生命值",
  14389: "治疗生命值",
  14479: "耐力回复",
  14413: "受到伤害减免",
  14355: "怒气资源",
  63049: "治疗生命值与机甲",
  63095: "其他纹章冷却缩减",
  63262: "受到伤害减免",
  63111: "移动速度与机甲增益复制",
  63253: "打击伤害输出比例",
  63113: "症状伤害输出比例，不是症状伤害属性",
  12502: "治疗生命值与宠物",
  12542: "移动速度",
  13050: "命中时治疗生命值",
  13064: "先攻资源",
  13060: "移动速度",
  5503: "施法时治疗生命值",
  5570: "受到症状持续时间减免",
  5572: "移动速度",
  5571: "受到打击伤害减免，不是旧版坚韧",
  21750: "召唤幻象时治疗生命值",
  10236: "周期性随机增益",
  10247: "周期性分身生成",
  29519: "受到控制持续时间减免",
  21762: "生命虹吸伤害与治疗，不是威力或治疗效果属性",
  10612: "移动速度",
  10562: "受到症状伤害减免",
  10611: "生命之力资源",
};

export const nonAttributeSignetTraits: Readonly<
  Partial<Record<number, string>>
> = {
  752: "纹章主动效果与失真",
  909: "纹章主动生命虹吸与增益移除，不是面板威力或治疗效果",
  1021: "触发次级纹章与主动威能/激怒",
  1267: "先攻资源",
  2298: "机甲纹章非属性被动增强与冷却保留",
};
