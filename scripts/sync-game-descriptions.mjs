import { readFile, writeFile } from "node:fs/promises";
import {
  descriptionText,
  localizeGameDescriptions,
  descriptionLocalizationSummary,
} from "./catalog-transforms.mjs";

const origin = "https://gw2.wishingstarmoye.com";
const sources = {
  traits: `${origin}/admin/gw2_traitsdbs`,
  skills: `${origin}/admin/gw2_skills`,
};
const endpoints = {
  traits: `${origin}/admin/gw2_traitsdb_dt_ajax`,
  skills: `${origin}/admin/gw2_skill_dt_ajax`,
};
const catalog = JSON.parse(await readFile("public/catalog.json", "utf8"));
const entries = { traits: {}, skills: {} };
for (const kind of ["traits", "skills"]) {
  const targets = new Set(catalog[kind].map((e) => e.id));
  const seen = new Set();
  let offset = 0;
  for (let page = 0; page < 60; page++) {
    const url = new URL(endpoints[kind]);
    const q = url.searchParams;
    q.set("draw", "1");
    q.set("start", String(offset));
    q.set("length", "200");
    q.set("order[0][column]", "1");
    q.set("order[0][dir]", "asc");
    for (let column = 0; column < (kind === "traits" ? 14 : 13); column++) {
      q.set(`columns[${column}][data]`, String(column));
      q.set(`columns[${column}][searchable]`, "true");
      q.set(`columns[${column}][search][value]`, "");
      q.set(`columns[${column}][search][regex]`, "false");
    }
    const response = await fetch(url, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw Error(`${kind} 中文描述读取失败 ${response.status}`);
    const result = await response.json();
    if (!Array.isArray(result.data))
      throw Error(`${kind} 表格结构变化，未更新现有快照`);
    if (!result.data.length) break;
    for (const row of result.data) {
      // Column 0 is the site's primary key, NOT the game trait/skill ID.
      const id = Number(descriptionText(row[1]));
      const databaseId = Number(row[0]);
      const name = descriptionText(row[3]);
      const description = descriptionText(row[kind === "traits" ? 6 : 11]);
      if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        !Number.isSafeInteger(databaseId) ||
        databaseId <= 0 ||
        seen.has(id)
      )
        throw Error(
          `${kind} ID或分页校验失败 ${JSON.stringify({ id, databaseId, name, repeated: seen.has(id) })}，未更新现有快照`,
        );
      seen.add(id);
      if (!targets.has(id)) continue;
      if (!name) throw Error(`${kind} ${id} 缺少名称，未更新现有快照`);
      if (!description) continue;
      if (!/[\u3400-\u9fff]/u.test(description)) continue;
      const entity = catalog[kind].find((e) => e.id === id);
      if (kind === "traits" && Number(row[7]) !== entity.specialization)
        throw Error(`特性 ${id} 分支不匹配，未更新现有快照`);
      entries[kind][id] = {
        databaseId,
        name,
        englishName: descriptionText(row[4]),
        description,
      };
    }
    offset += result.data.length;
    console.log(
      `${kind} 第 ${page + 1} 页，读取 ${offset} 项，匹配 ${Object.keys(entries[kind]).length} 项中文描述`,
    );
    // Reported totals are capped upstream. An empty page, not recordsTotal,
    // ends pagination; this also handles an upstream page-size cap.
    if (page === 59) throw Error("分页上限异常，未更新现有快照");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (Object.keys(entries[kind]).length < catalog[kind].length * 0.9)
    throw Error(`${kind} 描述覆盖率低于90%，未更新现有快照`);
}
const localization = {
  schema: 1,
  sources,
  endpoints,
  fetchedAt: new Date().toISOString(),
  mode: "unspecified",
  policy:
    "Chinese description text only. No numeric facts or game-mode inference. Sources can include mixed balance records.",
  entries,
};
const updated = {
  ...catalog,
  traits: localizeGameDescriptions(catalog.traits, localization, "traits"),
  skills: localizeGameDescriptions(catalog.skills, localization, "skills"),
};
updated.descriptionLocalization = descriptionLocalizationSummary(
  updated,
  localization,
);
await writeFile(
  "data/game-descriptions.zh-CN.json",
  JSON.stringify(localization, null, 2) + "\n",
);
await writeFile("public/catalog.json", JSON.stringify(updated));
console.log(JSON.stringify(updated.descriptionLocalization, null, 2));
