import { boonLabels, conditionLabels } from "./attributes";
import type { DetailContext, DetailFact, GameDetails } from "./game-details";

const excluded =
  /获得折磨|移除|复制|窃取|偷取|转移|延长|延续|增加.*持续时间|缩短|减少.*持续时间/;
// Recognize an actual application row, never arbitrary text containing a boon.
const prefixes =
  /^(?:个人|盟友|初始|基础|额外提供|额外|命中时|每次命中|每次脉冲|每次近战命中|第三次触发|触发时|自毁时|超充|区域|回响|职业技能|必定获得)/;
function effectKey(row: DetailFact) {
  if (excluded.test(`${row.label} ${row.recipient || ""} ${row.trigger || ""}`))
    return;
  const label = row.label
    .split(" · ")
    .at(-1)!
    .replace(/\s*[（(].*$/, "")
    .replace(prefixes, "");
  for (const [kind, labels] of [
    ["boon", boonLabels],
    ["condition", conditionLabels],
  ] as const) {
    const key = Object.keys(labels).find((key) => labels[key] === label);
    if (
      key &&
      !(
        kind === "condition" &&
        /自身|自己|自我/.test(
          `${row.label} ${row.recipient || ""} ${row.trigger || ""}`,
        )
      )
    )
      return { kind, key };
  }
}
export function projectEffectDurations(
  rows: DetailFact[],
  context: DetailContext,
): DetailFact[] {
  return rows.map((row) => {
    const effect = effectKey(row);
    const match = row.detail.match(/^(\d+(?:\.\d+)?) 秒(?=$|[ ·（(])/);
    if (!effect || !match || row.durationScaling) return row;
    const raw =
      effect.kind === "boon"
        ? (context.boons?.[effect.key] ?? context.boonDuration)
        : (context.conditions?.[effect.key] ?? context.conditionDuration);
    if (raw == null || !Number.isFinite(raw)) return row;
    const bonus = Math.max(0, Math.min(100, raw));
    const base = Number(match[1]);
    if (base <= 0) return row;
    const value = Math.round(base * (1 + bonus / 100) * 1000) / 1000;
    return {
      ...row,
      detail: `${value} 秒${row.detail.slice(match[0].length)}`,
      durationScaling: {
        base,
        bonus,
        effect:
          effect.kind === "boon"
            ? boonLabels[effect.key]
            : conditionLabels[effect.key],
      },
    };
  });
}
export function projectDurations(
  model: GameDetails,
  context: DetailContext,
): GameDetails {
  if (model.durationScalingExcluded) return model;
  return {
    ...model,
    facts: projectEffectDurations(model.facts, context),
    branches: model.branches?.map((branch) => ({
      ...branch,
      // The transformed enemy and independent summon do not inherit the player's
      // duration attributes. Unknown casters remain at their reviewed base value.
      facts: /变形目标|召唤物|精魂攻击|元素雕文|小型元素雕文/.test(branch.label)
        ? branch.facts
        : projectEffectDurations(branch.facts, context),
    })),
  };
}
