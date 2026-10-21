import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createBuild,
  parseBuild,
  encodeShare,
  decodeShare,
  type Catalog,
} from "./domain.ts";
import {
  referenceIndex,
  parseReference,
  referenceMarkdown,
  searchReferences,
  slashQuery,
} from "./build-references.ts";
import { itemDetails } from "./game-details.ts";
import { createLibraryBackup, parseLibraryBackup } from "./library.ts";
const catalog: Catalog = JSON.parse(
  readFileSync("public/catalog.json", "utf8"),
);

test("BD描述为版本1可选字段，保存、分享及整库备份保留Markdown，旧文件不被补写字段", () => {
  const old = createBuild();
  assert.deepEqual(parseBuild(JSON.stringify(old)), old);
  assert.ok(!Object.hasOwn(old, "description"));
  const build = {
    ...old,
    description:
      "## 幻术\n使用 [幻象回复](gw2:trait/1866)。\n\n|循环|说明|\n|---|---|\n|1|**治疗**|",
  };
  assert.deepEqual(parseBuild(JSON.stringify(build)), build);
  assert.deepEqual(decodeShare(encodeShare(build)), build);
  assert.deepEqual(
    parseLibraryBackup(JSON.stringify(createLibraryBackup([build], {}))).builds,
    [build],
  );
  assert.throws(() =>
    parseBuild(JSON.stringify({ ...old, description: "字".repeat(60001) })),
  );
  assert.throws(() => parseBuild(JSON.stringify({ ...old, description: 100 })));
  let seed = 1;
  const long = {
    ...old,
    description: Array.from({ length: 30000 }, () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return String.fromCharCode(32 + (seed % 90));
    }).join(""),
  };
  assert.deepEqual(parseBuild(JSON.stringify(long)), long);
  assert.throws(() => encodeShare(long), /链接过长/);
});

test("引用按类型与真实ID区分，跨职业搜索覆盖食物、扳手、法印、符文、古物和灌注", () => {
  const index = referenceIndex(catalog);
  assert.equal(
    index.length,
    catalog.skills.length + catalog.traits.length + catalog.items.length,
  );
  for (const category of [
    "技能",
    "特性",
    "食物",
    "扳手",
    "法印",
    "符文",
    "古物",
    "灌注",
  ])
    assert.ok(
      index.some((reference) => reference.category === category),
      category,
    );
  for (const reference of index) {
    const token = referenceMarkdown(reference);
    assert.deepEqual(
      parseReference(token.slice(token.indexOf("](gw2:") + 2, -1)),
      { kind: reference.kind, id: reference.entity.id },
    );
  }
  assert.ok(
    searchReferences(index, "幻象回复", "特性").some(
      (reference) => reference.entity.id === 1866,
    ),
  );
  assert.ok(
    searchReferences(index, "聚能水晶", "扳手").some(
      (reference) => reference.entity.id === 48917,
    ),
  );
  assert.equal(parseReference("gw2:item/../../secret"), undefined);
  assert.equal(parseReference("javascript:alert(1)"), undefined);
  assert.equal(parseReference("gw2:skill/0"), undefined);
  const special = {
    kind: "skill" as const,
    category: "技能",
    entity: { id: 123, name: "同名[甲]\\乙" },
  };
  assert.equal(
    referenceMarkdown(special),
    "[同名\\[甲\\]\\\\乙](gw2:skill/123)",
  );
});

test("斜杠检索支持正文和中文紧邻，URL、代码、转义和既有引用不会误触发", () => {
  assert.deepEqual(slashQuery("使用 /幻象", 6), { start: 3, query: "幻象" });
  assert.deepEqual(slashQuery("使用/幻象", 5), { start: 2, query: "幻象" });
  for (const value of [
    "https://example.com",
    "[引用](gw2:trait/1866)",
    "`/技能",
    "```md\n/技能",
    "\\/技能",
    "path/file",
  ])
    assert.equal(slashQuery(value, value.length), undefined, value);
  const after = "```md\n示例\n```\n/技能";
  assert.equal(slashQuery(after, after.length)?.query, "技能");
});

test("物品引用详情来自对应物品，属性、符文阶级、食物时长均保持独立", () => {
  const food = catalog.items.find(
    (item) => item.details?.type === "Food" && item.details.duration_ms,
  )!;
  assert.ok(itemDetails(food).facts.some((f) => f.label === "持续时间"));
  const rune = catalog.items.find(
    (item) =>
      item.details?.type === "Rune" && item.details.bonuses.length === 6,
  )!;
  assert.equal(
    itemDetails(rune).facts.filter((f) => /件套/.test(f.label)).length,
    6,
  );
  const infusion = catalog.items.find(
    (item) =>
      item.details?.infusion_upgrade_flags?.includes("Infusion") &&
      item.details.infix_upgrade?.attributes?.some(
        (a: any) => a.attribute === "Healing",
      ),
  )!;
  assert.ok(itemDetails(infusion).facts.some((f) => f.label === "治疗效果"));
});
