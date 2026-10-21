import type { DetailFact } from "./game-details";
import type { WikiRow } from "./wiki-details";
export type WikiModifier = {
  id: string;
  trait: number;
  traitName: string;
  priority: number;
  source: { kind: string; id: number; title: string; revision: number };
  changes: (
    | { type: "replace"; label: string; row: WikiRow }
    | { type: "append"; row: WikiRow }
    | { type: "duration"; label: string; factor: number }
  )[];
};
/** Project reviewed numeric rules into fresh rows; never mutate a saved build or snapshot. */
export function applyWikiModifiers(
  facts: DetailFact[],
  modifiers: WikiModifier[] | undefined,
  selectedTraits: ReadonlySet<number>,
) {
  const result = facts.map((f) => ({ ...f }));
  for (const modifier of [...(modifiers || [])].sort(
    (a, b) => a.priority - b.priority,
  )) {
    if (!selectedTraits.has(modifier.trait)) continue;
    for (const change of modifier.changes) {
      if (change.type === "append") {
        const row = change.row;
        result.push({
          ...row,
          modified: true,
          trigger: row.trigger || modifier.traitName,
        });
        continue;
      }
      const index = result.findIndex((f) => f.label === change.label);
      if (index < 0) continue;
      if (change.type === "replace") {
        const row = change.row;
        result[index] = {
          ...result[index],
          ...row,
          healing: row.healing,
          modified: true,
        };
      } else {
        const before = result[index].detail;
        result[index] = {
          ...result[index],
          detail: before.replace(
            /^(\d+(?:\.\d+)?) 秒/,
            (_, n) => `${Number((Number(n) * change.factor).toFixed(6))} 秒`,
          ),
          modified: true,
        };
      }
    }
  }
  return result;
}
