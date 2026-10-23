import { readFile } from "node:fs/promises";
import { loadSourcePolicy, writeSourcedSnapshot } from "./data-source-io.mjs";
import {
  localizeConsumables,
  localizeGameDescriptions,
  descriptionLocalizationSummary,
} from "./catalog-transforms.mjs";
const base = "https://api.guildwars2.com/v2/";
const sourcePolicy = await loadSourcePolicy();
async function get(path) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(
        base + path + (path.includes("?") ? "&" : "?") + "lang=zh",
        { signal: AbortSignal.timeout(30000) },
      );
      if (!r.ok) throw Error(`${r.status} ${path.slice(0, 60)}`);
      return await r.json();
    } catch (e) {
      if (i === 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}
const professions = await get("professions?ids=all");
const specs = await get("specializations?ids=all");
const traits = await get("traits?ids=all");
const skillIds = [
  ...new Set(professions.flatMap((p) => p.skills.map((s) => s.id))),
];
async function bulk(endpoint, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    out.push(
      ...(await get(`${endpoint}?ids=${ids.slice(i, i + 200).join(",")}`)),
    );
  }
  return out;
}
const skills = await bulk("skills", skillIds);
const gameDescriptions = JSON.parse(
  await readFile("data/game-descriptions.zh-CN.json", "utf8"),
);
const localizedGameData = {
  traits: localizeGameDescriptions(traits, gameDescriptions, "traits"),
  skills: localizeGameDescriptions(skills, gameDescriptions, "skills"),
};
const stats = (await get("itemstats?ids=all")).filter(
  (s) => s.name && s.attributes?.length,
);
const statReferenceItems = await get("items?ids=30684,80111,91234");
if (
  statReferenceItems.length !== 3 ||
  statReferenceItems.some(
    (i) => i.rarity !== "Legendary" || !i.details?.stat_choices?.length,
  )
)
  throw Error("传奇装备可选词条资料异常，停止更新。");
const statChoices = {
  equipment: [
    ...new Set(
      statReferenceItems
        .filter((i) => i.type !== "Trinket")
        .flatMap((i) => i.details.stat_choices),
    ),
  ],
  trinket: statReferenceItems.find((i) => i.type === "Trinket").details
    .stat_choices,
};
const localization = JSON.parse(
  await readFile("data/consumable-names.zh-CN.json", "utf8"),
);
const itemIds = await get("items");
const selected = [];
for (let i = 0; i < itemIds.length; i += 600) {
  const batches = [];
  for (let j = i; j < Math.min(i + 600, itemIds.length); j += 200)
    batches.push(itemIds.slice(j, j + 200));
  const results = await Promise.all(batches.map((ids) => bulk("items", ids)));
  for (const item of results.flat()) {
    const d = item.details || {};
    if (
      (item.type === "UpgradeComponent" &&
        ["Rune", "Sigil"].includes(d.type) &&
        item.rarity === "Exotic") ||
      (item.type === "UpgradeComponent" && d.infusion_upgrade_flags?.length) ||
      (item.type === "Consumable" && ["Food", "Utility"].includes(d.type)) ||
      item.type === "Relic"
    )
      selected.push(item);
  }
  if (i % 6000 === 0)
    console.log(`资料扫描 ${i}/${itemIds.length}，保留 ${selected.length}`);
  await new Promise((r) => setTimeout(r, 650));
}
const minimalItems = selected.map((i) => ({
  id: i.id,
  name: i.name,
  description: i.description || "",
  type: i.type,
  rarity: i.rarity,
  details: i.details,
}));
const localizedItems = localizeConsumables(minimalItems, localization);
const consumables = localizedItems.filter(
  (i) =>
    i.type === "Consumable" && ["Food", "Utility"].includes(i.details?.type),
);
await writeSourcedSnapshot(
  "public/catalog.json",
  {
    revision: new Date().toISOString(),
    professions,
    specs,
    ...localizedGameData,
    descriptionLocalization: descriptionLocalizationSummary(
      localizedGameData,
      gameDescriptions,
    ),
    stats,
    statChoices,
    statChoiceSource: {
      url: base + "items",
      items: [30684, 80111, 91234],
      fetchedAt: new Date().toISOString(),
    },
    items: localizedItems,
    localization: {
      source: localization.source,
      fetchedAt: localization.fetchedAt,
      matched: consumables.filter((i) => i.nameSource).length,
      changed: consumables.filter((i) => i.apiName && i.apiName !== i.name)
        .length,
      missing: consumables.filter((i) => !i.nameSource).map((i) => i.id),
    },
  },
  "catalog",
  { policy: sourcePolicy },
);
console.log(
  `资料已生成：${minimalItems.length} 个物品，${skills.length} 个技能。`,
);
