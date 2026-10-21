import { readFile, writeFile } from "node:fs/promises";
const api = "https://api.guildwars2.com/v2/";
async function get(path) {
  const response = await fetch(
    api + path + (path.includes("?") ? "&" : "?") + "lang=en",
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw Error(`${response.status}: ${path}`);
  return response.json();
}
const profileIds = {
  head: 80248,
  shoulders: 80131,
  chest: 80190,
  hands: 80111,
  legs: 80252,
  feet: 80281,
  back: 74155,
  accessory1: 81908,
  accessory2: 81908,
  amulet: 92991,
  ring1: 91234,
  ring2: 91234,
  oneHand: 30684,
  twoHand: 30703,
};
const references = await get(
  "items?ids=" + [...new Set(Object.values(profileIds))].join(","),
);
const profiles = Object.fromEntries(
  Object.entries(profileIds).map(([slot, id]) => {
    const item = references.find((i) => i.id === id);
    if (
      !item ||
      item.level !== 80 ||
      item.rarity !== "Legendary" ||
      !Number.isFinite(item.details?.attribute_adjustment)
    )
      throw Error(`装备基准无效 ${slot}`);
    return [
      slot,
      {
        id,
        name: item.name,
        adjustment: item.details.attribute_adjustment,
        statChoices: item.details.stat_choices,
      },
    ];
  }),
);
const catalog = JSON.parse(await readFile("public/catalog.json", "utf8"));
let items;
if (process.argv.includes("--cached"))
  items = JSON.parse(
    await readFile("data/attribute-items.en.json", "utf8"),
  ).items;
else {
  const ids = catalog.items
    .filter(
      (item) =>
        ["Rune", "Sigil", "Food", "Utility"].includes(item.details?.type) ||
        item.type === "Relic",
    )
    .map((item) => item.id);
  items = [];
  for (let i = 0; i < ids.length; i += 200)
    items.push(...(await get("items?ids=" + ids.slice(i, i + 200).join(","))));
  await writeFile(
    "data/attribute-items.en.json",
    JSON.stringify({
      source: api + "items?lang=en",
      fetchedAt: new Date().toISOString(),
      items,
    }),
  );
}
const output = {
  revision: new Date().toISOString(),
  source: api,
  profiles,
  items: Object.fromEntries(
    items.map((item) => [
      item.id,
      {
        name: item.name,
        text:
          item.details?.description ||
          item.details?.infix_upgrade?.buff?.description ||
          "",
        description: item.description || "",
        bonuses: item.details?.bonuses || [],
        attributes: item.details?.infix_upgrade?.attributes || [],
        pve:
          (!item.game_types ||
            item.game_types.includes("Pve") ||
            item.game_types.includes("Dungeon")) &&
          !/only (?:usable|appl(?:y|ies)) in WvW/i.test(item.description || ""),
      },
    ]),
  ),
};
await writeFile("public/attribute-data.json", JSON.stringify(output));
console.log(
  `属性基准 ${Object.keys(profiles).length} 槽位；效果资料 ${items.length} 项。`,
);
