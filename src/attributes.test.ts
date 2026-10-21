import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createBuild,
  armorSlots,
  accessorySlots,
  encodeShare,
  type Build,
  type Catalog,
} from "./domain.ts";
import {
  calculateAttributes,
  activeTraits,
  emptyPreview,
  parseAttributeEffect,
  primaryKeys,
  type AttributeData,
} from "./attributes.ts";
import { signetRules, nonAttributeSignets } from "./signet-rules.ts";

const catalog: Catalog = JSON.parse(
  readFileSync("public/catalog.json", "utf8"),
);
const data: AttributeData = JSON.parse(
  readFileSync("public/attribute-data.json", "utf8"),
);
const calc = (build: Build, set: 1 | 2 = 1, preview = emptyPreview()) =>
  calculateAttributes(build, catalog, data, set, preview);
function berserker() {
  const b = createBuild();
  // Legacy armor ID on trinkets must resolve to the trinket-specific prefix.
  for (const key of [...armorSlots, ...accessorySlots])
    b.equipment[key].statId = 161;
  b.equipment.weapon1.weapon = "Staff";
  b.equipment.weapon1.statId = 161;
  b.equipment.weapon1.infusions = [null, null];
  return b;
}
function selectTrait(b: Build, id: number, line = 0) {
  const trait = catalog.traits.find((t) => t.id === id)!;
  const spec = catalog.specs.find((s) => s.id === trait.specialization)!;
  b.specs[line] = { id: spec.id, traits: [null, null, null] };
  if (trait.slot === "Major") b.specs[line].traits[trait.tier - 1] = id;
}
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("空配装为80级基础属性，不把零值当成缺失资料", () => {
  const r = calc(createBuild());
  assert.deepEqual(r.primary, {
    Power: 1000,
    Precision: 1000,
    Toughness: 1000,
    Vitality: 1000,
    CritDamage: 0,
    ConditionDamage: 0,
    ConditionDuration: 0,
    BoonDuration: 0,
    Healing: 0,
  });
  assert.equal(r.criticalChance, 5);
  assert.equal(r.criticalDamage, 150);
  assert.equal(r.boonDuration, 0);
  assert.deepEqual(r.warnings, []);
});

test("逐件取整及饰品宝石偏移：旧词条ID与实际装备数值一致", () => {
  const b = createBuild();
  for (const slot of ["head", "chest", "ring1", "back"] as const)
    b.equipment[slot].statId = 161;
  const r = calc(b);
  assert.equal(r.primary.Power, 1393);
  assert.equal(r.primary.Precision, 1271);
  assert.equal(r.primary.CritDamage, 271);
  b.equipment.ring1.statId = 584;
  b.equipment.back.statId = 584;
  assert.deepEqual(calc(b).primary, r.primary);
});

test("完整升华狂战士双手/双持总值与各槽位数值相符", () => {
  const b = berserker();
  const r = calc(b);
  assert.equal(r.primary.Power, 2382);
  assert.equal(r.primary.Precision, 1960);
  assert.equal(r.primary.CritDamage, 960);
  close(r.criticalChance, 50.714285714285715);
  assert.equal(r.criticalDamage, 214);
  b.equipment.weapon1.weapon = "Sword";
  b.equipment.offhand1.weapon = "Sword";
  b.equipment.offhand1.statId = 161;
  assert.equal(calc(b).primary.Power, 2381);
  assert.equal(calc(b).primary.Precision, 1961);
  assert.equal(calc(b).primary.CritDamage, 961);
});

test("武器切换只计当前组；双手武器忽略残留副手；18个威力灌注加90", () => {
  const b = berserker();
  for (const key of [...armorSlots, ...accessorySlots, "weapon1"] as const)
    b.equipment[key].infusions.fill(37127);
  b.equipment.offhand1 = {
    ...b.equipment.weapon1,
    weapon: "Sword",
    infusions: [37127],
  };
  b.equipment.weapon2 = {
    ...b.equipment.weapon1,
    weapon: "Sword",
    infusions: [37127],
  };
  b.equipment.offhand2 = { ...b.equipment.weapon2 };
  assert.equal(calc(b).primary.Power, 2472);
  assert.equal(calc(b, 2).primary.Power, 2471);
  b.equipment.weapon2.statId = null;
  assert.equal(calc(b).primary.Power, 2472);
});

test("符文按同类件数启用阶级，混搭不会获得整套奖励", () => {
  const b = createBuild();
  for (const key of armorSlots) b.equipment[key].runeId = 24836;
  assert.equal(calc(b).primary.Power, 1175);
  assert.equal(calc(b).primary.CritDamage, 225);
  b.equipment.head.runeId = 24687;
  assert.equal(calc(b).primary.CritDamage, 100);
  assert.equal(calc(b).primary.ConditionDamage, 25);
});

test("法印持续时间与符文通用奖励叠加；重复同类法印仅计算最高阶", () => {
  const b = createBuild();
  for (const key of armorSlots) b.equipment[key].runeId = 24687;
  b.equipment.weapon1.weapon = "Staff";
  b.equipment.weapon1.sigils = [24612, 24612];
  const r = calc(b);
  assert.equal(r.conditionDuration, 10);
  assert.equal(r.conditions.Bleeding, 50);
  assert.equal(r.conditions.Poison, 20);
  b.equipment.weapon1.sigils = [24618, 24617]; // Superior/Major Accuracy.
  assert.equal(calc(b).criticalChance, 12);
  b.equipment.weapon1.sigils = [72339, null];
  assert.equal(calc(b).boonDuration, 10);
});

test("扳手按静态属性转换，威能不进入转换池，转换输出不再次参与转换", () => {
  const b = berserker();
  b.utility = 78305;
  assert.equal(calc(b).primary.Power, 2498);
  const preview = { ...emptyPreview(), might: 25, fury: true };
  const r = calc(b, 1, preview);
  assert.equal(r.primary.Power, 3248);
  assert.equal(r.primary.ConditionDamage, 750);
  close(r.criticalChance, 75.71428571428572);
  b.profession = "Warrior";
  selectTrait(b, 1449);
  assert.equal(calc(b).primary.Vitality, 1238); // 10% of2382, not2498.
  b.utility = 48917;
  assert.equal(calc(b).primary.ConditionDamage, 130);
});

test("API缺失的已核实盛宴补齐；治疗倍率不会被误算成治疗属性", () => {
  const b = createBuild();
  b.food = 91690;
  b.utility = 67528;
  assert.equal(calc(b).primary.Healing, 100);
  assert.equal(calc(b).primary.BoonDuration, 70);
  b.food = 91734;
  assert.equal(calc(b).primary.Power, 1100);
  assert.equal(calc(b).primary.CritDamage, 70);
  b.profession = "Warrior";
  selectTrait(b, 1470);
  assert.equal(calc(b).primary.Healing, 143); // 13% power, not skill heal facts1000/808.
});

test("混沌执念按当前PvE再生条件加250增益效果和100症状效果", () => {
  const b = createBuild();
  b.specs[0].id = 45;
  assert.ok(activeTraits(b, catalog).some((t) => t.id === 1865));
  assert.equal(calc(b).primary.ConditionDuration, 0);
  const p = { ...emptyPreview(), flags: { regeneration: true } };
  const r = calc(b, 1, p);
  assert.equal(r.primary.ConditionDuration, 100);
  assert.equal(r.primary.BoonDuration, 250);
  close(r.conditionDuration, 100 / 15);
  close(r.boonDuration, 250 / 15);
});
test("API混合记录变化不会覆盖固定版本的PvE属性规则", () => {
  const b = createBuild();
  b.specs[0].id = 45;
  const changed = structuredClone(catalog);
  changed.traits
    .find((t) => t.id === 1865)!
    .facts.find(
      (f: any) => f.target === "BoonDuration" && f.value === 250,
    ).value = 300;
  const result = calculateAttributes(b, changed, data, 1, {
    ...emptyPreview(),
    flags: { regeneration: true },
  });
  assert.equal(result.primary.BoonDuration, 250);
  assert.equal(result.primary.ConditionDuration, 100);
  assert.ok(
    !result.warnings.some((w) => w.includes("混沌执念规则与当前资料不一致")),
  );
});

test("守护者部分特性属性在转换后加算；武器条件自动判断", () => {
  const b = createBuild("Guardian");
  selectTrait(b, 566);
  b.utility = 78305;
  assert.equal(calc(b).primary.Precision, 1080);
  assert.equal(calc(b).primary.CritDamage, 150);
  assert.equal(calc(b).primary.Power, 1030); // Neither +80 precision nor +150 ferocity enters utility conversion.
  b.equipment.weapon1.weapon = "Sword";
  assert.equal(calc(b).primary.Power, 1110);
});

test("特性仅取有效职业与阶级，未知属性规则及缺少食物资料明确提示", () => {
  const b = createBuild();
  b.specs[0] = { id: 16, traits: [566, null, null] };
  assert.deepEqual(activeTraits(b, catalog), []);
  b.specs[0] = { id: 45, traits: [1865, null, null] };
  assert.equal(activeTraits(b, catalog).filter((t) => t.id === 1865).length, 1);
  const missing = Object.entries(data.items).find(
    ([id, e]) =>
      e.pve &&
      !e.text &&
      ![
        91690, 91732, 91737, 91769, 91841, 91734, 91805, 91743, 97282, 97592,
        91713, 91748, 91804,
      ].includes(+id) &&
      catalog.items.some((i) => i.id === +id && i.details?.type === "Food"),
  )!;
  b.food = +missing[0];
  assert.ok(calc(b).warnings.some((w) => w.includes("营养属性")));
  const unknown = catalog.traits.find(
    (t) =>
      t.facts?.some((f: any) => f.type === "BuffConversion") &&
      ![232, 275, 620, 1272, 1449, 1455, 1470, 1556, 2193].includes(t.id),
  )!;
  const spec = catalog.specs.find((s) => s.id === unknown.specialization)!;
  b.profession = spec.profession;
  selectTrait(b, unknown.id, spec.elite ? 2 : 0);
  assert.ok(calc(b).warnings.some((w) => w.includes(unknown.name)));
});

test("叠层法印和贵族古物为条件预览；互斥法印不叠加", () => {
  const b = createBuild();
  b.equipment.weapon1.weapon = "Staff";
  b.equipment.weapon1.sigils = [24575, 24578];
  b.relic = 100849;
  const p = {
    ...emptyPreview(),
    stacks: { "sigil-24575": 25, "sigil-24578": 25, aristocracy: 5 },
  };
  const r = calc(b, 1, p);
  assert.equal(r.primary.Power, 1250);
  assert.equal(r.primary.ConditionDamage, 0);
  assert.equal(r.conditionDuration, 15);
  assert.ok(r.warnings.some((w) => w.includes("只能启用一种")));
});

test("属性来源相加等于总值，预览不修改BD或分享协议", () => {
  const b = berserker();
  const before = JSON.stringify(b),
    share = encodeShare(b);
  const r = calc(b, 1, { ...emptyPreview(), might: 25, fury: true });
  for (const key of primaryKeys)
    close(
      r.primarySources[key].reduce((s, x) => s + x.amount, 0),
      r.primary[key],
    );
  assert.equal(JSON.stringify(b), before);
  assert.equal(encodeShare(b), share);
});

test("效果解析接受官方API格式，保留无法计算的属性效果警告", () => {
  assert.equal(
    parseAttributeEffect("Increase Inflicted Chill Duration: 20%").durations
      .Chilled,
    20,
  );
  assert.equal(parseAttributeEffect("+10% Boon Duration").durations.Boon, 10);
  assert.equal(parseAttributeEffect("+45 to All Attributes").flats.Healing, 45);
  assert.ok(
    parseAttributeEffect("+10% healing power while above 90% health").warnings
      .length,
  );
  assert.ok(parseAttributeEffect("+30% Stun Duration").warnings.length);
});

test("守护者三个属性纹章采用独立PvE数值和来源，冷却互不影响", () => {
  const b = createBuild("Guardian");
  b.skills = [null, 9093, 9151, 9163, null];
  const r = calc(b);
  assert.equal(r.primary.Power, 1180);
  assert.equal(r.primary.ConditionDamage, 180);
  assert.equal(r.primary.BoonDuration, 120);
  assert.equal(r.boonDuration, 8);
  assert.ok(
    r.primarySources.Power.some(
      (s) => s.label === "怨毒纹章 · 被动" && s.amount === 180,
    ),
  );
  assert.ok(!r.warnings.some((w) => /怨毒纹章|愤怒纹章|仁慈纹章/.test(w)));
  const p = { ...emptyPreview(), flags: { "signet-cooldown-9093": true } };
  assert.equal(calc(b, 1, p).primary.Power, 1000);
  assert.equal(calc(b, 1, p).primary.ConditionDamage, 180);
  assert.equal(calc(b, 1, p).primary.BoonDuration, 120);
  p.flags = { "signet-cooldown-9093": false };
  assert.equal(calc(b, 1, p).primary.Power, 1180);
});

test("完美铭刻增强三种被动并在冷却期间保留，移除特性即时失效", () => {
  const b = createBuild("Guardian");
  b.skills = [null, 9093, 9151, 9163, null];
  selectTrait(b, 579);
  const p = {
    ...emptyPreview(),
    flags: {
      "signet-cooldown-9093": true,
      "signet-cooldown-9151": true,
      "signet-cooldown-9163": true,
    },
  };
  for (const result of [calc(b), calc(b, 1, p)]) {
    assert.equal(result.primary.Power, 1216);
    assert.equal(result.primary.ConditionDamage, 216);
    assert.equal(result.primary.BoonDuration, 144);
    close(result.boonDuration, 9.6);
    assert.ok(
      result.primarySources.Power.some((s) => s.label.includes("完美铭刻")),
    );
  }
  b.specs[0].traits[2] = null;
  const r = calc(b, 1, p);
  assert.equal(r.primary.Power, 1000);
  assert.equal(r.primary.ConditionDamage, 0);
  assert.equal(r.primary.BoonDuration, 0);
  b.specs[0].traits = [579, null, null]; // Wrong tier cannot retain passives.
  assert.equal(calc(b, 1, p).primary.Power, 1000);
});

test("纹章与威能不进入属性转换池，技能治疗量不计为治疗属性", () => {
  const b = createBuild("Guardian");
  b.skills = [9158, 9093, 9151, 9163, 30461];
  b.utility = 78305;
  assert.equal(calc(b).primary.Power, 1210); // 1000 + 180 + round(1000 * 3%).
  selectTrait(b, 579);
  assert.equal(calc(b).primary.Power, 1246); // Deferred Radiant Power ferocity is excluded.
  assert.equal(calc(b).primary.Healing, 0); // Resolve/Courage heal HP, not Healing Power.
  b.utility = 48917; // Toxic crystal excludes signet Power: round(1000 * 3% + 1000 * 3%) = 60.
  const r = calc(b, 1, { ...emptyPreview(), might: 25 });
  assert.equal(r.primary.ConditionDamage, 216 + 60 + 750);
  assert.equal(r.primary.Power, 1216 + 750);
  b.utility = 48916; // Toxic oil excludes both signet Power and Condition Damage.
  assert.equal(calc(b).primary.BoonDuration, 144 + 30);
});

test("纹章仅计合法职业/槽位一次，原始API混合值和翻译不改变固定规则", () => {
  const b = createBuild("Guardian");
  b.skills = [9093, 9093, 9093, null, 9151];
  assert.equal(calc(b).primary.Power, 1180);
  assert.equal(calc(b).primary.ConditionDamage, 0);
  assert.equal(
    calc(b).controls.filter((c) => c.key.startsWith("signet-")).length,
    1,
  );
  b.profession = "Mesmer";
  assert.equal(calc(b).primary.Power, 1000);
  b.profession = "Guardian";
  b.skills = [null, 9093, 9151, 9163, null];
  selectTrait(b, 579);
  const changed = structuredClone(catalog);
  for (const id of [9093, 9151, 9163]) {
    const s = changed.skills.find((s) => s.id === id)!;
    s.description = "changed";
    s.facts = [{ type: "AttributeAdjust", target: "Power", value: 9999 }];
    s.traited_facts = [
      {
        type: "AttributeAdjust",
        target: "Power",
        value: 9999,
        requires_trait: 579,
      },
    ];
  }
  changed.traits.find((t) => t.id === 579)!.facts = [
    { type: "Percent", percent: 999 },
  ];
  const r = calculateAttributes(b, changed, data);
  assert.equal(r.primary.Power, 1216);
  assert.equal(r.primary.ConditionDamage, 216);
  assert.equal(r.primary.BoonDuration, 144);
});

test("纹章冷却预览保持纯计算、来源求和及版本1保存分享不变", () => {
  const b = createBuild("Guardian");
  b.skills = [null, 9093, 9151, 9163, null];
  const before = JSON.stringify(b),
    share = encodeShare(b);
  const p = { ...emptyPreview(), flags: { "signet-cooldown-9093": true } };
  const previewBefore = JSON.stringify(p);
  const r = calc(b, 1, p);
  for (const key of primaryKeys)
    close(
      r.primarySources[key].reduce((sum, s) => sum + s.amount, 0),
      r.primary[key],
    );
  assert.equal(JSON.stringify(b), before);
  assert.equal(encodeShare(b), share);
  assert.equal(JSON.stringify(p), previewBefore);
  b.skills[1] = null;
  assert.ok(
    !calc(b, 1, p).controls.some((c) => c.key === "signet-cooldown-9093"),
  );
});

test("幻术纹章分别提供180症状伤害与180症状效果，独立冷却并恢复", () => {
  const b = createBuild("Mesmer");
  b.skills = [21750, 10232, 10234, 10236, 29519];
  const r = calc(b);
  assert.equal(r.primary.ConditionDamage, 180);
  assert.equal(r.primary.ConditionDuration, 180);
  assert.equal(r.conditionDuration, 12);
  assert.equal(r.primary.Healing, 0); // Ether heals HP; Humility reduces incoming CC duration.
  for (const value of Object.values(r.conditions)) assert.equal(value, 12);
  assert.deepEqual(r.primarySources.ConditionDuration, [
    { label: "午夜纹章 · 被动", amount: 180 },
  ]);
  assert.ok(!r.warnings.some((w) => /支配纹章|午夜纹章/.test(w)));
  assert.deepEqual(
    r.controls.map((c) => c.key),
    ["signet-cooldown-10232", "signet-cooldown-10234"],
  );
  const p = { ...emptyPreview(), flags: { "signet-cooldown-10234": true } };
  assert.equal(calc(b, 1, p).primary.ConditionDamage, 180);
  assert.equal(calc(b, 1, p).conditionDuration, 0);
  p.flags = { "signet-cooldown-10234": false };
  assert.equal(calc(b, 1, p).conditionDuration, 12);
});

test("模糊铭文不增强或保留幻术纹章的属性被动，不误用守护者规则", () => {
  const b = createBuild("Mesmer");
  b.skills = [null, 10232, 10234, null, null];
  selectTrait(b, 752);
  assert.equal(calc(b).primary.ConditionDamage, 180);
  assert.equal(calc(b).primary.ConditionDuration, 180);
  const p = {
    ...emptyPreview(),
    flags: {
      "signet-cooldown-10232": true,
      "signet-cooldown-10234": true,
    },
  };
  assert.equal(calc(b, 1, p).primary.ConditionDamage, 0);
  assert.equal(calc(b, 1, p).conditionDuration, 0);
  assert.ok(
    calc(b).controls.every((c) => !c.description.includes("冷却期间仍生效")),
  );
  b.specs[1] = { id: 16, traits: [null, null, 579] }; // Guardian trait is invalid for Mesmer.
  assert.equal(calc(b, 1, p).primary.ConditionDamage, 0);
  b.profession = "Guardian";
  assert.equal(calc(b).primary.ConditionDamage, 0);
  assert.ok(!calc(b).controls.some((c) => c.key.startsWith("signet-")));
});

test("幻术纹章与再生联动叠加，奖励不进入转换池且保留来源求和", () => {
  const b = createBuild("Mesmer");
  b.skills = [null, 10232, 10234, null, null];
  b.specs[0].id = 45;
  b.utility = 48916; // 3% Power + 6% Condition Damage, excluding signet grants.
  const p = emptyPreview();
  p.flags.regeneration = true;
  const r = calc(b, 1, p);
  assert.equal(r.primary.ConditionDamage, 180);
  assert.equal(r.primary.ConditionDuration, 180 + 100);
  assert.equal(r.primary.BoonDuration, 250 + 30);
  close(r.conditionDuration, 280 / 15);
  for (const key of primaryKeys)
    close(
      r.primarySources[key].reduce((sum, s) => sum + s.amount, 0),
      r.primary[key],
    );
  p.flags = { regeneration: true, "signet-cooldown-10234": true };
  assert.equal(calc(b, 1, p).primary.ConditionDuration, 100);
  assert.equal(calc(b, 1, p).primary.BoonDuration, 280);
});

test("幻术纹章数值不由API混合记录推导，错误槽位去重且分享不变", () => {
  const b = createBuild("Mesmer");
  b.skills = [10234, 10232, 10232, 10234, 10232];
  const changed = structuredClone(catalog);
  for (const id of [10232, 10234]) {
    const s = changed.skills.find((s) => s.id === id)!;
    s.description = "changed";
    s.facts = [
      { type: "AttributeAdjust", target: "ConditionDuration", value: 9999 },
    ];
    s.traited_facts = [
      {
        type: "AttributeAdjust",
        target: "ConditionDuration",
        value: 9999,
        requires_trait: 752,
      },
    ];
  }
  selectTrait(b, 752);
  const before = JSON.stringify(b),
    share = encodeShare(b);
  const p = { ...emptyPreview(), flags: { "signet-cooldown-10232": true } };
  const beforePreview = JSON.stringify(p);
  const r = calculateAttributes(b, changed, data, 1, p);
  assert.equal(r.primary.ConditionDamage, 0);
  assert.equal(r.primary.ConditionDuration, 180);
  assert.equal(r.controls.filter((c) => c.key.startsWith("signet-")).length, 2);
  assert.equal(JSON.stringify(b), before);
  assert.equal(encodeShare(b), share);
  assert.equal(JSON.stringify(p), beforePreview);
});

test("火焰纹章提供180精准并派生暴击率，冷却移除被动而非固定暴击百分比", () => {
  const b = createBuild("Elementalist");
  b.skills[1] = 5542;
  const r = calc(b);
  assert.equal(r.primary.Precision, 1180);
  close(r.criticalChance, 5 + 180 / 21);
  assert.deepEqual(r.primarySources.Precision, [
    { label: "80 级基础属性", amount: 1000 },
    { label: "火焰纹章 · 被动", amount: 180 },
  ]);
  assert.ok(!r.warnings.some((w) => w.includes("火焰纹章")));
  const p = { ...emptyPreview(), flags: { "signet-cooldown-5542": true } };
  assert.equal(calc(b, 1, p).primary.Precision, 1000);
  assert.equal(calc(b, 1, p).criticalChance, 5);
  assert.equal(calc(b).primary.Precision, 1180);
});

test("石刻纹章仅保留冷却被动而不增强，移除或错误阶级后失去保留", () => {
  const b = createBuild("Elementalist");
  b.skills[1] = 5542;
  selectTrait(b, 287);
  const p = { ...emptyPreview(), flags: { "signet-cooldown-5542": true } };
  for (const r of [calc(b), calc(b, 1, p)]) {
    assert.equal(r.primary.Precision, 1180);
    assert.equal(
      r.controls.find((c) => c.key === "signet-cooldown-5542")!.description,
      "石刻纹章：冷却期间仍生效",
    );
    assert.ok(
      r.primarySources.Precision.some(
        (s) => s.label === "火焰纹章 · 被动（石刻纹章）" && s.amount === 180,
      ),
    );
  }
  b.specs[0].traits[2] = null;
  assert.equal(calc(b, 1, p).primary.Precision, 1000);
  b.specs[0].traits = [287, null, null];
  assert.equal(calc(b, 1, p).primary.Precision, 1000);
  b.specs[0] = { id: 16, traits: [null, null, 579] }; // Wrong profession cannot grant +20% or retention.
  assert.equal(calc(b).primary.Precision, 1180);
  assert.equal(calc(b, 1, p).primary.Precision, 1000);
});

test("火焰纹章精准不进入特性或扳手转换，非属性纹章不误加坚韧治疗或时长", () => {
  const b = createBuild("Elementalist");
  b.skills = [5503, 5542, 5571, 5570, null];
  selectTrait(b, 232);
  selectTrait(b, 287, 1);
  const baseline = structuredClone(b);
  baseline.skills[1] = null;
  b.utility = baseline.utility = 78305;
  const r = calc(b);
  assert.equal(r.primary.Precision, 1180);
  assert.equal(r.primary.Power, calc(baseline).primary.Power);
  assert.equal(r.primary.CritDamage, calc(baseline).primary.CritDamage);
  assert.equal(r.primary.Toughness, 1000);
  assert.equal(r.primary.Healing, 0);
  assert.equal(r.conditionDuration, 0); // Water reduces incoming duration, not outgoing duration.
  b.skills[3] = 5572; // Air is movement speed, not an attribute grant.
  assert.equal(calc(b).primary.Precision, 1180);
  assert.equal(
    calc(b).controls.filter((c) => c.key.startsWith("signet-")).length,
    1,
  );
});

test("元素纹章固定数值与职业槽位去重、纯预览和分享隔离保持一致", () => {
  const b = createBuild("Elementalist");
  b.skills = [5542, 5542, 5542, null, 5542];
  selectTrait(b, 287);
  const changed = structuredClone(catalog);
  const skill = changed.skills.find((s) => s.id === 5542)!;
  skill.description = "changed";
  skill.facts = [{ type: "AttributeAdjust", target: "Precision", value: 9999 }];
  skill.traited_facts = [
    {
      type: "AttributeAdjust",
      target: "Precision",
      value: 9999,
      requires_trait: 287,
    },
  ];
  const before = JSON.stringify(b),
    share = encodeShare(b);
  const p = { ...emptyPreview(), flags: { "signet-cooldown-5542": true } };
  const beforePreview = JSON.stringify(p);
  const r = calculateAttributes(b, changed, data, 1, p);
  assert.equal(r.primary.Precision, 1180);
  assert.equal(r.controls.filter((c) => c.key.startsWith("signet-")).length, 1);
  for (const key of primaryKeys)
    close(
      r.primarySources[key].reduce((sum, s) => sum + s.amount, 0),
      r.primary[key],
    );
  assert.equal(JSON.stringify(b), before);
  assert.equal(encodeShare(b), share);
  assert.equal(JSON.stringify(p), beforePreview);
  b.profession = "Mesmer";
  assert.equal(calc(b).primary.Precision, 1000);
});

test("战士威能与怒气纹章各加180属性，独立冷却不自动授予主动效果", () => {
  const b = createBuild("Warrior");
  b.skills = [14389, 14404, 14410, 14479, 14355];
  const r = calc(b);
  assert.equal(r.primary.Power, 1180);
  assert.equal(r.primary.Precision, 1180);
  assert.equal(r.primary.CritDamage, 0);
  assert.equal(r.primary.Healing, 0);
  assert.equal(r.primary.Vitality, 1000); // Endurance regeneration is not Vitality.
  assert.equal(r.primary.Toughness, 1000);
  close(r.criticalChance, 5 + 180 / 21);
  assert.ok(!r.warnings.some((w) => /威能纹章|怒气纹章/.test(w)));
  const p = emptyPreview();
  p.flags["signet-cooldown-14404"] = true;
  assert.equal(calc(b, 1, p).primary.Power, 1000);
  assert.equal(calc(b, 1, p).primary.Precision, 1180);
  p.flags["signet-cooldown-14410"] = true;
  assert.equal(calc(b, 1, p).primary.Precision, 1000); // Not the +360 active window.
  assert.equal(calc(b, 1, p).primary.CritDamage, 0);
  b.skills[3] = 14413; // Dolyak is damage reduction and healing, not an attribute grant.
  assert.equal(calc(b).primary.Toughness, 1000);
  assert.equal(calc(b).primary.Healing, 0);
});

test("纹章专精每层100暴击效果，与纹章冷却独立且不保留被动", () => {
  const b = createBuild("Warrior");
  b.skills = [null, 14404, 14410, null, null];
  selectTrait(b, 1344);
  assert.equal(calc(b).primary.CritDamage, 0);
  const p = { ...emptyPreview(), stacks: { "signet-mastery": 5 } };
  const r = calc(b, 1, p);
  assert.equal(r.primary.CritDamage, 500);
  close(r.criticalDamage, 150 + 500 / 15);
  assert.ok(
    r.primarySources.CritDamage.some(
      (s) => s.label === "纹章专精 · 5 层" && s.amount === 500,
    ),
  );
  assert.equal(r.controls.find((c) => c.key === "signet-mastery")!.max, 5);
  p.flags = { "signet-cooldown-14404": true, "signet-cooldown-14410": true };
  const cooling = calc(b, 1, p);
  assert.equal(cooling.primary.Power, 1000);
  assert.equal(cooling.primary.Precision, 1000);
  assert.equal(cooling.primary.CritDamage, 500);
});

test("纹章专精层数截断并拒绝非有限值，未装备纹章仍可预览次级纹章触发", () => {
  const b = createBuild("Warrior");
  selectTrait(b, 1344);
  for (const [raw, expected] of [
    [-1, 0],
    [2.9, 200],
    [9, 500],
    [NaN, 0],
    [Infinity, 0],
    [-Infinity, 0],
  ])
    assert.equal(
      calc(b, 1, { ...emptyPreview(), stacks: { "signet-mastery": raw } })
        .primary.CritDamage,
      expected,
    );
  const p = { ...emptyPreview(), stacks: { "signet-mastery": 5 } };
  assert.equal(calc(b, 1, p).primary.CritDamage, 500);
  b.specs[0].traits[0] = null;
  assert.equal(calc(b, 1, p).primary.CritDamage, 0);
  assert.ok(!calc(b, 1, p).controls.some((c) => c.key === "signet-mastery"));
  b.specs[0].traits = [null, 1344, null];
  assert.equal(calc(b, 1, p).primary.CritDamage, 0);
  b.profession = "Mesmer";
  assert.equal(calc(b, 1, p).primary.CritDamage, 0);
});

test("纹章专精暴击效果参与转换，两个纹章被动及威能不进入转换池", () => {
  const b = createBuild("Warrior");
  b.skills = [null, 14404, 14410, null, null];
  selectTrait(b, 1344);
  b.utility = 78305;
  const p = { ...emptyPreview(), stacks: { "signet-mastery": 3 } };
  const r = calc(b, 1, p);
  assert.equal(r.primary.Power, 1228); // 1000 + 180 + round(1000 * 3% + 300 * 6%).
  assert.equal(r.primary.Precision, 1180);
  assert.equal(r.primary.CritDamage, 300);
  p.might = 25;
  assert.equal(calc(b, 1, p).primary.Power, 1228 + 750);
  b.utility = 48917;
  assert.equal(calc(b, 1, p).primary.ConditionDamage, 60 + 750);
  for (const key of primaryKeys)
    close(
      r.primarySources[key].reduce((sum, s) => sum + s.amount, 0),
      r.primary[key],
    );
});

test("战士纹章与专精固定数值、职业槽位去重及纯预览保存分享隔离", () => {
  const b = createBuild("Warrior");
  b.skills = [14404, 14404, 14404, 14410, 14410];
  selectTrait(b, 1344);
  const changed = structuredClone(catalog);
  for (const id of [14404, 14410]) {
    const skill = changed.skills.find((s) => s.id === id)!;
    skill.description = "changed";
    skill.facts = [{ type: "AttributeAdjust", target: "Power", value: 9999 }];
  }
  changed.traits.find((t) => t.id === 1344)!.facts = [
    { type: "AttributeAdjust", target: "CritDamage", value: 9999 },
  ];
  const before = JSON.stringify(b),
    share = encodeShare(b);
  const p = { ...emptyPreview(), stacks: { "signet-mastery": 4 } };
  const beforePreview = JSON.stringify(p);
  const r = calculateAttributes(b, changed, data, 1, p);
  assert.equal(r.primary.Power, 1180);
  assert.equal(r.primary.Precision, 1180);
  assert.equal(r.primary.CritDamage, 400);
  assert.equal(r.controls.filter((c) => c.key.startsWith("signet-")).length, 3);
  assert.equal(JSON.stringify(b), before);
  assert.equal(encodeShare(b), share);
  assert.equal(JSON.stringify(p), beforePreview);
  b.profession = "Guardian";
  assert.equal(calc(b, 1, p).primary.Power, 1000);
  assert.equal(calc(b, 1, p).primary.Precision, 1000);
  assert.equal(calc(b, 1, p).primary.CritDamage, 0);
});

test("九职业43项纹章全部分类：13项直接属性与30项非属性，不重复或遗漏", () => {
  const signets = catalog.skills.filter((s) =>
    s.categories?.includes("Signet"),
  );
  const attributeIds = Object.values(signetRules).flatMap((rules) =>
    Object.keys(rules!.passives).map(Number),
  );
  const nonAttributeIds = Object.keys(nonAttributeSignets).map(Number);
  assert.equal(signets.length, 43);
  assert.equal(attributeIds.length, 13);
  assert.equal(nonAttributeIds.length, 30);
  assert.equal(new Set([...attributeIds, ...nonAttributeIds]).size, 43);
  assert.deepEqual(
    [...attributeIds, ...nonAttributeIds].sort((a, b) => a - b),
    signets.map((s) => s.id).sort((a, b) => a - b),
  );
  assert.deepEqual(
    Object.keys(signetRules).sort(),
    catalog.professions.map((p) => p.id).sort(),
  );
  for (const [profession, rules] of Object.entries(signetRules))
    for (const id of Object.keys(rules!.passives))
      assert.ok(
        catalog.skills
          .find((s) => s.id === +id)!
          .professions.includes(profession),
      );
});

test("游侠磐石与野性纹章提供180坚韧与暴击效果，岩石形态不保留冷却被动", () => {
  const b = createBuild("Ranger");
  b.skills = [null, 12500, 12491, 12502, null];
  selectTrait(b, 1021);
  assert.equal(calc(b).primary.Toughness, 1180);
  assert.equal(calc(b).primary.CritDamage, 180);
  assert.equal(calc(b).criticalDamage, 162);
  assert.equal(calc(b).primary.Healing, 0);
  const p = emptyPreview();
  p.flags["signet-cooldown-12500"] = true;
  assert.equal(calc(b, 1, p).primary.Toughness, 1000);
  assert.equal(calc(b, 1, p).primary.CritDamage, 180);
  p.flags["signet-cooldown-12491"] = true;
  assert.equal(calc(b, 1, p).primary.CritDamage, 0);
  b.utility = 78305;
  assert.equal(calc(b).primary.Power, 1030); // The 180 signet Ferocity is excluded.
  b.skills[3] = 12542;
  assert.equal(calc(b).primary.Toughness, 1180);
});

test("潜行者刺客与敏捷纹章提供180威力与精准，威能纹章特性不增强或保留", () => {
  const b = createBuild("Thief");
  b.skills = [13050, 13046, 13062, 13064, null];
  selectTrait(b, 1267);
  assert.equal(calc(b).primary.Power, 1180);
  assert.equal(calc(b).primary.Precision, 1180);
  assert.equal(calc(b).primary.Healing, 0);
  const p = emptyPreview();
  p.flags["signet-cooldown-13046"] = true;
  assert.equal(calc(b, 1, p).primary.Power, 1000); // No automatic +540 active grant.
  assert.equal(calc(b, 1, p).primary.Precision, 1180);
  p.flags["signet-cooldown-13062"] = true;
  assert.equal(calc(b, 1, p).primary.Precision, 1000);
  b.utility = 78305;
  assert.equal(calc(b).primary.Power, 1210); // Excludes passive Precision from conversion.
  b.skills[3] = 13060;
  assert.equal(calc(b).primary.Power, 1210);
});

test("唤灵师怨恨纹章180威力，苦难纹章不沿用历史270奖励或生命虹吸属性", () => {
  const b = createBuild("Necromancer");
  b.skills = [21762, 10622, 10612, 10611, null];
  selectTrait(b, 909);
  assert.equal(calc(b).primary.Power, 1180);
  assert.equal(calc(b).primary.Healing, 0);
  assert.ok(
    !calc(b).warnings.some((w) => /苦难纹章|怨恨纹章|吸血纹章/.test(w)),
  );
  const p = emptyPreview();
  p.flags["signet-shroud"] = true;
  assert.equal(calc(b, 1, p).primary.Power, 1000);
  p.flags = { "signet-cooldown-10622": true };
  assert.equal(calc(b, 1, p).primary.Power, 1000);
  b.utility = 48917;
  assert.equal(calc(b).primary.ConditionDamage, 60);
  b.skills[3] = 10562;
  assert.equal(calc(b).primary.ConditionDamage, 60);
});

test("怨恨纹章帷幕抑制覆盖核心夺魂先驱祭祀，灾厄不生成也不读取该条件", () => {
  const b = createBuild("Necromancer");
  b.skills[1] = 10622;
  const p = { ...emptyPreview(), flags: { "signet-shroud": true } };
  for (const elite of [null, 34, 64, 76]) {
    b.specs[2].id = elite;
    assert.equal(calc(b, 1, p).primary.Power, 1000);
    assert.ok(calc(b).controls.some((c) => c.key === "signet-shroud"));
  }
  b.specs[2].id = 60;
  assert.equal(calc(b, 1, p).primary.Power, 1180);
  assert.ok(!calc(b).controls.some((c) => c.key === "signet-shroud"));
  b.skills[1] = null;
  assert.ok(!calc(b).controls.some((c) => c.key === "signet-shroud"));
});

test("玉偃师六种纹章及翠玉驱动器不误算基础属性，超导是输出倍率", () => {
  const b = createBuild("Engineer");
  b.specs[2] = { id: 70, traits: [null, null, 2298] };
  b.food = 97592;
  const baseline = calc(b).primary;
  b.skills = [63049, 63113, 63253, 63111, 63095];
  assert.deepEqual(calc(b).primary, baseline);
  assert.equal(calc(b).primary.ConditionDamage, 100);
  assert.equal(calc(b).primary.Healing, 0);
  assert.ok(
    !calc(b).warnings.some((w) => /超导纹章|斥力纹章|整流纹章/.test(w)),
  );
  assert.ok(!calc(b).controls.some((c) => c.key.startsWith("signet-")));
  b.skills[3] = 63262;
  assert.deepEqual(calc(b).primary, baseline);
  const revenant = createBuild("Revenant");
  assert.equal(
    catalog.skills.filter(
      (s) =>
        s.professions?.includes("Revenant") && s.categories?.includes("Signet"),
    ).length,
    0,
  );
  assert.ok(!calc(revenant).controls.some((c) => c.key.startsWith("signet-")));
});

test("剩余职业纹章按合法槽位去重，固定数值不受API翻译/混合记录影响", () => {
  for (const [profession, first, second, key, expected] of [
    ["Ranger", 12500, 12491, "Toughness", 1180],
    ["Thief", 13046, 13062, "Power", 1180],
    ["Necromancer", 10622, 10622, "Power", 1180],
  ] as const) {
    const b = createBuild(profession);
    b.skills = [first, first, first, second, second];
    const changed = structuredClone(catalog);
    for (const id of new Set([first, second])) {
      const s = changed.skills.find((s) => s.id === id)!;
      s.description = "changed";
      s.facts = [{ type: "AttributeAdjust", target: "Power", value: 9999 }];
    }
    const before = JSON.stringify(b),
      share = encodeShare(b);
    const p = { ...emptyPreview(), might: 25, flags: { unrelated: true } };
    const r = calculateAttributes(b, changed, data, 1, p);
    assert.equal(r.primary[key], expected + (key === "Power" ? 750 : 0));
    for (const attribute of primaryKeys)
      close(
        r.primarySources[attribute].reduce((sum, s) => sum + s.amount, 0),
        r.primary[attribute],
      );
    assert.equal(JSON.stringify(b), before);
    assert.equal(encodeShare(b), share);
    b.profession = "Revenant";
    assert.equal(calc(b).primary[key], 1000);
  }
});
