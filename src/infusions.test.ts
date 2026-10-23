import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createBuild,
  parseBuild,
  encodeShare,
  decodeShare,
  issues,
  type Catalog,
} from "./domain";
import {
  currentInfusions,
  infusionOptions,
  infusionParts,
  mergeInfusions,
} from "./infusions";

const catalog: Catalog = JSON.parse(
  readFileSync("public/catalog.json", "utf8"),
);

test("灌注候选仅保留三类、按属性去重，不将外观和其他痛苦属性变体加入候选", () => {
  const options = infusionOptions(catalog);
  assert.equal(options.length, 40);
  const effects = options.map((item) => {
    const { primary, agony } = infusionParts(item);
    if (primary) {
      assert.equal(primary.modifier, 5);
      assert.ok(agony === 0 || agony === 9);
    } else assert.ok(agony >= 1 && agony <= 24);
    return `${primary?.attribute || "pure"}/${agony}`;
  });
  assert.equal(new Set(effects).size, options.length);
  assert.equal(
    options.filter((item) => infusionParts(item).primary).length,
    16,
  );
});

test("旧版逐槽灌注按实际武器组汇总，只有显式配置的组覆盖旧值，空组可明确清空", () => {
  const build = createBuild();
  build.equipment.head.infusions = [37127];
  build.equipment.weapon1.weapon = "Staff";
  build.equipment.weapon1.infusions = [37127, null];
  build.equipment.offhand1.infusions = [37125];
  build.equipment.weapon2.weapon = "Sword";
  build.equipment.weapon2.infusions = [37125];
  assert.deepEqual(currentInfusions(build, 1), [{ id: 37127, count: 2 }]);
  assert.deepEqual(currentInfusions(build, 2), [
    { id: 37127, count: 1 },
    { id: 37125, count: 1 },
  ]);
  build.infusionLoadouts = { "1": [] };
  assert.deepEqual(currentInfusions(build, 1), []);
  assert.equal(currentInfusions(build, 2).length, 2);
  assert.deepEqual(build.equipment.head.infusions, [37127]);
});

test("+30属性、数量和两个武器组完整保存分享，超量、非整数及越界值被拒绝", () => {
  const build = createBuild();
  build.infusionLoadouts = {
    "1": [{ id: 37131, count: 18, attributeValue: 30 }],
    "2": [],
  };
  assert.deepEqual(issues(build, catalog), []);
  assert.deepEqual(parseBuild(JSON.stringify(build)), build);
  assert.deepEqual(decodeShare(encodeShare(build)), build);
  for (const patch of [
    { count: 19 },
    { count: 0 },
    { count: 1.5 },
    { attributeValue: 31 },
    { attributeValue: 0 },
    { attributeValue: 5.5 },
  ]) {
    const invalid = structuredClone(build);
    Object.assign(invalid.infusionLoadouts!["1"]![0], patch);
    assert.throws(() => parseBuild(JSON.stringify(invalid)));
  }
  build.infusionLoadouts["1"]!.push({ id: 43250, count: 1 });
  assert.throws(() => parseBuild(JSON.stringify(build)));
  build.infusionLoadouts["1"] = [{ id: 49432, count: 1, attributeValue: 30 }];
  assert.ok(issues(build, catalog).includes("仅单属性灌注可设置单枚属性值。"));
  build.infusionLoadouts["1"] = [{ id: 24548, count: 1 }];
  assert.ok(issues(build, catalog).includes("灌注配置包含无效物品。"));
});

test("相同灌注与相同属性值合并数量，国服不同数值分别保留且不修改输入", () => {
  const groups = [
    { id: 37131, count: 2, attributeValue: 30 },
    { id: 37131, count: 3, attributeValue: 30 },
    { id: 37131, count: 1, attributeValue: 5 },
  ];
  assert.deepEqual(mergeInfusions(groups), [
    { id: 37131, count: 5, attributeValue: 30 },
    { id: 37131, count: 1, attributeValue: 5 },
  ]);
  assert.equal(groups[0].count, 2);
});
