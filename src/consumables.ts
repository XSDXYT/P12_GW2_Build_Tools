import snapshot from "./data/consumables.json" with { type: "json" };
import type { Entity } from "./domain";

type Nutrition = {
  name: string;
  text: string;
  description: string;
  duration: number;
  sourceUrl: string;
  pve: boolean;
  excludedReason?: string;
};
const entries: Record<string, Nutrition> = snapshot.entries;
export function consumableNutrition(item?: Entity): Nutrition | undefined {
  if (
    !item ||
    item.type !== "Consumable" ||
    !["Food", "Utility"].includes(item.details?.type)
  )
    return;
  return entries[item.id];
}
