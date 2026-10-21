import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calculateAttributes,
  emptyPreview,
  type AttributeData,
} from "./attributes";
import {
  createBuild,
  armorSlots,
  accessorySlots,
  type Catalog,
} from "./domain";
import { itemDetails } from "./game-details";
import { describe } from "./editor";
import { consumableNutrition } from "./consumables";
const catalog: Catalog = JSON.parse(
  readFileSync("public/catalog.json", "utf8"),
);
const data: AttributeData = JSON.parse(
  readFileSync("public/attribute-data.json", "utf8"),
);
const item = (id: number) => catalog.items.find((i) => i.id === id)!;

test("三种迷雾灌注扳手可在PvE生效，三种迷雾盛宴仍只适用WvW", () => {
  const b = createBuild();
  for (const key of [...armorSlots, ...accessorySlots])
    b.equipment[key].statId = 161;
  Object.assign(b.equipment.weapon1, { weapon: "Staff", statId: 161 });
  const base = calculateAttributes(b, catalog, data);
  b.utility = 99845;
  const stone = calculateAttributes(b, catalog, data);
  assert.equal(
    stone.primary.Power - base.primary.Power,
    Math.round(base.primary.Precision * 0.03 + base.primary.CritDamage * 0.06),
  );
  assert.ok(!stone.warnings.some((w) => w.includes("非 PvE")));
  b.utility = 102135;
  assert.equal(
    calculateAttributes(b, catalog, data).primary.ConditionDamage -
      base.primary.ConditionDamage,
    Math.round(
      base.primary.Precision * 0.03 + base.primary.ConditionDuration * 0.08,
    ),
  );
  for (const id of [99785, 99794, 99804]) {
    b.utility = null;
    b.food = id;
    const r = calculateAttributes(b, catalog, data);
    assert.deepEqual(r.primary, base.primary);
    assert.equal(r.consumableHealingBonus, 0);
    assert.ok(r.warnings.some((w) => w.includes("非 PvE")));
  }
});

test("保养油按当前治疗/增益属性产生盟友治疗加成，与食物相加且不增加治疗属性", () => {
  const b = createBuild();
  b.food = 91690;
  const food = calculateAttributes(b, catalog, data);
  assert.equal(food.primary.Healing, 100);
  assert.equal(food.primary.BoonDuration, 70);
  assert.equal(food.consumableHealingBonus, 10);
  for (const oil of [99842, 67528]) {
    b.utility = oil;
    const r = calculateAttributes(b, catalog, data);
    assert.deepEqual(r.primary, food.primary);
    assert.ok(Math.abs(r.consumableHealingBonus - 11.16) < 1e-8);
    assert.ok(
      Math.abs(
        r.consumableHealingSources.reduce((n, s) => n + s.amount, 0) -
          r.consumableHealingBonus,
      ) < 1e-8,
    );
    const p = { ...emptyPreview(), might: 25, flags: { regeneration: true } };
    assert.equal(
      calculateAttributes(b, catalog, data, 1, p).consumableHealingBonus,
      r.consumableHealingBonus,
    );
  }
  b.utility = null;
  assert.equal(
    calculateAttributes(b, catalog, data).consumableHealingBonus,
    10,
  );
  b.food = null;
  assert.equal(calculateAttributes(b, catalog, data).consumableHealingBonus, 0);
});

test("API缺失的普通/升华食物在选择器、详情与计算中使用同一份营养", () => {
  const b = createBuild();
  b.food = 91842;
  const r = calculateAttributes(b, catalog, data);
  assert.equal(r.primary.BoonDuration, 100);
  assert.equal(r.primary.ConditionDuration, 70);
  for (const id of [91842, 91690, 12551, 83545]) {
    const nutrition = consumableNutrition(item(id))!;
    assert.ok(nutrition.text);
    assert.ok(nutrition.sourceUrl.includes("oldid="));
    assert.ok(
      describe(item(id)).includes(
        nutrition.description.replaceAll("\n", " "),
      ) || describe(item(id)).includes(nutrition.description),
    );
    assert.ok(
      itemDetails(item(id)).description.includes(nutrition.description),
    );
  }
  assert.ok(
    itemDetails(item(12551)).facts.some(
      (f) => f.label === "持续时间" && f.detail === "3600 秒",
    ),
  );
  // The descriptive salvage sentence used to hide the enhancement in the picker.
  assert.equal(consumableNutrition(item(83545))?.duration, 1200);
  assert.ok(describe(item(99845)).includes("3%"));
  assert.ok(describe(item(99842)).includes("0.6%"));
});

test("其他盟友治疗措辞可识别；击杀或施放治疗技能的触发奖励不当作永久属性", () => {
  const b = createBuild();
  b.food = 76840;
  const pudding = calculateAttributes(b, catalog, data);
  assert.equal(pudding.consumableHealingBonus, 10);
  assert.equal(pudding.primary.Healing, 0);
  assert.ok(pudding.warnings.some((w) => w.includes("条件或百分比")));
  b.food = 91689;
  const platter = calculateAttributes(b, catalog, data);
  assert.equal(platter.primary.Power, 1000);
  assert.equal(platter.primary.Precision, 1050);
  assert.equal(platter.primary.ConditionDamage, 50);
  b.food = 98924;
  assert.ok(
    calculateAttributes(b, catalog, data).warnings.some((w) =>
      w.includes("条件或百分比"),
    ),
  );
});

test("地图祝福与收藏碎层效果展示限定，不作为常规食物重复加基本属性", () => {
  for (const id of [80272, 74065]) {
    const b = createBuild();
    b.food = id;
    const r = calculateAttributes(b, catalog, data);
    assert.equal(r.primary.Power, 1000);
    assert.equal(r.primary.ConditionDamage, 0);
    assert.equal(r.consumableHealingBonus, 0);
    assert.ok(r.warnings.some((w) => w.includes("限定")));
    assert.ok(
      itemDetails(item(id)).description.includes(
        id === 80272 ? "多里克湖" : "迷雾碎层",
      ),
    );
  }
});
