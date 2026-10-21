import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  descriptionText,
  localizeGameDescriptions,
  descriptionLocalizationSummary,
} from "./catalog-transforms.mjs";

test("技能和特性描述按各自的游戏ID对应，不混用数据库主键且不覆盖数值", () => {
  const facts = [
    { type: "Buff", duration: 4 },
    { type: "Buff", duration: 8 },
  ];
  const originals = [
    {
      id: 707,
      name: "原名称",
      description: "API原说明",
      facts,
      traited_facts: [{ overrides: 1, duration: 9 }],
    },
    { id: 157, name: "另一项", description: "保留原文" },
  ];
  const before = JSON.stringify(originals);
  const localization = {
    sources: {
      traits: "https://example.test/traits",
      skills: "https://example.test/skills",
    },
    entries: {
      traits: { 707: { databaseId: 157, description: "星岬岛特性说明" } },
      skills: { 707: { databaseId: 15, description: "星岬岛技能说明" } },
    },
  };
  const [trait, unmatched] = localizeGameDescriptions(
    originals,
    localization,
    "traits",
  );
  assert.equal(trait.name, "原名称");
  assert.equal(trait.description, "星岬岛特性说明");
  assert.equal(trait.apiDescription, "API原说明");
  assert.equal(trait.descriptionSourceUrl, "https://example.test/traits/157");
  assert.deepEqual(trait.facts, facts);
  assert.deepEqual(trait.traited_facts, originals[0].traited_facts);
  assert.equal(unmatched, originals[1]);
  assert.equal(
    localizeGameDescriptions(originals, localization, "skills")[0].description,
    "星岬岛技能说明",
  );
  assert.equal(JSON.stringify(originals), before);
});

test("重复刷新保留最初API说明，空白译文回退；来源不标记为PvE", () => {
  const original = [
    { id: 1, description: "官方说明" },
    { id: 2, description: "另一说明" },
  ];
  const localization = {
    sources: { traits: "https://example.test/traits" },
    fetchedAt: "2026-10-20",
    entries: {
      traits: {
        1: { databaseId: 15, description: "第一版说明" },
        2: { databaseId: 16, description: " " },
      },
    },
  };
  const first = localizeGameDescriptions(original, localization, "traits");
  localization.entries.traits[1].description = "第二版说明";
  const second = localizeGameDescriptions(first, localization, "traits");
  assert.equal(second[0].apiDescription, "官方说明");
  assert.equal(second[0].description, "第二版说明");
  assert.equal(second[1], original[1]);
  assert.deepEqual(
    descriptionLocalizationSummary(
      { traits: second, skills: [] },
      localization,
    ),
    {
      sources: localization.sources,
      fetchedAt: localization.fetchedAt,
      mode: "unspecified",
      traits: { matched: 1, changed: 1, missing: [2] },
      skills: { matched: 0, changed: 0, missing: [] },
    },
  );
});

test("表格描述保留换行和中文实体，剥离展示标记与脚本内容", () => {
  assert.equal(
    descriptionText(
      "<p>被动：<c=@reminder>威力</c> &amp; 精准。</p><p>激活：&#x518D;&#29983;。<br>下一行。</p><script>alert(1)</script><style>.x{}</style>",
    ),
    "被动：威力 & 精准。\n激活：再生。\n下一行。",
  );
  assert.equal(descriptionText('<a href="/traits/157">707</a>'), "707");
  assert.doesNotThrow(() => descriptionText("&#x110000;&#xD800;"));
});

test("随项目提供的描述快照覆盖当前目录并保留来源及API数值", () => {
  const localization = JSON.parse(
    readFileSync("data/game-descriptions.zh-CN.json", "utf8"),
  );
  const catalog = JSON.parse(readFileSync("public/catalog.json", "utf8"));
  assert.equal(localization.mode, "unspecified");
  for (const kind of ["traits", "skills"]) {
    const entries = localization.entries[kind];
    assert.ok(Object.keys(entries).length >= catalog[kind].length * 0.9);
    for (const entity of catalog[kind]) {
      if (!entries[entity.id]) continue;
      assert.equal(entity.description, entries[entity.id].description);
      assert.equal(entity.descriptionSource, "wishingstarmoye");
      assert.equal(typeof entity.apiDescription, "string");
      assert.equal(
        entity.descriptionSourceUrl,
        `${localization.sources[kind]}/${entries[entity.id].databaseId}`,
      );
    }
  }
  const persistence = catalog.traits.find((t) => t.id === 1865);
  assert.deepEqual(
    persistence.facts
      .filter((f) => f.type === "AttributeAdjust")
      .map((f) => f.value),
    [250, 100, 250, 150, 150],
  );
});
