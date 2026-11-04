import type { DetailFact } from "./game-details";

// Explicit PvE rows reviewed against the bundled Wiki revisions. Short/mixed CC
// and unmatched revisions stay unchanged; never multiply every Defiance row.
// Sources: Superior_Sigil_of_Paralyzation, Control_effect, Signet_of_Humility,
// Basilisk_Venom (Stone counts as stun; the caster's sigil applies to allies).
export type ControlRule = {
  title: string;
  revision: number;
  defiance: number;
  control?: { label: string; seconds: number };
  alternateControls?: { label: string; seconds: number }[];
};
export const sigilControlRules: Record<number, ControlRule> = {
  "76811": {
    title: "Buoyant_Deluge",
    revision: 3078973,
    defiance: 200,
    control: {
      label: "昏迷",
      seconds: 2.0,
    },
  },
  "5868": {
    title: "Supply_Crate",
    revision: 3172741,
    defiance: 200,
    control: {
      label: "昏迷",
      seconds: 2.0,
    },
  },
  "6161": {
    title: "Throw_Mine",
    revision: 2750035,
    defiance: 200,
    control: {
      label: "昏迷",
      seconds: 2.0,
    },
  },
  "31248": {
    title: "Blast_Gyro",
    revision: 2776618,
    defiance: 300,
    control: {
      label: "昏迷",
      seconds: 3.0,
    },
  },
  "77069": {
    title: "Solid_State",
    revision: 3205663,
    defiance: 200,
    control: {
      label: "昏迷",
      seconds: 2.0,
    },
  },
  "62549": {
    title: "Heel_Crack",
    revision: 2882559,
    defiance: 200,
    control: {
      label: "昏迷",
      seconds: 2.0,
    },
  },
  "76687": {
    title: "Daring_Advance",
    revision: 3208342,
    defiance: 200,
    control: {
      label: "昏迷",
      seconds: 2.0,
    },
  },
  "10232": {
    title: "Signet_of_Domination",
    revision: 3171622,
    defiance: 200,
    control: {
      label: "昏迷",
      seconds: 2.0,
    },
  },
  "30557": {
    title: "Executioner's_Scythe",
    revision: 3166168,
    defiance: 150,
    control: {
      label: "昏迷",
      seconds: 1.5,
    },
  },
  "76968": {
    title: "Twin_Moon_Sweep",
    revision: 3170434,
    defiance: 100,
    control: {
      label: "昏迷",
      seconds: 1.0,
    },
  },
  "76582": {
    title: "Metal_Legion_Guitar",
    revision: 3128646,
    defiance: 200,
    control: {
      label: "昏迷",
      seconds: 2.0,
    },
  },
  "30343": {
    title: "Head_Butt",
    revision: 2967010,
    defiance: 300,
    control: {
      label: "昏迷",
      seconds: 3.0,
    },
  },
  "5638": {
    title: "Arcane_Wave",
    revision: 3021340,
    defiance: 200,
    control: {
      label: "晕眩",
      seconds: 2.0,
    },
  },
  "77078": {
    title: "Piercing_Stance",
    revision: 3101998,
    defiance: 150,
    control: {
      label: "晕眩",
      seconds: 1.5,
    },
  },
  "10287": {
    title: "Diversion",
    revision: 3069398,
    defiance: 100,
    control: {
      label: "晕眩",
      seconds: 1.0,
    },
  },
  "29856": {
    title: "Well_of_Senility",
    revision: 3097215,
    defiance: 200,
    control: {
      label: "晕眩",
      seconds: 2.0,
    },
  },
  "42851": {
    title: "Mirage_Advance",
    revision: 2882551,
    defiance: 200,
    control: {
      label: "晕眩",
      seconds: 2.0,
    },
  },
  "45743": {
    title: "Charge_(soulbeast)",
    revision: 2923610,
    defiance: 200,
    control: {
      label: "晕眩",
      seconds: 2.0,
    },
  },
  "66258": {
    title: "Heavy_Shot_(soulbeast)",
    revision: 2776820,
    defiance: 200,
    control: {
      label: "晕眩",
      seconds: 2.0,
    },
  },
  "62878": {
    title: "Reaver's_Rage",
    revision: 3158853,
    defiance: 150,
    control: {
      label: "晕眩",
      seconds: 1.5,
    },
  },
  "78615": {
    title: "Release_Potential:_Mesmer",
    revision: 3206179,
    defiance: 200,
    control: {
      label: "晕眩",
      seconds: 2.0,
    },
  },
  "29516": {
    title: "Impact_Strike",
    revision: 2768615,
    defiance: 200,
    control: {
      label: "晕眩",
      seconds: 2.0,
    },
  },
  "63230": {
    title: "Well_of_Silence",
    revision: 2840246,
    defiance: 200,
    control: {
      label: "晕眩",
      seconds: 2.0,
    },
  },
  "14405": {
    title: "Banner_of_Strength",
    revision: 3110872,
    defiance: 200,
    control: {
      label: "晕眩",
      seconds: 2.0,
    },
  },
  "29679": {
    title: "Skull_Grinder",
    revision: 3109680,
    defiance: 100,
    control: {
      label: "晕眩",
      seconds: 1.0,
    },
  },
  "29941": {
    title: "Wild_Blow",
    revision: 2811856,
    defiance: 300,
    control: {
      label: "晕眩",
      seconds: 3.0,
    },
  },
  "30879": {
    title: "Rupturing_Smash",
    revision: 3129009,
    defiance: 100,
    control: {
      label: "晕眩",
      seconds: 1.0,
    },
  },
  "29519": {
    title: "Signet_of_Humility",
    revision: 3199892,
    defiance: 350,
  },
  "13132": {
    title: "Basilisk_Venom",
    revision: 2917431,
    defiance: 150,
    control: { label: "石化持续时间", seconds: 1.5 },
  },
};

export function projectSigilControl(
  facts: DetailFact[],
  id: number,
  page: {
    title: string;
    revision: number;
    identityVerified?: boolean;
    controlRule?: ControlRule;
  },
  bonus?: number,
  traitBonuses: { name: string; effects: string[]; bonus: number }[] = [],
): DetailFact[] {
  const rule = page.controlRule || sigilControlRules[id];
  const applicable = rule?.control
    ? traitBonuses.filter(
        (t) =>
          t.effects.includes(rule.control!.label) &&
          Number.isFinite(t.bonus) &&
          t.bonus > 0,
      )
    : [];
  if (
    !rule ||
    page.identityVerified === false ||
    page.title !== rule.title ||
    page.revision !== rule.revision ||
    (bonus != null && (!Number.isFinite(bonus) || bonus < 0))
  )
    return facts;
  const amount = Math.min(
    100,
    (bonus || 0) + applicable.reduce((sum, t) => sum + t.bonus, 0),
  );
  if (!amount) return facts;
  const defiance = facts.filter((f) => f.label === "蔑视伤害");
  const controlDefinitions = [
    rule.control,
    ...(rule.alternateControls || []),
  ].filter((c): c is { label: string; seconds: number } => !!c);
  const controls = controlDefinitions.map((c) => ({
    definition: c,
    facts: facts.filter((f) => f.label === c.label),
  }));
  if (
    defiance.length !== 1 ||
    defiance[0].modified ||
    defiance[0].detail !== String(rule.defiance) ||
    controls.some(
      (c) =>
        c.facts.length !== 1 ||
        c.facts[0].modified ||
        c.facts[0].detail !== `${c.definition.seconds} 秒`,
    )
  )
    return facts;
  return facts.map((f) => {
    const control = controls.find((c) => c.facts[0] === f)?.definition;
    const base =
      f === defiance[0] ? rule.defiance : control ? control.seconds : undefined;
    if (base == null) return f;
    const rowTraits = control
      ? traitBonuses.filter(
          (t) =>
            t.effects.includes(control.label) &&
            Number.isFinite(t.bonus) &&
            t.bonus > 0,
        )
      : applicable;
    const rowAmount = control
      ? Math.min(100, (bonus || 0) + rowTraits.reduce((s, t) => s + t.bonus, 0))
      : amount;
    if (!rowAmount) return f;
    return {
      ...f,
      detail: `${Number((base * (1 + rowAmount / 100)).toFixed(6))}${f === defiance[0] ? "" : " 秒"}`,
      modified: f.modified || rowTraits.length > 0,
      equipmentScaling: {
        base: f.detail,
        bonus: rowAmount,
        source: [
          ...(bonus ? ["超级瘫痪法印"] : []),
          ...rowTraits.map((t) => t.name),
        ].join("、"),
      },
    };
  });
}
