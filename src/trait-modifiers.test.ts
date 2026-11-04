import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBuild, type Catalog } from "./domain.ts";
import {
  calculateAttributes,
  emptyPreview,
  type AttributeData,
} from "./attributes.ts";
import { gameDetails, type DetailFact } from "./game-details.ts";
import { wikiDetails, wikiSnapshot } from "./wiki-details.ts";
import { applyWikiModifiers, type WikiModifier } from "./wiki-modifiers.ts";
import { mergeMechanicCatalog } from "./profession-mechanics.ts";
import metadata from "./data/wiki-details.json";

const catalog: Catalog = mergeMechanicCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")),
);
const attributes: AttributeData = JSON.parse(
  readFileSync("public/attribute-data.json", "utf8"),
);
const details = (id: number, traits: number[] = [], context = {}) =>
  gameDetails({ id, name: String(id) }, "skill", new Set(traits), context);
const fact = (id: number, traits: number[], label: string, context = {}) =>
  details(id, traits, context).facts.find((f) => f.label === label);

test("强力突破独立详情与父技能分支同源，稳固层数和计数冷却不随增益效果变化", () => {
  const base = details(10238);
  assert.equal(base.reviewed, true);
  assert.equal(fact(10238, [], "稳固")?.detail, "3 秒 · 3 层");
  assert.equal(
    fact(10238, [], "稳固", { boonDuration: 100 })?.detail,
    "6 秒 · 3 层",
  );
  assert.equal(
    fact(10238, [], "计数冷却时间", { boonDuration: 100 })?.detail,
    "30 秒",
  );
  assert.equal(fact(10238, [], "冷却时间")?.detail, "2 秒");
  assert.equal(fact(10238, [], "最大计数")?.detail, "2");
  const parent = wikiDetails(10237, "skill", new Set())!;
  assert.deepEqual(
    parent.branches?.find((b) => b.sourceUrl.endsWith("/Power_Break"))?.facts,
    base.facts,
  );
  assert.equal(fact(10237, [], "稳固")?.detail, "5 秒 · 4 层");
  assert.equal(base.unresolved.length, 0);
});

test("独立武器和腰带的Wiki基础冷却随合法已选特性变化，取消后恢复", () => {
  for (const [id, trait, base, changed] of [
    [9144, 557, "30 秒", "24 秒"],
    [14366, 1333, "8 秒", "6.4 秒"],
    [31167, 1872, "24 秒", "20.4 秒"],
    [12509, 1698, "8 秒", "6.4 秒"],
    [5515, 1676, "30 秒", "24 秒"],
    [10334, 708, "10 秒", "8 秒"],
    [63448, 891, "10 秒", "8.5 秒"],
  ] as const) {
    assert.equal(fact(id, [], "冷却时间")?.detail, base);
    assert.equal(fact(id, [trait], "冷却时间")?.detail, changed);
    assert.equal(fact(id, [], "冷却时间")?.detail, base);
  }
});

test("醉生梦死与风暴之魂按控制类型与法印相加，控制替代不重复累计蔑视", () => {
  assert.equal(fact(5671, [1502], "昏迷")?.detail, "2.66 秒");
  assert.equal(
    fact(5671, [1502], "昏迷", { controlDurationBonus: 30 })?.detail,
    "3.26 秒",
  );
  assert.equal(
    fact(5671, [1502], "蔑视伤害", { controlDurationBonus: 30 })?.detail,
    "326",
  );
  assert.equal(fact(5638, [1502], "晕眩")?.detail, "2 秒");
  assert.equal(
    fact(5638, [1502], "晕眩", { controlDurationBonus: 30 })?.detail,
    "2.6 秒",
  );
  assert.equal(
    fact(12508, [1070], "晕眩", { controlDurationBonus: 30 })?.detail,
    "3.6 秒",
  );
  assert.equal(
    fact(12508, [1070], "昏迷", { controlDurationBonus: 30 })?.detail,
    "3.6 秒",
  );
  assert.equal(
    fact(12508, [1070], "蔑视伤害", { controlDurationBonus: 30 })?.detail,
    "360",
  );
  assert.equal(
    fact(12508, [1070], "蔑视伤害", { controlDurationBonus: 90 })?.detail,
    "400",
  );
  assert.equal(
    fact(5687, [1502], "蔑视伤害", { controlDurationBonus: 30 })?.detail,
    "332",
  );
  assert.equal(
    fact(44998, [1502], "蔑视伤害", { controlDurationBonus: 30 })?.detail,
    "25",
  );
  assert.equal(fact(5671, [1070], "昏迷")?.detail, "2 秒"); // Other profession's trait cannot leak.
  assert.equal(
    fact(5690, [1502], "击倒", { controlDurationBonus: 30 })?.detail,
    "2 秒",
  );
  assert.equal(
    fact(5690, [1502], "蔑视伤害", { controlDurationBonus: 30 })?.detail,
    "200",
  );
  for (const [id, entry] of Object.entries(wikiSnapshot.entries.skills).filter(
    ([, e]) => e.actor,
  ))
    assert.deepEqual(
      details(+id, [], {
        healingPower: 9999,
        boonDuration: 100,
        controlDurationBonus: 30,
      }).facts,
      details(+id).facts,
      entry.title,
    );
});

test("控制时长属性区分昏迷与晕眩，法印切组和取消特性不留下加成", () => {
  for (const [profession, id, stun, daze] of [
    ["Ranger", 1070, 80, 80],
    ["Elementalist", 1502, 63, 30],
  ] as const) {
    const b = createBuild(profession);
    const t = catalog.traits.find((e) => e.id === id)!;
    b.specs[0].id = t.specialization;
    b.specs[0].traits[t.tier - 1] = id;
    b.equipment.weapon1.weapon = profession === "Ranger" ? "Longbow" : "Staff";
    b.equipment.weapon1.sigils[0] = 24639;
    const result = calculateAttributes(b, catalog, attributes);
    assert.equal(result.stunDurationBonus, stun);
    assert.equal(result.dazeDurationBonus, daze);
    assert.equal(result.controlDurationBonus, 30); // Equipment input stays separate; no double scaling.
    assert.ok(result.stunDurationSources.some((s) => s.label === t.name));
    assert.equal(
      calculateAttributes(b, catalog, attributes, 2).stunDurationBonus,
      stun - 30,
    );
    b.specs[0].traits[t.tier - 1] = null;
    assert.equal(
      calculateAttributes(b, catalog, attributes).stunDurationBonus,
      30,
    );
  }
});

test("战斗中与魔宠触发保留条件，不把冷却缩短当成常驻；神器区域与命中燃烧分开", () => {
  assert.equal(fact(78501, [2411], "冷却时间")?.detail, "10 秒");
  assert.equal(fact(78501, [2411], "战斗中冷却时间")?.detail, "8 秒");
  assert.equal(fact(78501, [2411], "战斗中冷却时间")?.trigger, "战斗中");
  assert.equal(fact(78501, [], "战斗中冷却时间"), undefined);
  assert.equal(fact(28134, [2379], "战斗中传奇切换冷却时间")?.detail, "6 秒");
  assert.equal(fact(76643, [2437], "魔宠充能所需技能次数")?.detail, "2");
  assert.equal(fact(76643, [2437], "武器技能冷却缩短")?.detail, "10%");
  assert.equal(
    fact(76643, [2437], "固定时长额外燃烧", { conditionDuration: 100 })?.detail,
    "0.5 秒",
  );
  assert.equal(fact(77357, [2437], "武器技能冷却缩短")?.detail, "33%");
  assert.equal(fact(77277, [], "区域燃烧")?.detail, "1 秒");
  assert.equal(
    fact(77277, [2431], "区域燃烧", { conditionDuration: 100 })?.detail,
    "4 秒",
  );
  assert.equal(
    fact(77277, [2431], "命中时燃烧", { conditionDuration: 100 })?.detail,
    "3 秒",
  );
});

test("工程药剂基础时长先增强再乘属性，额外增益不重复增强；器械屏障随治疗变化", () => {
  assert.equal(
    fact(5821, [473], "激怒", { boonDuration: 100 })?.detail,
    "24 秒 · +25% 暴击率",
  );
  assert.equal(
    fact(5821, [473], "额外威能", { boonDuration: 100 })?.detail,
    "30 秒 · 2 层",
  );
  assert.equal(
    fact(5865, [1679], "屏障", { healingPower: 1000 })?.detail,
    "2,322",
  );
  assert.equal(
    fact(5825, [1679], "稳固", { boonDuration: 50 })?.detail,
    "6 秒 · 5 层",
  );
  assert.equal(fact(5825, [1679], "半径")?.detail, "90");
  assert.equal(fact(6161, [1679], "蔑视伤害")?.detail, "200");
  assert.equal(fact(6161, [1679], "额外地雷")?.detail, "1");
  assert.equal(fact(5936, [473], "命中次数")?.detail, "7");
  assert.equal(fact(5937, [473], "持续时间")?.detail, "5 秒");
  assert.equal(fact(63253, [2298], "斥力纹章")?.detail, "+18% 伤害");
  assert.equal(fact(63253, [], "斥力纹章")?.detail, "+15% 伤害");
  assert.equal(fact(63113, [2298], "纹章被动")?.detail, "+12% 症状伤害");
  assert.equal(fact(56920, [1917], "半径")?.detail, "240");
  assert.equal(fact(30357, [1917], "半径")?.detail, "360");
  assert.deepEqual(fact(5834, [514], "半径"), fact(5834, [], "半径"));
  const grenade = wikiDetails(5805, "skill", new Set([514]))!;
  assert.equal(
    grenade.branches
      ?.find((b) => b.sourceUrl.endsWith("/Grenade"))
      ?.facts.find((f) => f.label === "爆炸半径")?.detail,
    "180",
  );
  assert.equal(fact(5882, [514], "爆炸半径")?.detail, "180");
});

test("游侠陷阱采用Wiki实际例外，不增强场地或新增致残的基础时长", () => {
  assert.equal(
    fact(12489, [1075], "再生", { boonDuration: 100 })?.detail,
    "10 秒 · 6 层",
  );
  assert.equal(
    fact(12499, [1075], "每次脉冲燃烧", { conditionDuration: 100 })?.detail,
    "8.3 秒",
  );
  assert.equal(fact(12499, [1075], "致残"), undefined);
  assert.equal(
    fact(12492, [1075], "每秒冰冻", { conditionDuration: 100 })?.detail,
    "6.4 秒 · -66% 技能冷却恢复速度, -66% 移动速度",
  );
  assert.equal(
    fact(12492, [1075], "致残", { conditionDuration: 100 })?.detail,
    "6 秒",
  );
  assert.equal(fact(12492, [1075], "持续时间")?.detail, "4 秒");
});

test("潜行者偷窃、体术和井按各自触发，不给其他流血技能追加偷窃流血", () => {
  assert.equal(
    fact(13014, [1706], "流血", { conditionDuration: 33 })?.detail,
    "13.3 秒 · 3 层",
  );
  for (const id of [13028, 13085, 63276])
    assert.deepEqual(details(id, [1706]).facts, details(id).facts);
  assert.equal(fact(13014, [1837], "耐力获取")?.detail, "50");
  assert.equal(fact(29516, [1949], "耐力获取")?.detail, "15");
  assert.equal(
    fact(43390, [2093], "急速", { boonDuration: 50 })?.detail,
    "6 秒",
  );
  const heal = fact(63292, [2285], "自我治疗", { healingPower: 1000 });
  assert.ok(
    details(63292, [2285], { healingPower: 1000 }).facts.some(
      (f) => f.trigger === "战斗中暗影步时" && f.detail === "745",
    ),
  );
  assert.equal(heal?.modified, false); // Original well heal remains separate.
  assert.equal(
    fact(63292, [2285], "抗性", { boonDuration: 50 })?.detail,
    "4.5 秒",
  );
  assert.equal(fact(63276, [2285], "抗性")?.detail, "3 秒");
  assert.ok(
    details(13064, [2285], { healingPower: 1000 }).facts.some(
      (f) => f.trigger === "战斗中暗影步时" && f.detail === "745",
    ),
  );
});

test("元素元晶只增强增益基础时长，PvP冷却惩罚和场地延长不混入", () => {
  assert.equal(
    fact(62813, [2251], "威能", { boonDuration: 100 })?.detail,
    "30 秒",
  );
  assert.equal(
    fact(62837, [2251], "保护", { boonDuration: 100 })?.detail,
    "3 秒 · -33% 受到的伤害",
  );
  assert.equal(fact(62813, [2251, 1510], "冷却时间")?.detail, "15 秒");
  assert.equal(fact(62813, [2251, 1510], "持续时间")?.detail, "5 秒");
  assert.equal(fact(5717, [1510], "持续时间")?.detail, "6 秒");
  assert.equal(fact(30662, [340], "火焰光环")?.detail, "5.32 秒");
});

test("唤灵师帷幕冷却、分技能增强、屏障和沙影目标分别计算", () => {
  assert.equal(fact(62621, [891], "冷却时间")?.detail, "5.1 秒");
  assert.equal(
    fact(62621, [891, 2203], "伤害")?.detail,
    "系数 ×4.8 · 8 次命中",
  );
  assert.equal(fact(62621, [2203], "折磨")?.detail, "3 秒 · 8 层");
  assert.equal(fact(62539, [2203], "晕眩"), undefined);
  assert.equal(
    fact(62539, [2203], "恐惧", { conditionDuration: 100 })?.detail,
    "2 秒",
  );
  assert.equal(fact(62563, [2203], "半径")?.detail, "300");
  assert.equal(
    fact(42297, [2080], "额外屏障", { healingPower: 1000 })?.detail,
    "1,572",
  );
  assert.equal(fact(42297, [2112], "目标数")?.detail, "5");
  assert.equal(fact(42297, [2112], "最大计数")?.detail, "3");
  assert.equal(fact(42297, [2112], "同时存在的沙影")?.detail, "1");
  assert.equal(
    fact(43148, [2080], "敏捷", { boonDuration: 100 })?.detail,
    "3 秒",
  );
  assert.equal(fact(42297, [2112], "计数冷却时间")?.detail, "18.75 秒");
  assert.equal(fact(42297, [], "计数冷却时间")?.detail, "15 秒");
  const medicine = fact(62655, [2220], "盟友增益目标");
  assert.equal(medicine?.detail, "4");
  assert.match(medicine!.recipient!, /落点范围/);
});

test("魂武五种真正本质、能量融合与指令组合独立投影，取消立即恢复", () => {
  for (const [id, label, value] of [
    [51667, "增益移除", "3"],
    [51713, "症状移除", "3"],
    [51714, "症状转移", "3"],
    [51696, "持续时间延长", "3 秒"],
    [51675, "稳固", "4 秒 · 3 层"],
  ] as const)
    assert.equal(fact(id, [1806], label)?.detail, value);
  assert.equal(fact(62757, [2255], "耐力获取")?.detail, "40");
  assert.equal(fact(62757, [2243], "能量消耗")?.detail, "0");
  assert.match(fact(62757, [2243], "获得能量")!.trigger!, /战斗中/);
  assert.equal(fact(62757, [2259], "冷却时间")?.detail, "10 秒");
  assert.equal(fact(45537, [2182], "半径")?.detail, "360");
  assert.equal(fact(45537, [2182], "持续时间")?.detail, "6 秒");
  assert.equal(fact(45537, [2182], "保护"), undefined);
  assert.equal(fact(45537, [2133], "保护")?.detail, "1 秒 · 4 次脉冲");
  assert.equal(fact(45537, [2133, 2182], "保护")?.detail, "1 秒 · 6 次脉冲");
  assert.equal(fact(45537, [], "持续时间")?.detail, "4 秒");
});

test("纹章失真反射要求同时选择模糊铭文和破碎大师", () => {
  for (const traits of [[], [752], [2035]])
    assert.equal(fact(10232, traits, "反射投射物"), undefined);
  assert.equal(fact(10232, [752, 2035], "反射投射物")?.modified, true);
});

test("十一项通用症状时长从Wiki生成进入属性来源，激怒门槛可撤销且详情封顶", () => {
  for (const rule of metadata.traitDurationBonuses) {
    const trait = catalog.traits.find((t) => t.id === rule.trait)!;
    const spec = catalog.specs.find((s) => s.id === trait.specialization)!;
    const b = createBuild(spec.profession);
    const selected = b.specs[spec.elite ? 2 : 0];
    selected.id = spec.id;
    if (trait.slot === "Major") selected.traits[trait.tier - 1] = trait.id;
    const p = { ...emptyPreview(), fury: true };
    const attrs = calculateAttributes(b, catalog, attributes, 1, p);
    for (const effect of rule.effects) {
      assert.ok(
        attrs.durationSources[effect]?.some(
          (s) => s.label === trait.name && s.amount === rule.bonus,
        ),
        `${rule.trait}/${effect}`,
      );
      const absent = calculateAttributes(
        b,
        catalog,
        attributes,
        1,
        emptyPreview(),
      );
      if (rule.gate === "fury")
        assert.equal(
          !!absent.durationSources[effect]?.some((s) => s.label === trait.name),
          false,
        );
    }
    const before = JSON.stringify(b);
    details(10645, [892], { conditions: { Fear: 300 } });
    assert.equal(JSON.stringify(b), before);
  }
  assert.equal(
    fact(10645, [892], "恐惧", { conditions: { Fear: 150 } })?.detail,
    "4 秒",
  );
  assert.equal(
    metadata.traitDurationBonuses.some((r) => r.trait === 296),
    false,
  );
});

test("冷却倍率组合和多特性门槛复制输入，同一规则重复挂载不会改变源快照", () => {
  const base: DetailFact[] = [
    { label: "冷却时间", detail: "20 秒", modified: false },
  ];
  const source = { kind: "traits", id: 1, title: "test", revision: 1 };
  const modifiers: WikiModifier[] = [
    {
      id: "a",
      trait: 1,
      traitName: "一",
      priority: 0,
      source,
      changes: [{ type: "number", label: "冷却时间", factor: 0.8 }],
    },
    {
      id: "b",
      trait: 2,
      traitName: "二",
      priority: 0,
      source,
      changes: [{ type: "number", label: "冷却时间", factor: 0.85 }],
    },
  ];
  assert.equal(
    applyWikiModifiers(base, modifiers, new Set([1, 2]))[0].detail,
    "13.6 秒",
  );
  assert.equal(
    applyWikiModifiers(base, modifiers, new Set([2]))[0].detail,
    "17 秒",
  );
  assert.equal(base[0].detail, "20 秒");
  const before = JSON.stringify(wikiSnapshot);
  for (const kind of ["skills", "traits"] as const)
    for (const [id, e] of Object.entries(wikiSnapshot.entries[kind])) {
      const mods = e.modifiers || [];
      for (const mod of mods) {
        const set = new Set([mod.trait, ...(mod.requiresTraits || [])]);
        wikiDetails(+id, kind === "skills" ? "skill" : "trait", set);
      }
    }
  assert.equal(JSON.stringify(wikiSnapshot), before);
});
