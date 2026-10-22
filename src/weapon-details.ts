import type { DetailContext, DetailFact, GameDetails } from "./game-details";
import { scaleWikiHealing } from "./wiki-details";
import type { Entity } from "./domain";

// Independent PvE records: not a positional selection from mixed-mode API facts.
// Checked 2026-10-22 against each API-linked Wiki article and its mode history.
const records: Record<
  number,
  { title: string; rows: Omit<DetailFact, "modified">[] }
> = {
  72005: {
    title: "Inspiring_Imagery",
    rows: [
      { label: "冷却时间", detail: "12 秒" },
      { label: "威能", detail: "9 秒 · 12 层", stacks: 12 },
      { label: "激怒", detail: "9 秒" },
      { label: "目标数", detail: "5" },
      { label: "信标持续时间", detail: "2 秒" },
      { label: "半径", detail: "240" },
      { label: "射程", detail: "1200" },
      { label: "无法格挡", detail: "" },
      { label: "组合技区域", detail: "幻光" },
    ],
  },
  72076: {
    title: "Abstraction",
    rows: [
      { label: "伤害", detail: "系数 ×1.81" },
      {
        label: "治疗",
        detail: "1930 + 1.5 × 治疗效果",
        healing: { base: 1930, coefficient: 1.5 },
      },
      { label: "虚弱", detail: "5 秒" },
      { label: "目盲", detail: "5 秒" },
      { label: "症状移除", detail: "2" },
      { label: "目标数", detail: "5" },
      { label: "引爆窗口", detail: "2 秒" },
      { label: "半径", detail: "240" },
      { label: "组合技终结", detail: "爆炸 · 100%" },
    ],
  },
  73076: {
    title: "Falling_Spider",
    rows: [
      { label: "伤害", detail: "系数 ×1.8" },
      { label: "流血", detail: "3.5 秒 · 1 层", stacks: 1 },
      { label: "中毒", detail: "3.5 秒 · 1 层", stacks: 1 },
      { label: "易伤", detail: "8 秒 · 4 层", stacks: 4 },
      { label: "额外症状层数", detail: "1", trigger: "对受控或定身的目标" },
      { label: "伤害增加", detail: "15%", trigger: "对受控或定身的目标" },
      { label: "目标数", detail: "5" },
      { label: "射程", detail: "240" },
    ],
  },
};
export function weaponDetails(
  entity: Entity,
  context: DetailContext,
): GameDetails | undefined {
  const id = entity.id;
  const entry = records[id];
  if (!entry) return;
  const sourceUrl = `https://wiki.guildwars2.com/wiki/${entry.title}`;
  return {
    description: "",
    facts: scaleWikiHealing(
      entry.rows.map((r) => ({
        ...r,
        icon: entity.facts?.find(
          (f: any) =>
            f.status === r.label ||
            f.text === r.label ||
            (r.label === "冷却时间" && f.type === "Recharge"),
        )?.icon,
        modified: false,
      })),
      context.healingPower,
    ),
    unresolved: [],
    reviewed: true,
    mode: "pve",
    sources: [sourceUrl],
    sourceUrl,
    checkedAt: "2026-10-22",
    ...(id === 72005
      ? { notes: ["提前使用成像分离引爆时，不会获得本段的威能和激怒。"] }
      : {}),
  };
}
