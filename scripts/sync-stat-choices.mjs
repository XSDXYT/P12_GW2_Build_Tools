import { readFile } from "node:fs/promises";
import { loadSourcePolicy, writeSourcedSnapshot } from "./data-source-io.mjs";
const sourcePolicy = await loadSourcePolicy();
const ids = [30684, 80111, 91234];
const response = await fetch(
  `https://api.guildwars2.com/v2/items?ids=${ids.join(",")}&lang=zh`,
  { signal: AbortSignal.timeout(30000) },
);
if (!response.ok) throw Error("传奇装备词条读取失败。");
const items = await response.json();
if (
  items.length !== ids.length ||
  items.some(
    (i) => i.rarity !== "Legendary" || !i.details?.stat_choices?.length,
  )
)
  throw Error("传奇装备词条结构异常。");
const statChoices = {
  equipment: [
    ...new Set(
      items
        .filter((i) => i.type !== "Trinket")
        .flatMap((i) => i.details.stat_choices),
    ),
  ],
  trinket: items.find((i) => i.type === "Trinket").details.stat_choices,
};
const c = JSON.parse(await readFile("public/catalog.json", "utf8"));
for (const id of [...statChoices.equipment, ...statChoices.trinket])
  if (!c.stats.some((s) => s.id === id))
    throw Error(`缺少词条资料 #${id}，请先更新完整资料。`);
c.statChoices = statChoices;
c.statChoiceSource = {
  url: "https://api.guildwars2.com/v2/items",
  items: ids,
  fetchedAt: new Date().toISOString(),
};
await writeSourcedSnapshot("public/catalog.json", c, "catalog", {
  policy: sourcePolicy,
});
console.log(
  `装备可选 ${statChoices.equipment.length} 个词条；饰品可选 ${statChoices.trinket.length} 个词条；保留旧 ID 查找表以兼容历史配装。`,
);
