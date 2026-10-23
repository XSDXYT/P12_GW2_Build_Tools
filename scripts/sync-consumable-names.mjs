import { readFile, writeFile } from "node:fs/promises";
import { loadSourcePolicy, writeSourcedSnapshot } from "./data-source-io.mjs";
const sourcePolicy = await loadSourcePolicy();
import { localizeConsumables } from "./catalog-transforms.mjs";
const endpoint = "https://gw2.wishingstarmoye.com/admin/gw2_itemdb_dt_ajax";
const entries = {};
const plain = (value) =>
  String(value)
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .trim();
for (const type of ["Food", "Utility"]) {
  for (let page = 0; page < 20; page++) {
    const url = new URL(endpoint),
      q = url.searchParams;
    q.set("draw", "1");
    q.set("start", String(page * 500));
    q.set("length", "500");
    for (let column = 0; column < 13; column++) {
      q.set(`columns[${column}][data]`, String(column));
      q.set(`columns[${column}][searchable]`, "true");
      q.set(
        `columns[${column}][search][value]`,
        column === 7 ? "^" + type + "$" : "",
      );
      q.set(`columns[${column}][search][regex]`, "true");
    }
    const response = await fetch(url, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error(`中文物品库读取失败 ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.data))
      throw Error("中文物品库格式变更，停止更新。");
    for (const row of data.data) {
      // Column 0 is a database primary key. Column 1 is the actual GW2 item ID.
      const id = Number(plain(row[1])),
        name = plain(row[3]),
        englishName = plain(row[4]);
      if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        !name ||
        !plain(row[7]).startsWith(type)
      )
        throw Error("中文条目 ID 或类别校验失败。");
      entries[id] = { name, englishName, type };
    }
    console.log(`${type} 第 ${page + 1} 页，${data.data.length} 条`);
    // The service caps recordsFiltered at 500 even when later pages exist.
    if (data.data.length < 500) break;
    if (page === 19) throw Error("分页数量异常，停止更新。");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
const localization = {
  source: "https://gw2.wishingstarmoye.com/admin/gw2_itemdbs",
  endpoint,
  fetchedAt: new Date().toISOString(),
  entries,
};
const catalog = JSON.parse(await readFile("public/catalog.json", "utf8"));
const targets = catalog.items.filter(
  (i) =>
    i.type === "Consumable" && ["Food", "Utility"].includes(i.details?.type),
);
const missing = targets.filter((i) => !entries[i.id]);
if (missing.length)
  throw Error(
    "中文物品库未覆盖 " +
      missing.map((i) => i.id).join(",") +
      "；未覆盖现有文件。",
  );
const updated = localizeConsumables(catalog.items, localization);
const changed = updated.filter((i) => i.apiName && i.name !== i.apiName);
await writeFile(
  "data/consumable-names.zh-CN.json",
  JSON.stringify(localization, null, 2) + "\n",
);
catalog.items = updated;
catalog.localization = {
  source: localization.source,
  fetchedAt: localization.fetchedAt,
  matched: targets.length,
  changed: changed.length,
};
await writeSourcedSnapshot("public/catalog.json", catalog, "catalog", {
  policy: sourcePolicy,
});
console.log(
  `按物品 ID 核对 ${targets.length} 项，中文名差异 ${changed.length} 项。`,
);
console.log(
  changed.slice(0, 12).map((i) => ({ id: i.id, api: i.apiName, cn: i.name })),
);
