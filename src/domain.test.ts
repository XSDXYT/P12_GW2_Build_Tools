import test from "node:test";
import assert from "node:assert/strict";
import {
  createBuild,
  parseBuild,
  encodeShare,
  decodeShare,
  issues,
  type Catalog,
} from "./domain.ts";
import { zlibSync, strToU8 } from "fflate";
const c: Catalog = {
  revision: "test",
  professions: [{ id: "Mesmer", weapons: { Staff: { flags: ["TwoHand"] } } }],
  specs: [
    {
      id: 1,
      name: "核心",
      profession: "Mesmer",
      elite: false,
      major_traits: [11],
    },
  ],
  traits: [{ id: 11, name: "特性", specialization: 1, tier: 1, slot: "Major" }],
  skills: [{ id: 10, name: "治疗", type: "Heal", professions: ["Mesmer"] }],
  stats: [{ id: 1, name: "属性" }],
  items: [
    { id: 2, name: "食物", details: { type: "Food" } },
    { id: 3, name: "灌注", details: { infusion_upgrade_flags: ["Infusion"] } },
  ],
};
test("中文、不同装备属性、混合灌注和消耗品完整往返", () => {
  const b = createBuild();
  b.name = "朋友的治疗配装 🦋";
  b.equipment.head.statId = 1;
  b.equipment.ring1.infusions = [3, null, 3];
  b.food = 2;
  const link = encodeShare(b);
  assert.deepEqual(decodeShare(link), b);
  assert.deepEqual(parseBuild(JSON.stringify(b)), b);
});
test("未知版本、坏链接和超大文件被拒绝", () => {
  assert.throws(() =>
    parseBuild(JSON.stringify({ ...createBuild(), version: 2 })),
  );
  assert.throws(() => decodeShare("!!!"));
  assert.throws(() => decodeShare("a".repeat(12001)));
  assert.throws(() => parseBuild(" ".repeat(262145)));
});
test("解压膨胀有大小上限", () => {
  const bytes = zlibSync(strToU8(" ".repeat(300000)));
  const payload = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  assert.throws(() => decodeShare(payload), /超出/);
});
test("特性重复、职业技能不匹配和错误消耗品被发现", () => {
  const b = createBuild();
  b.specs[0].id = 1;
  b.specs[1].id = 1;
  b.skills[1] = 10;
  b.food = 3;
  const errors = issues(b, c);
  assert.ok(errors.some((s) => s.includes("不能重复")));
  assert.ok(errors.some((s) => s.includes("技能槽")));
  assert.ok(errors.some((s) => s.includes("类别不匹配")));
});
test("双手武器冲突及非法灌注引用被发现", () => {
  const b = createBuild();
  b.equipment.weapon1.weapon = "Staff";
  b.equipment.offhand1.statId = 1;
  b.equipment.head.infusions = [2];
  assert.ok(issues(b, c).some((s) => s.includes("不能同时配置副手")));
  assert.ok(issues(b, c).some((s) => s.includes("灌注无效")));
});
test("空草稿允许保存，但不通过完整分享校验", () => {
  const b = createBuild();
  assert.deepEqual(issues(b, c), []);
  assert.ok(issues(b, c, true).length > 0);
});

test("现代词条来源于传奇装备选择集合，去重且不包含基础属性", async () => {
  const { readFile } = await import("node:fs/promises");
  const { statOptions } = await import("./domain.ts");
  const real: Catalog = JSON.parse(
    await readFile("public/catalog.json", "utf8"),
  );
  const armor = statOptions(real, "head");
  const trinkets = statOptions(real, "ring1");
  assert.equal(armor.length, 39);
  assert.equal(trinkets.length, 43);
  assert.equal(new Set(armor.map((s) => s.name)).size, armor.length);
  for (const word of ["狂战士", "天界", "毒蛇"])
    assert.equal(armor.filter((s) => s.name === word).length, 1);
  for (const word of ["威能", "精准", "体力", "强韧", "治愈", "恶意"])
    assert.ok(!armor.some((s) => s.name === word));
  const b = createBuild();
  b.equipment.head.statId = 599; // Existing Berserker ID remains readable.
  assert.deepEqual(issues(b, real), []);
  b.equipment.head.statId = 137;
  assert.ok(
    issues(b, real).some((message) => message.includes("不是当前可选配装词条")),
  );
});

test("消耗品中文按真实游戏 ID 对齐并保留 API 原名", async () => {
  const { readFile } = await import("node:fs/promises");
  const real: Catalog = JSON.parse(
    await readFile("public/catalog.json", "utf8"),
  );
  const consumables = real.items.filter(
    (i) =>
      i.type === "Consumable" && ["Food", "Utility"].includes(i.details?.type),
  );
  assert.equal(consumables.length, 1107);
  assert.ok(
    consumables.every(
      (i) => i.nameSource === "wishingstarmoye" && i.englishName,
    ),
  );
  assert.equal(real.items.find((i) => i.id === 48917)?.name, "剧毒聚能水晶");
  assert.equal(real.items.find((i) => i.id === 48917)?.apiName, "剧毒调谐水晶");
  assert.equal(real.items.find((i) => i.id === 72575)?.name, "碗装咖喱淡菜汤");
  assert.equal(real.items.find((i) => i.id === 67528)?.name, "富饶保养油");
});

test("整套词条按槽位匹配 ID，跳过空武器且不修改其他组件", async () => {
  const { readFile } = await import("node:fs/promises");
  const { applyEquipmentStat, statOptions } = await import("./domain.ts");
  const real: Catalog = JSON.parse(
    await readFile("public/catalog.json", "utf8"),
  );
  const build = createBuild();
  build.equipment.weapon1.weapon = "Staff";
  build.equipment.weapon1.infusions = [null, null];
  build.equipment.offhand1.infusions = [];
  build.equipment.head.runeId = 24836;
  build.equipment.head.infusions = [37123];
  build.food = 72575;
  build.utility = 48917;
  const total = applyEquipmentStat(build, real, 161);
  assert.equal(total, 13);
  assert.equal(build.equipment.head.statId, 161);
  assert.equal(
    build.equipment.ring1.statId,
    statOptions(real, "ring1").find((s) => s.name === "狂战士")!.id,
  );
  assert.equal(build.equipment.offhand1.statId, null);
  assert.equal(build.equipment.weapon2.statId, null);
  assert.equal(build.equipment.head.runeId, 24836);
  assert.deepEqual(build.equipment.head.infusions, [37123]);
  assert.equal(build.food, 72575);
  assert.equal(build.utility, 48917);
  const before = structuredClone(build);
  const trinketOnly = statOptions(real, "ring1").find(
    (s) => s.name === "狂战士和女武神",
  )!;
  assert.throws(() => applyEquipmentStat(build, real, trinketOnly.id));
  assert.deepEqual(build, before);
});
