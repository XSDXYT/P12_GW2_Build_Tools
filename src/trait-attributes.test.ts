import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createBuild,
  encodeShare,
  type Build,
  type Catalog,
} from "./domain.ts";
import {
  calculateAttributes,
  emptyPreview,
  primaryKeys,
  type AttributeData,
  type Preview,
} from "./attributes.ts";
import { gameDetails } from "./game-details.ts";
import metadata from "./data/wiki-details.json";
import { mergeSkillCatalog, weaponSkillSlots } from "./weapon-skills.ts";

const catalog: Catalog = JSON.parse(
  readFileSync("public/catalog.json", "utf8"),
);
const data: AttributeData = JSON.parse(
  readFileSync("public/attribute-data.json", "utf8"),
);
const calc = (b: Build, p = emptyPreview(), set: 1 | 2 = 1, c = catalog) =>
  calculateAttributes(b, c, data, set, p);
function build(...ids: number[]) {
  const first = catalog.traits.find((t) => t.id === ids[0])!;
  const profession = catalog.specs.find(
    (s) => s.id === first.specialization,
  )!.profession;
  const b = createBuild(profession);
  for (const id of ids) {
    const t = catalog.traits.find((t) => t.id === id)!;
    const spec = catalog.specs.find((s) => s.id === t.specialization)!;
    let index = b.specs.findIndex((s) => s.id === spec.id);
    if (index < 0) index = spec.elite ? 2 : b.specs.findIndex((s) => !s.id);
    b.specs[index].id = spec.id;
    if (t.slot === "Major") b.specs[index].traits[t.tier - 1] = id;
  }
  return b;
}
const contribution = (
  b: Build,
  key: (typeof primaryKeys)[number],
  id: number,
  p = emptyPreview(),
) =>
  calc(b, p)
    .primarySources[key].filter((s) =>
      s.label.startsWith(catalog.traits.find((t) => t.id === id)!.name),
    )
    .reduce((n, s) => n + s.amount, 0);
const close = (n: number, e: number) =>
  assert.ok(Math.abs(n - e) < 1e-8, `${n} != ${e}`);

test("Wiki直接属性与转换不从API混合facts回退；九项来源合计与面板一致", () => {
  for (const def of metadata.traitAttributeBonuses) {
    const b = build(def.trait),
      original = structuredClone(b);
    const p: Preview = {
      might: 25,
      fury: true,
      flags: {
        quickness: true,
        berserk: true,
        arcaneLightning: true,
        activeShade: true,
        soulbeastMerged: true,
        "signet-shroud": true,
      },
      stacks: { carapace: 30, targetConditions: 14 },
    };
    const r = calc(b, p),
      changed = structuredClone(catalog);
    changed.traits.find((t) => t.id === def.trait)!.facts = [
      { type: "AttributeAdjust", target: "Power", value: 999999 },
      {
        type: "BuffConversion",
        source: "Vitality",
        target: "ConditionDuration",
        percent: 999,
      },
    ];
    const mutated = calc(b, p, 1, changed);
    assert.deepEqual(mutated.primary, r.primary, def.name);
    for (const key of [
      "criticalChance",
      "criticalDamage",
      "outgoingHealingBonus",
      "conditionDuration",
      "boonDuration",
    ] as const)
      close(mutated[key], r[key]);
    for (const key of primaryKeys)
      close(
        r.primarySources[key].reduce((n, s) => n + s.amount, 0),
        r.primary[key],
      );
    assert.deepEqual(b, original);
  }
});

test("守护：狂热利刃基础威力在转换后，巨剑部分在转换前；急速三属性可取消", () => {
  const b = build(653);
  b.utility = 48917;
  assert.equal(calc(b).primary.ConditionDamage, 60);
  b.equipment.weapon1.weapon = "Greatsword";
  assert.equal(calc(b).primary.ConditionDamage, 64); // Reads the conditional 120, excludes the baseline 120.
  const g = build(2148),
    p = { ...emptyPreview(), flags: { quickness: true } };
  for (const k of ["ConditionDamage", "Healing", "Vitality"] as const)
    assert.equal(contribution(g, k, 2148, p), 250);
  assert.equal(contribution(g, "Vitality", 2148), 0);
});

test("战士：激怒症伤和流血暴击独立；威能额外威力不进入属性转换", () => {
  const b = build(1343, 1453, 1449),
    p = {
      ...emptyPreview(),
      might: 25,
      fury: true,
      flags: { targetBleeding: true },
    };
  assert.equal(contribution(b, "ConditionDamage", 1343, p), 180);
  assert.equal(contribution(b, "Power", 1453, p), 250);
  assert.equal(contribution(b, "Vitality", 1449, p), 100);
  const r = calc(b, p);
  assert.ok(
    r.criticalSources.some(
      (s) =>
        s.amount === 5 &&
        s.label === catalog.traits.find((t) => t.id === 1343)!.name,
    ),
  );
});

test("狂暴：血液反应两种转换翻倍，致命狂乱仅在合法狂暴专精中生效", () => {
  const b = build(2011),
    p = { ...emptyPreview(), flags: { berserk: true } };
  assert.equal(contribution(b, "CritDamage", 2011), 120);
  assert.equal(contribution(b, "CritDamage", 2011, p), 240);
  assert.equal(contribution(b, "Power", 2046), 0);
  assert.equal(contribution(b, "Power", 2046, p), 300);
  assert.equal(contribution(b, "ConditionDamage", 2011, p), 312); // (1000+300)*24%, no conversion chaining.
  b.specs[0] = b.specs[2];
  b.specs[2] = { id: null, traits: [null, null, null] };
  assert.equal(contribution(b, "Power", 2046, p), 0);
});

test("工程：爆破护盾与动能加速器读取同一转换前池；应用力量无10层属性门槛", () => {
  const b = build(1944, 2052),
    p = { ...emptyPreview(), might: 1 };
  assert.equal(contribution(b, "Vitality", 1944, p), 100);
  assert.equal(contribution(b, "BoonDuration", 2052, p), 130);
  const force = build(1849);
  assert.equal(contribution(force, "Power", 1849, p), 30);
  assert.equal(contribution(force, "Power", 1849, { ...p, might: 25 }), 750);
  assert.equal(
    contribution(build(1923), "CritDamage", 1923, {
      ...emptyPreview(),
      fury: true,
    }),
    150,
  );
});

test("游侠：源泉用Wiki实际6.5%；魂兽只获150兽王奖励，不重复宠物斧/尖牙属性", () => {
  assert.equal(contribution(build(978), "Healing", 978), 65);
  const b = build(1900, 970),
    p = { ...emptyPreview(), flags: { soulbeastMerged: true } };
  b.specs[2] = { id: 55, traits: [null, null, null] };
  for (const k of [
    "Power",
    "ConditionDamage",
    "Precision",
    "Toughness",
    "Vitality",
  ] as const)
    assert.equal(contribution(b, k, 1900, p), 150);
  assert.equal(contribution(b, "Power", 1900), 0);
  b.equipment.weapon1.weapon = "Axe";
  assert.equal(contribution(b, "CritDamage", 970, p), 240);
  const pet = build(1016);
  pet.specs[2] = { id: 55, traits: [null, null, null] };
  assert.equal(contribution(pet, "Precision", 1016, p), 0);
  assert.equal(contribution(pet, "CritDamage", 1016, p), 0);
});

test("潜行：法杖/权杖奖励随当前武器组改变，第二选项先加症伤再转换治疗", () => {
  const b = build(2284);
  b.equipment.weapon1.weapon = "Scepter";
  b.equipment.weapon2.weapon = "Dagger";
  assert.equal(contribution(b, "ConditionDamage", 2284), 180);
  assert.equal(contribution(b, "Healing", 2284), 13);
  assert.equal(calc(b, emptyPreview(), 2).primary.Healing, 6);
  const staff = build(1884);
  staff.equipment.weapon1.weapon = "Staff";
  assert.equal(contribution(staff, "Power", 1884), 240);
  assert.equal(
    contribution(build(2093), "Power", 2093, {
      ...emptyPreview(),
      flags: { quickness: true },
    }),
    200,
  );
});

test("元素：威力满溢需要10层威能，火焰协调翻倍；秘法闪电需手动触发", () => {
  const b = build(334),
    p = { ...emptyPreview(), might: 9, flags: { fire: true } };
  assert.equal(contribution(b, "Power", 334, p), 0);
  assert.equal(contribution(b, "Power", 334, { ...p, might: 10 }), 300);
  assert.equal(
    contribution(b, "Power", 334, { ...p, might: 10, flags: { air: true } }),
    150,
  );
  assert.equal(contribution(build(263), "CritDamage", 263), 0);
  assert.equal(
    contribution(build(263), "CritDamage", 263, {
      ...emptyPreview(),
      flags: { arcaneLightning: true },
    }),
    150,
  );
});

test("唤灵：甲壳每层20坚韧与10威力/症伤，合法层数0–30；症状种类不等于层数", () => {
  const b = build(855);
  for (const count of [30, 99, 30.9]) {
    const p = { ...emptyPreview(), stacks: { carapace: count } };
    assert.equal(contribution(b, "Toughness", 839, p), 600);
    assert.equal(contribution(b, "Power", 855, p), 300);
    assert.equal(contribution(b, "ConditionDamage", 855, p), 300);
  }
  for (const count of [-1, NaN, Infinity])
    assert.equal(
      contribution(b, "Power", 855, {
        ...emptyPreview(),
        stacks: { carapace: count },
      }),
      0,
    );
  const c = calc(build(810), {
    ...emptyPreview(),
    stacks: { targetConditions: 99 },
  });
  assert.ok(c.criticalSources.some((s) => s.amount === 28));
  assert.equal(contribution(build(810), "ConditionDamage", 810), 153); // Furious Demise adds 180 precision first.
});

test("唤灵：夺魂猛攻与活跃沙影严格按专精/状态隔离，转换输出不链式传播", () => {
  const b = build(2021),
    p = { ...emptyPreview(), flags: { "signet-shroud": true } };
  assert.equal(contribution(b, "CritDamage", 2021), 0);
  assert.equal(contribution(b, "CritDamage", 2021, p), 300);
  assert.equal(contribution(build(2121), "BoonDuration", 2121), 0);
  assert.equal(
    contribution(build(2121), "ConditionDuration", 2121, {
      ...emptyPreview(),
      flags: { activeShade: true },
    }),
    225,
  );
  const h = build(2192, 829);
  assert.equal(contribution(h, "CritDamage", 2192), 161); // Alchemic Vigor's +240 is included; converted vitality is not.
  assert.equal(contribution(build(2220, 829), "BoonDuration", 2220), 161);
});

test("额外核实：现身额外威力、终焉仪式三种互斥血线与宠物英勇合体奖励", () => {
  assert.equal(contribution(build(1704), "Power", 1704), 80);
  assert.equal(
    contribution(build(1704), "Power", 1704, {
      ...emptyPreview(),
      flags: { revealed: true },
    }),
    200,
  );
  for (const [flags, healing] of [
    [{}, 150],
    [{ healthBelow75: true }, 300],
    [{ healthBelow50: true }, 450],
    [{ healthBelow75: true, healthBelow50: true }, 450],
  ] as const)
    assert.equal(
      contribution(build(1931), "Healing", 1931, { ...emptyPreview(), flags }),
      healing,
    );
  const pet = build(1065);
  assert.equal(contribution(pet, "CritDamage", 1065), 0);
  pet.specs[2] = { id: 55, traits: [null, null, null] };
  assert.equal(
    contribution(pet, "CritDamage", 1065, {
      ...emptyPreview(),
      flags: { soulbeastMerged: true },
    }),
    300,
  );
});

test("魂武：生命调谐120治疗参与自身7%转换；帝国分裂血线预览互斥", () => {
  const b = build(1821);
  assert.equal(contribution(b, "Healing", 1821), 120);
  assert.equal(contribution(b, "BoonDuration", 1821), 8);
  const e = build(2229),
    hi = calc(e),
    lo = calc(e, { ...emptyPreview(), flags: { healthBelow50: true } });
  assert.equal(hi.primary.Power - lo.primary.Power, 240);
  assert.equal(lo.primary.Healing - hi.primary.Healing, 240);
  assert.equal(contribution(build(1770), "Power", 1770), 130);
});

test("新增属性实时进入技能治疗/增益与症状时长详情；条件不写入版本1或分享", () => {
  const b = build(2148),
    original = structuredClone(b),
    hash = encodeShare(b),
    p = { ...emptyPreview(), flags: { quickness: true } };
  const r = calc(b, p),
    base = calc(b);
  const details = (hp: number) =>
    gameDetails(
      {
        id: catalog.skills.find(
          (s) => s.professions?.includes("Guardian") && s.type === "Heal",
        )!.id,
        name: "治疗技能",
      },
      "skill",
      new Set(),
      { healingPower: hp },
    );
  const healed = details(r.primary.Healing).facts.find((f) => f.scaling),
    unbuffed = details(base.primary.Healing).facts.find(
      (f) => f.label === healed?.label,
    );
  assert.ok(healed?.scaling && unbuffed);
  assert.notEqual(healed.detail, unbuffed.detail);
  assert.deepEqual(b, original);
  assert.equal(encodeShare(b), hash);
  const concentration = calc(build(1938));
  const boon = gameDetails(
    { id: 10238, name: "强力突破" },
    "skill",
    new Set(),
    { boonDuration: concentration.boonDuration },
  );
  assert.equal(
    boon.facts.find((f) => f.label === "稳固")?.detail,
    "3.48 秒 · 3 层",
  );
});

test("手枪/权杖特性先改基础时长再乘属性，上限只限制属性倍率，不缩放层数", () => {
  const fact = (id: number, traits: number[], label: string, context = {}) =>
    gameDetails(
      { id, name: String(id) },
      "skill",
      new Set(traits),
      context,
    ).facts.find((f) => f.label === label)!;
  assert.equal(fact(5830, [], "定身").detail, "1.5 秒");
  assert.equal(
    fact(5827, [1878], "流血", { conditionDuration: 100 }).detail,
    "15.96 秒",
  );
  assert.equal(
    fact(5828, [1878], "中毒", { conditionDuration: 100 }).detail,
    "18.62 秒 · -33% 治疗效能",
  );
  assert.equal(
    fact(5829, [1878], "困惑", { conditionDuration: 100 }).detail,
    "13.3 秒 · 3 层",
  );
  assert.equal(
    fact(5830, [1878], "定身", { conditionDuration: 100 }).detail,
    "3.99 秒",
  );
  assert.equal(
    fact(5831, [1878], "最高燃烧", { conditionDuration: 150 }).detail,
    "11.97 秒 · 3 层",
  );
  assert.equal(
    fact(10698, [801], "流血", { conditionDuration: 100 }).detail,
    "13.5 秒",
  );
  assert.equal(
    fact(10532, [801], "流血", { conditions: { Bleeding: 100 } }).detail,
    "30 秒 · 3 层",
  );
  assert.equal(
    fact(51647, [801], "每种症状折磨", { conditionDuration: 100 }).detail,
    "12 秒",
  );
  assert.equal(fact(10698, [], "流血").detail, "4.5 秒");
});

test("本轮恢复的武器、腰带与圣咏仅降低Wiki对应冷却；首次/额外命中效果分别缩放", () => {
  const fact = (id: number, traits: number[], label: string, context = {}) =>
    gameDetails(
      { id, name: String(id) },
      "skill",
      new Set(traits),
      context,
    ).facts.find((f) => f.label === label)!;
  for (const [id, trait, base, changed] of [
    [5530, 223, "30 秒", "24 秒"],
    [5679, 319, "10 秒", "8 秒"],
    [5597, 319, "8 秒", "6.4 秒"],
    [5566, 319, "10 秒", "8 秒"],
    [5824, 1872, "20 秒", "17 秒"],
    [77155, 1417, "25 秒", "21.25 秒"],
  ] as const) {
    assert.equal(fact(id, [], "冷却时间").detail, base);
    assert.equal(fact(id, [trait], "冷却时间").detail, changed);
  }
  assert.equal(
    fact(62910, [], "首次命中威能", { boonDuration: 100 }).detail,
    "20 秒 · 6 层",
  );
  assert.equal(
    fact(62910, [], "额外命中激怒", { boonDuration: 100 }).detail,
    "2 秒 · +25% 暴击率",
  );
});

test("诅咒萦绕将腐化盛宴替换为吞噬黑暗，取消或错误阶级后恢复", () => {
  const weapons = JSON.parse(readFileSync("public/weapon-skills.json", "utf8"));
  const merged = mergeSkillCatalog(catalog, weapons.skills),
    b = build(801);
  b.equipment.weapon1.weapon = "Scepter";
  assert.equal(weaponSkillSlots(b, merged, 1)[2]?.id, 51647);
  const line = b.specs.find((s) => s.traits.includes(801))!;
  line.traits = [null, null, null];
  assert.equal(weaponSkillSlots(b, merged, 1)[2]?.id, 10709);
  line.traits[0] = 801;
  assert.equal(weaponSkillSlots(b, merged, 1)[2]?.id, 10709);
});

const criticalContribution = (b: Build, id: number, p = emptyPreview()) =>
  calc(b, p)
    .criticalSources.filter((s) =>
      s.label.startsWith(catalog.traits.find((t) => t.id === id)!.name),
    )
    .reduce((n, s) => n + s.amount, 0);

test("守护意志之力300体力参与转换，盟友治疗读取最终体力且与食物扳手相加", () => {
  const b = build(1682, 620);
  assert.equal(contribution(b, "Vitality", 1682), 300);
  assert.equal(contribution(b, "ConditionDamage", 620), 91);
  close(calc(b).outgoingHealingBonus, 13);
  b.food = 91690;
  b.utility = 99842;
  close(calc(b).outgoingHealingBonus, 24.16);
  b.jadeBotCore = 96613;
  close(calc(b).outgoingHealingBonus, 26.51);
  assert.equal(criticalContribution(build(1683), 1683), 0);
  assert.equal(
    criticalContribution(build(1683), 1683, {
      ...emptyPreview(),
      flags: { resolution: true },
    }),
    25,
  );
});

test("战士控制与蔑视暴击为替代奖励；激怒和狂暴分别触发明确特性", () => {
  const b = build(1315);
  for (const [flags, expected] of [
    [{}, 0],
    [{ targetDefiant: true }, 25],
    [{ targetDisabled: true }, 50],
    [{ targetDefiant: true, targetDisabled: true }, 50],
  ] as const)
    assert.equal(
      criticalContribution(b, 1315, { ...emptyPreview(), flags }),
      expected,
    );
  assert.equal(
    criticalContribution(build(1342), 1342, { ...emptyPreview(), fury: true }),
    5,
  );
  assert.equal(criticalContribution(build(2049), 2049), 0);
  assert.equal(
    criticalContribution(build(2049), 2049, {
      ...emptyPreview(),
      flags: { berserk: true },
    }),
    15,
  );
});

test("工程激怒与距离门槛独立，机甲翠玉加农炮不增加玩家暴击率", () => {
  const b = build(536, 1914),
    p = { ...emptyPreview(), fury: true };
  assert.equal(criticalContribution(b, 536, p), 15);
  assert.equal(criticalContribution(b, 1914, p), 0);
  assert.equal(
    criticalContribution(b, 1914, { ...p, flags: { targetWithin450: true } }),
    15,
  );
  assert.equal(criticalContribution(build(2279), 2279, p), 0);
});

test("游侠和盗贼侧背面或蔑视条件只加一次；敏锐观察面板只含常驻暴击率", () => {
  for (const [id, amount] of [
    [1068, 10],
    [1268, 7],
  ]) {
    const b = build(id);
    assert.equal(criticalContribution(b, id), 0);
    for (const flags of [
      { targetFlanked: true, targetDefiant: false },
      { targetFlanked: false, targetDefiant: true },
      { targetFlanked: true, targetDefiant: true },
    ])
      assert.equal(
        criticalContribution(b, id, { ...emptyPreview(), flags }),
        amount,
      );
  }
  const b = build(1281);
  assert.equal(criticalContribution(b, 1281), 10);
  assert.equal(
    criticalContribution(b, 1281, {
      ...emptyPreview(),
      flags: { healthBelow50: true },
    }),
    10,
  );
  assert.equal(calc(b).primary.Precision, 1000);
});

test("敏锐观察采用游戏属性面板10%，Wiki高生命额外5%保留，其他血线效果独立", () => {
  const b = build(1281),
    before = structuredClone(b),
    hash = encodeShare(b);
  for (const flags of [{ healthBelow50: false }, { healthBelow50: true }]) {
    const r = calc(b, { ...emptyPreview(), flags });
    close(r.criticalChance, 15); // Level 80 baseline 5% + the visible permanent 10%.
    assert.equal(
      criticalContribution(b, 1281, { ...emptyPreview(), flags }),
      10,
    );
    assert.ok(!r.controls.some((c) => c.key === "healthBelow50"));
    close(
      r.criticalSources.reduce((n, s) => n + s.amount, 0),
      10,
    );
  }
  const model = gameDetails({ id: 1281, name: "敏锐观察" }, "trait", new Set());
  assert.equal(
    model.facts.find((f) => f.label === "高生命值时暴击率增加")?.detail,
    "5%",
  );
  assert.equal(
    model.facts.find((f) => f.label === "生命临界值")?.detail,
    "50%",
  );
  assert.equal(
    model.facts.find((f) => f.label === "暴击率提升")?.detail,
    "10%",
  );
  const twin = build(1268),
    high = calc(twin),
    low = calc(twin, { ...emptyPreview(), flags: { healthBelow50: true } });
  close(high.criticalChance, 15);
  close(low.criticalChance, 15);
  close(high.criticalDamage, 160.5);
  close(low.criticalDamage, 157.5);
  assert.deepEqual(b, before);
  assert.equal(encodeShare(b), hash);
});

test("出其不意区分潜行及4秒余效；离开条件恢复，元素虚弱奖励不增加精准", () => {
  const b = build(1215);
  for (const flags of [
    { stealth: true, hiddenKiller: false },
    { stealth: false, hiddenKiller: true },
    { stealth: true, hiddenKiller: true },
  ])
    assert.equal(
      criticalContribution(b, 1215, { ...emptyPreview(), flags }),
      100,
    );
  assert.equal(criticalContribution(b, 1215), 0);
  const e = build(2177);
  assert.equal(criticalContribution(e, 2177), 0);
  assert.equal(
    criticalContribution(e, 2177, {
      ...emptyPreview(),
      flags: { targetWeakness: true },
    }),
    20,
  );
  assert.equal(
    calc(e, { ...emptyPreview(), flags: { targetWeakness: true } }).primary
      .Precision,
    1000,
  );
});

test("唤灵致命洞察常驻15%暴击，帷幕伤害倍率和易伤层数独立；灾厄不假设帷幕状态", () => {
  const b = build(893, 2031);
  assert.equal(criticalContribution(b, 893), 15);
  close(calc(b).criticalDamage, 150);
  close(
    calc(b, { ...emptyPreview(), flags: { "signet-shroud": true } })
      .criticalDamage,
    165,
  );
  assert.equal(
    criticalContribution(b, 2031, {
      ...emptyPreview(),
      stacks: { targetVulnerability: 99 },
    }),
    50,
  );
  for (const stacks of [-1, NaN, Infinity])
    assert.equal(
      criticalContribution(b, 2031, {
        ...emptyPreview(),
        stacks: { targetVulnerability: stacks },
      }),
      0,
    );
  b.specs[2] = { id: 60, traits: [null, null, null] };
  close(
    calc(b, { ...emptyPreview(), flags: { "signet-shroud": true } })
      .criticalDamage,
    150,
  );
  assert.ok(!calc(b).controls.some((c) => c.key === "signet-shroud"));
});

test("魂武迷雾翻腾额外25%激怒；残暴冲力耐力全满合计33%而非43%", () => {
  const b = build(1719, 2142),
    p = { ...emptyPreview(), fury: true, flags: { enduranceFull: true } };
  assert.equal(criticalContribution(b, 1719), 0);
  assert.equal(criticalContribution(b, 1719, p), 25);
  assert.equal(criticalContribution(b, 2142), 10);
  assert.equal(criticalContribution(b, 2142, p), 33);
  close(calc(b, p).criticalChance, 88);
});

test("暴击倍率同特性条件相加、跨特性相乘；目标低血和控制不重复，不增加暴击效果", () => {
  const b = build(692, 2009),
    p = {
      ...emptyPreview(),
      flags: {
        targetDisabled: true,
        targetHealthBelow50: true,
        dangerTime: true,
      },
    };
  close(calc(b).criticalDamage, 172.5);
  close(calc(b, p).criticalDamage, 196.875);
  assert.equal(calc(b, p).primary.CritDamage, 0);
  close(
    calc(b, p).criticalDamageSources.reduce((n, s) => n + s.amount, 0),
    196.875,
  );
  const pure = build(2107);
  close(calc(pure).criticalDamage, 157.5);
  close(
    calc(pure, { ...emptyPreview(), flags: { targetBoonless: true } })
      .criticalDamage,
    165,
  );
});

test("双牙撕咬高生命总倍率7%；恶毒腐化采用Wiki实际12.5%，不按提示10%", () => {
  const b = build(1268);
  close(calc(b).criticalDamage, 160.5);
  close(
    calc(b, { ...emptyPreview(), flags: { healthBelow50: true } })
      .criticalDamage,
    157.5,
  );
  const h = build(893, 2188),
    p = {
      ...emptyPreview(),
      flags: { "signet-shroud": true, targetTorment: true },
    };
  close(calc(h, p).criticalDamage, 185.625);
  assert.equal(calc(h, p).primary.CritDamage, 0);
});

test("盟友治疗特性按职业生效，天界化身条件和卡拉层数可撤销且来源求和", () => {
  for (const [id, expected] of [
    [1915, 5],
    [1381, 15],
    [1992, 20],
    [2272, 20],
    [789, 10],
  ])
    close(calc(build(id)).outgoingHealingBonus, expected);
  const d = build(2058);
  close(calc(d).outgoingHealingBonus, 20);
  close(
    calc(d, { ...emptyPreview(), flags: { celestialAvatar: true } })
      .outgoingHealingBonus,
    40,
  );
  const r = build(2182),
    p = { ...emptyPreview(), stacks: { kallasFervor: 99 } };
  close(calc(r, p).outgoingHealingBonus, 20);
  close(calc(r).outgoingHealingBonus, 0);
  close(
    calc(d, {
      ...emptyPreview(),
      flags: { celestialAvatar: true },
    }).outgoingHealingSources.reduce((n, s) => n + s.amount, 0),
    40,
  );
});

test("节奏爆发0–4件乐器按可转换属性计算，纹章、威能和转换结果不被再次放大", () => {
  const b = build(2353);
  b.skills[1] = 10232;
  b.utility = 48916;
  const p = { ...emptyPreview(), might: 25, stacks: { activeInstruments: 99 } };
  const r = calc(b, p);
  assert.equal(r.primary.Power, 1910);
  assert.equal(r.primary.Precision, 1160);
  assert.equal(r.primary.ConditionDamage, 930);
  assert.equal(r.primary.BoonDuration, 30);
  for (const count of [-1, NaN, Infinity])
    assert.equal(
      calc(b, { ...emptyPreview(), stacks: { activeInstruments: count } })
        .primary.Power,
      1000,
    );
  b.food = 91690;
  const food = calc(b, { ...emptyPreview(), stacks: { activeInstruments: 4 } });
  assert.equal(food.primary.Healing, 116);
  assert.equal(food.primary.BoonDuration, 111);
  b.specs[2] = { id: null, traits: [null, null, null] };
  assert.equal(calc(b, p).primary.Power, 1750);
});

test("新增目标状态、倍率和乐器层数不修改BD、分享或API；移除/非法阶级特性失效", () => {
  const b = build(692, 2009),
    saved = structuredClone(b),
    hash = encodeShare(b),
    p = {
      ...emptyPreview(),
      flags: { dangerTime: true, targetHealthBelow50: true },
      stacks: { activeInstruments: 4 },
    };
  const expected = calc(b, p),
    c = structuredClone(catalog);
  for (const id of [692, 2009])
    c.traits.find((t) => t.id === id)!.facts = [
      { type: "Percent", text: "暴击伤害", percent: 999 },
    ];
  close(calc(b, p, 1, c).criticalDamage, expected.criticalDamage);
  assert.deepEqual(b, saved);
  assert.equal(encodeShare(b), hash);
  const line = b.specs.find((s) => s.traits.includes(692))!;
  line.traits = [692, null, null];
  close(calc(b, p).criticalDamage, 157.5);
});

test("Wiki旧规则迁移：美德之力固定7%，水下长矛奖励不误用于陆地长矛", () => {
  const g = build(620),
    p = { ...emptyPreview(), fury: true };
  assert.equal(contribution(g, "ConditionDamage", 620, p), 70);
  const c = structuredClone(catalog);
  c.traits.find((t) => t.id === 620)!.facts = [
    {
      type: "BuffConversion",
      source: "Vitality",
      target: "ConditionDamage",
      percent: 13,
    },
  ];
  assert.equal(calc(g, p, 1, c).primary.ConditionDamage, 70);
  for (const [id, weapon] of [
    [1192, "Sword"],
    [1338, "Greatsword"],
  ] as const) {
    const b = build(id);
    b.equipment.weapon1.weapon = "Spear";
    assert.equal(contribution(b, "Power", id), 120);
    b.equipment.weapon1.weapon = weapon;
    assert.equal(contribution(b, "Power", id), 240);
  }
});
