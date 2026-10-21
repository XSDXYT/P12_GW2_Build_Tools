import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  detailFacts,
  gameDetails,
  gameText,
  reviewedProfileMatchesWiki,
} from "./game-details.ts";
import { reviewedTraitProfiles } from "./game-rules.ts";
import type { Catalog, Entity } from "./domain.ts";
import { pveSnapshot, pveTrait, pveSources } from "./pve-traits.ts";
import { wikiSnapshot, scaleWikiHealing } from "./wiki-details.ts";
import { applyWikiModifiers, type WikiModifier } from "./wiki-modifiers.ts";
import {
  calculateAttributes,
  emptyPreview,
  type AttributeData,
} from "./attributes.ts";
import { createBuild } from "./domain.ts";
const catalog: Catalog = JSON.parse(
  readFileSync("public/catalog.json", "utf8"),
);

test("幻象回复按当前治疗效果计算，零值、灵刃和乐器各档保留独立公式", () => {
  const trait = catalog.traits.find((t) => t.id === 1866)!;
  const base = gameDetails(trait, "trait", new Set(), { healingPower: 1000 });
  assert.deepEqual(
    base.facts.filter((f) => f.scaling).map((f) => f.detail),
    ["989", "1,322", "1,514", "1,706"],
  );
  const blades = gameDetails(
    trait,
    "trait",
    new Set(wikiSnapshot.specializationTraits[66]),
    { healingPower: 1000 },
  );
  assert.equal(blades.facts.filter((f) => f.scaling).length, 5);
  assert.equal(blades.facts.filter((f) => f.scaling).at(-1)?.detail, "1,898");
  const instruments = gameDetails(
    trait,
    "trait",
    new Set(wikiSnapshot.specializationTraits[73]),
    { healingPower: 1000 },
  );
  assert.equal(
    instruments.facts.find((f) => f.label.includes("每件乐器渐强治疗"))?.detail,
    "580",
  );
  assert.equal(
    gameDetails(trait, "trait", new Set(), { healingPower: 0 }).facts.find(
      (f) => f.scaling,
    )?.detail,
    "219",
  );
});

test("装备、灌注和当前武器组的治疗属性使用同一计算结果，预览和公式均不写入配装", () => {
  const build = createBuild("Mesmer");
  build.equipment.head.statId = 156;
  Object.assign(build.equipment.weapon1, {
    weapon: "Staff",
    statId: 156,
    infusions: [39340, null],
  });
  Object.assign(build.equipment.weapon2, {
    weapon: "Staff",
    statId: 161,
    infusions: [null, null],
  });
  const data: AttributeData = JSON.parse(
    readFileSync("public/attribute-data.json", "utf8"),
  );
  const original = JSON.stringify(build);
  const first = calculateAttributes(build, catalog, data, 1, emptyPreview());
  const second = calculateAttributes(build, catalog, data, 2, emptyPreview());
  assert.ok(first.primary.Healing > second.primary.Healing);
  const trait = catalog.traits.find((t) => t.id === 1866)!;
  for (const result of [first, second]) {
    const fact = gameDetails(trait, "trait", new Set(), {
      healingPower: result.primary.Healing,
    }).facts.find((f) => f.scaling)!;
    assert.equal(
      fact.detail,
      Math.round(219 + 0.77 * result.primary.Healing).toLocaleString("en-US"),
    );
  }
  assert.equal(JSON.stringify(build), original);
});

test("九职业所有明确治疗公式及关联分支均可纯计算，其他效果和限定保持原值", () => {
  const before = JSON.stringify(wikiSnapshot);
  const professions = new Set<string>();
  let count = 0;
  for (const kind of ["traits", "skills"] as const)
    for (const [id, entry] of Object.entries(wikiSnapshot.entries[kind])) {
      const entity = (kind === "traits" ? catalog.traits : catalog.skills).find(
        (e) => e.id === +id,
      )!;
      const baseline = gameDetails(
        entity,
        kind === "traits" ? "trait" : "skill",
        new Set(),
      );
      const model = gameDetails(
        entity,
        kind === "traits" ? "trait" : "skill",
        new Set(),
        { healingPower: 1250 },
      );
      const oldFacts = [
        ...baseline.facts,
        ...(baseline.branches || []).flatMap((b) => b.facts),
      ];
      const facts = [
        ...model.facts,
        ...(model.branches || []).flatMap((b) => b.facts),
      ];
      assert.equal(facts.length, oldFacts.length);
      facts.forEach((fact, i) => {
        const old = oldFacts[i];
        if (!old.healing) {
          assert.deepEqual(fact, old);
          return;
        }
        count++;
        professions.add(entry.profession);
        assert.ok(fact.scaling, `${kind}/${id}/${fact.label}`);
        assert.equal(
          fact.scaling.value,
          old.healing.base + old.healing.coefficient * 1250,
        );
        assert.equal(
          fact.detail,
          Math.round(fact.scaling.value).toLocaleString("en-US") +
            old.detail.slice(fact.scaling.formula.length),
        );
        assert.equal(fact.trigger, old.trigger);
        assert.equal(fact.recipient, old.recipient);
        assert.equal(fact.modified, old.modified);
      });
    }
  assert.equal(professions.size, 9);
  assert.ok(count > 300);
  assert.equal(JSON.stringify(wikiSnapshot), before);
});

test("治疗公式在特性覆盖后计算，覆盖移除公式时不会沿用旧系数", () => {
  const facts = [
    {
      label: "治疗",
      detail: "100 + 0.5 × 治疗效果 · 每秒",
      healing: { base: 100, coefficient: 0.5 },
      modified: false,
    },
  ];
  const modifier: WikiModifier = {
    id: "test",
    trait: 1,
    traitName: "测试特性",
    priority: 1,
    source: { kind: "trait", id: 1, title: "Test", revision: 1 },
    changes: [
      {
        type: "replace",
        label: "治疗",
        row: {
          label: "治疗",
          detail: "200 + 0.75 × 治疗效果 · 每秒",
          healing: { base: 200, coefficient: 0.75 },
        },
      },
    ],
  };
  const calculate = () =>
    scaleWikiHealing(
      applyWikiModifiers(facts, [modifier], new Set([1])),
      1000,
    )[0];
  assert.equal(calculate().detail, "950 · 每秒");
  assert.equal(calculate().modified, true);
  modifier.changes = [
    {
      type: "replace",
      label: "治疗",
      row: { label: "治疗", detail: "恢复 10% 生命" },
    },
  ];
  assert.equal(calculate().detail, "恢复 10% 生命");
  assert.equal(calculate().scaling, undefined);
  assert.equal(facts[0].detail, "100 + 0.5 × 治疗效果 · 每秒");
});

test("未知或无效治疗属性保留公式，不使用 API 数值或失配系数猜数值", () => {
  const facts = [
    {
      label: "治疗",
      detail: "100 + 0.5 × 治疗效果",
      healing: { base: 100, coefficient: 0.5 },
      modified: false,
    },
  ];
  for (const value of [undefined, NaN, Infinity, -1])
    assert.deepEqual(scaleWikiHealing(facts, value), facts);
  const stale = [{ ...facts[0], detail: "200 + 1 × 治疗效果" }];
  assert.deepEqual(scaleWikiHealing(stale, 1000), stale);
});

test("幻术误导大师按 Wiki 明确对照缩短粉碎冷却，移除特性后立即恢复", () => {
  const skill = catalog.skills.find((s) => s.id === 10191)!;
  const before = JSON.stringify(wikiSnapshot.entries.skills[10191]);
  const base = gameDetails(skill, "skill", new Set());
  const traited = gameDetails(skill, "skill", new Set([731]));
  assert.equal(base.facts.find((f) => f.label === "冷却时间")?.detail, "12 秒");
  assert.equal(
    traited.facts.find((f) => f.label === "冷却时间")?.detail,
    "10.2 秒",
  );
  assert.equal(
    traited.facts.find((f) => f.label === "冷却时间")?.modified,
    true,
  );
  assert.deepEqual(gameDetails(skill, "skill", new Set()).facts, base.facts);
  assert.equal(JSON.stringify(wikiSnapshot.entries.skills[10191]), before);
});

test("守护者完美铭刻详情与属性面板的216/144保持一致，主动效果不被误增强", () => {
  const model = (id: number) =>
    gameDetails(
      catalog.skills.find((s) => s.id === id)!,
      "skill",
      new Set([579]),
    );
  for (const [id, value] of [
    [9093, "216 威力"],
    [9151, "216 症状伤害"],
    [9163, "144 增益效果"],
  ] as const)
    assert.equal(
      model(id).facts.find((f) => f.label === "纹章被动")?.detail,
      value,
    );
  assert.equal(
    model(9158).facts.find((f) => f.label === "间隔")?.detail,
    "4 秒",
  );
  assert.equal(
    model(9158).facts.find((f) => f.label === "治疗")?.detail,
    "8150 + 1.25 × 治疗效果",
  );
  assert.equal(
    model(9150).facts.find((f) => f.label === "纹章被动")?.detail,
    "-12% 受到的伤害, -12% 受到的症状伤害",
  );
  const base = gameDetails(
    catalog.skills.find((s) => s.id === 9093)!,
    "skill",
    new Set(),
  );
  assert.equal(
    base.facts.find((f) => f.label === "纹章被动")?.detail,
    "180 威力",
  );
});

test("战士多变之力只缩短对应爆发冷却，不改变怒气分档的蔑视数值", () => {
  const skill = catalog.skills.find((s) => s.id === 14387)!;
  const base = gameDetails(skill, "skill", new Set());
  const modified = gameDetails(skill, "skill", new Set([1417]));
  assert.equal(base.facts.find((f) => f.label === "冷却时间")?.detail, "8 秒");
  assert.equal(
    modified.facts.find((f) => f.label === "冷却时间")?.detail,
    "6.8 秒",
  );
  assert.deepEqual(
    modified.facts
      .filter((f) => f.label.includes("蔑视伤害"))
      .map((f) => f.detail),
    ["100", "150", "200"],
  );
});

test("模糊铭文只增强主动效果：治疗6600、解除5症状、失真1秒与易伤10层", () => {
  const model = (id: number) =>
    gameDetails(
      catalog.skills.find((s) => s.id === id)!,
      "skill",
      new Set([752]),
    );
  assert.ok(
    model(21750).facts.some(
      (f) =>
        f.label === "治疗" &&
        f.detail === "6600 + 0.85 × 治疗效果" &&
        f.modified,
    ),
  );
  assert.ok(
    model(21750).facts.some(
      (f) =>
        f.label === "召唤幻象时获得治疗" &&
        f.detail === "350 + 0.06 × 治疗效果" &&
        !f.modified,
    ),
  );
  assert.ok(
    model(10234).facts.some(
      (f) =>
        f.label === "症状移除" &&
        f.detail === "5" &&
        f.trigger === "激活纹章时",
    ),
  );
  assert.ok(
    model(29519).facts.some(
      (f) =>
        f.label === "易伤" && f.detail === "6 秒 · 10 层" && f.stacks === 10,
    ),
  );
  for (const id of [21750, 10236, 10232, 10234, 10247, 29519])
    assert.ok(
      model(id).facts.some(
        (f) => f.label === "失真" && f.detail === "1 秒" && f.modified,
      ),
    );
});

test("万华领悟与模糊铭文组合互不覆盖，数值不采用 API 的整数舍入", () => {
  const decoy = catalog.skills.find((s) => s.id === 10201)!;
  assert.equal(
    gameDetails(decoy, "skill", new Set([674])).facts.find(
      (f) => f.label === "潜行",
    )?.detail,
    "4.5 秒",
  );
  const midnight = catalog.skills.find((s) => s.id === 10234)!;
  const facts = gameDetails(midnight, "skill", new Set([674, 752])).facts;
  assert.equal(facts.find((f) => f.label === "潜行")?.detail, "3 秒");
  assert.equal(facts.find((f) => f.label === "症状移除")?.detail, "5");
  assert.equal(
    facts.find((f) => f.label === "午夜纹章")?.detail,
    "180 症状效果",
  );
  assert.ok(
    !gameDetails(midnight, "skill", new Set()).facts.some(
      (f) => f.label === "症状移除",
    ),
  );
});

test("痛苦之吼与破碎大师保留粉碎命中语义和吟游独立分支", () => {
  const model = (id: number) =>
    gameDetails(
      catalog.skills.find((s) => s.id === id)!,
      "skill",
      new Set([734, 2035]),
    );
  for (const id of [10190, 56928, 62616]) {
    assert.ok(
      model(id).facts.some(
        (f) =>
          f.label === "困惑" && f.detail === "4 秒 · 2 层" && f.stacks === 2,
      ),
    );
    assert.ok(
      model(id).facts.some(
        (f) =>
          f.label === "致残" &&
          f.detail === "3 秒" &&
          f.trigger === "每次命中时",
      ),
    );
  }
  assert.ok(
    model(76746).facts.some(
      (f) => f.label === "困惑" && f.detail === "6 秒 · 5 层" && f.stacks === 5,
    ),
  );
  for (const id of [10287, 56873, 62602])
    assert.equal(
      model(id).facts.find((f) => f.label === "目标数")?.detail,
      "5",
    );
});

test("燃烧精准详情包含33%触发、5秒内置冷却、3秒燃烧及20%PvE时长", () => {
  const trait = catalog.traits.find((t) => t.id === 296)!;
  const facts = detailFacts(trait, "trait", new Set());
  assert.ok(facts.some((f) => f.label === "内置冷却" && f.detail === "5 秒"));
  assert.ok(
    facts.some((f) => f.label === "暴击时触发几率" && f.detail === "33%"),
  );
  assert.ok(
    facts.some(
      (f) => f.label === "燃烧" && f.detail === "3 秒 · 1 层" && f.icon,
    ),
  );
  assert.ok(
    facts.some((f) => f.label === "持续时间延长" && f.detail === "20%（燃烧）"),
  );
  assert.equal(facts.length, 4);
});
test("混沌执念详情仅展示核实后的PvE250增益/100症状效果", () => {
  const trait = catalog.traits.find((t) => t.id === 1865)!;
  const facts = detailFacts(trait, "trait", new Set());
  assert.equal(facts.length, 2);
  assert.equal(facts.find((f) => f.label === "增益效果")?.detail, "+250");
  assert.equal(facts.find((f) => f.label === "症状效果")?.detail, "+100");
});
test("已选特性修正按原始facts索引替换，追加效果不改变被覆盖位置", () => {
  const entity: Entity = {
    id: 1,
    name: "测试技能",
    facts: [
      { type: "BuffArray" },
      { type: "Recharge", value: 20 },
      { type: "Buff", status: "燃烧", duration: 3, apply_count: 1 },
    ],
    traited_facts: [
      {
        type: "Buff",
        status: "威能",
        duration: 5,
        apply_count: 3,
        requires_trait: 11,
      },
      {
        type: "Buff",
        status: "燃烧",
        duration: 5,
        apply_count: 1,
        requires_trait: 11,
        overrides: 2,
      },
      { type: "Recharge", value: 5, requires_trait: 12, overrides: 1 },
    ],
  };
  const original = JSON.stringify(entity);
  assert.equal(
    detailFacts(entity, "skill", new Set()).find((f) => f.label === "燃烧")
      ?.detail,
    "3 秒 · 1 层",
  );
  const modified = detailFacts(entity, "skill", new Set([11]));
  assert.equal(modified.find((f) => f.label === "冷却时间")?.detail, "20 秒");
  assert.equal(modified.find((f) => f.label === "燃烧")?.detail, "5 秒 · 1 层");
  assert.ok(modified.find((f) => f.label === "燃烧")?.modified);
  assert.ok(modified.some((f) => f.label === "威能" && f.stacks === 3));
  assert.equal(JSON.stringify(entity), original);
});
test("没有PvE模型的特性只保留中文描述，不猜测重复原始数值", () => {
  const entity: Entity = {
    id: 2,
    name: "未知特性",
    description: "<c=@reminder>拥有增益时获得属性。</c>",
    facts: [
      { type: "AttributeAdjust", target: "Power", value: 100 },
      { type: "AttributeAdjust", target: "Power", value: 150 },
      { type: "AttributeAdjust", target: "Power", value: 100 },
    ],
  };
  const result = gameDetails(entity, "trait", new Set());
  assert.equal(result.facts.length, 0);
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.description, "拥有增益时获得属性。");
  assert.equal(result.reviewed, false);
});
test("伤害只显示系数，不伪造游戏内伤害；缺失资料保留说明", () => {
  const entity: Entity = {
    id: 3,
    name: "技能",
    facts: [
      { type: "Damage", text: "伤害", dmg_multiplier: 0.75, hit_count: 2 },
      { type: "HealingAdjust", text: "初始自愈" },
    ],
  };
  const facts = detailFacts(entity, "skill", new Set());
  assert.equal(facts[0].detail, "系数 ×0.75 · 2 次命中");
  assert.equal(facts[1].detail, "治疗数值未提供");
  assert.deepEqual(
    detailFacts({ id: 4, name: "无资料" }, "skill", new Set()),
    [],
  );
  assert.equal(
    gameText("<c=@reminder>提示</c><br>威力 &amp; 精准"),
    "提示\n威力 & 精准",
  );
});
test("按持续时间叠加的再生多次施加不会标成强度层数", () => {
  const facts = detailFacts(
    {
      id: 5,
      name: "再生脉冲",
      facts: [{ type: "Buff", status: "再生", duration: 3, apply_count: 6 }],
    },
    "skill",
    new Set(),
  );
  assert.equal(facts[0].detail, "3 秒 · 施加 6 次");
  assert.equal(facts[0].stacks, undefined);
});
test("剑术大师按明确对象生成独立效果：自身8秒，至多4名其他队友4秒", () => {
  const trait = catalog.traits.find((t) => t.id === 707)!;
  const before = JSON.stringify(trait);
  const result = gameDetails(trait, "trait", new Set());
  assert.equal(result.reviewed, true);
  assert.equal(result.unresolved.length, 0);
  const personal = result.facts.find((f) => f.effectId === "personal-fury")!;
  const allies = result.facts.find((f) => f.effectId === "allied-fury")!;
  assert.equal(personal.label, "个人激怒");
  assert.equal(personal.detail, "8 秒");
  assert.deepEqual(personal.audience, { kind: "self" });
  assert.equal(allies.label, "盟友激怒");
  assert.equal(allies.detail, "4 秒");
  assert.deepEqual(allies.audience, {
    kind: "allies",
    maximum: 4,
    includesSelf: false,
  });
  assert.ok(allies.description?.includes("+25%"));
  assert.ok(
    result.facts.some((f) => f.label === "内置冷却" && f.detail === "8 秒"),
  );
  assert.ok(result.facts.some((f) => f.label === "半径" && f.detail === "360"));
  assert.ok(!result.facts.some((f) => f.detail.includes("/")));
  assert.equal(JSON.stringify(trait), before);
  assert.ok(
    result.sources.includes("https://wiki.guildwars2.com/wiki/Master_Fencer"),
  );
});
test("API排序、混合数值和翻译变化不会覆盖固定PvE语义模型", () => {
  const trait = structuredClone(catalog.traits.find((t) => t.id === 707)!);
  trait.facts.reverse();
  assert.equal(
    gameDetails(trait, "trait", new Set()).facts.find(
      (f) => f.effectId === "personal-fury",
    )?.detail,
    "8 秒",
  );
  trait.facts.find((f: any) => f.type === "Buff" && f.duration === 8).duration =
    9;
  const changed = gameDetails(trait, "trait", new Set());
  assert.equal(changed.mode, "pve");
  assert.equal(
    changed.facts.find((f) => f.effectId === "personal-fury")?.detail,
    "8 秒",
  );
  assert.equal(
    changed.facts.find((f) => f.effectId === "allied-fury")?.detail,
    "4 秒",
  );
  assert.deepEqual(changed.unresolved, []);
  const added = structuredClone(catalog.traits.find((t) => t.id === 707)!);
  added.facts.push({
    type: "Buff",
    status: "威能",
    duration: 5,
    apply_count: 1,
  });
  assert.deepEqual(gameDetails(added, "trait", new Set()).facts, changed.facts);
  const changedDescription = {
    ...catalog.traits.find((t) => t.id === 707)!,
    description: "说明已经变化",
  };
  assert.equal(
    gameDetails(changedDescription, "trait", new Set()).reviewed,
    true,
  );
  assert.equal(
    gameDetails(changedDescription, "trait", new Set()).description,
    "说明已经变化",
  );
});

test("PvE快照覆盖九职业，来源固定为live版本且只存游戏事实", () => {
  assert.equal(pveSnapshot.mode, "pve");
  assert.equal(pveSnapshot.balance, "live");
  assert.match(pveSnapshot.sourceCommit, /^[a-f0-9]{40}$/);
  assert.ok(Object.keys(pveSnapshot.traits).length >= 350);
  const known = new Set(catalog.traits.map((t) => t.id));
  const professions = new Set<string>();
  for (const [id, entry] of Object.entries(pveSnapshot.traits)) {
    assert.ok(known.has(+id));
    assert.deepEqual(Object.keys(entry).sort(), ["effects", "paths", "rows"]);
    for (const path of entry.paths) {
      assert.match(path, /^js\/games\/gw2\/professions\/[a-z]+\//);
      professions.add(path.split("/")[4]);
    }
    for (const row of entry.rows) {
      assert.ok(Number.isFinite(row.amount));
      assert.ok(["s", "%", "number"].includes(row.unit));
      assert.match(row.label, /[\u4e00-\u9fff]/);
    }
    const groups = new Set<string>();
    for (const effect of entry.effects) {
      assert.ok(Number.isFinite(effect.duration) && effect.duration >= 0);
      for (const count of [effect.stacks, effect.applications]) {
        if (count != null) assert.ok(Number.isFinite(count) && count > 0);
      }
      const key = JSON.stringify([
        effect.status,
        effect.recipient,
        effect.trigger,
      ]);
      assert.ok(!groups.has(key), `${id}: ambiguous ${key}`);
      groups.add(key);
      assert.ok(!("description" in effect));
    }
    assert.ok(!("description" in entry));
  }
  assert.equal(professions.size, 9);
  assert.ok(
    pveSources(557).every((url) =>
      url.includes(`/blob/${pveSnapshot.sourceCommit}/`),
    ),
  );
});

test("PvE职业加成及百分比采用版本参数，不读取API混合模式数值", () => {
  for (const [id, label, detail] of [
    [557, "增益效果", "+120"],
    [413, "增益效果", "+240"],
    [1059, "增益效果", "+240"],
    [753, "困惑持续时间", "25%"],
  ] as const) {
    const trait = structuredClone(catalog.traits.find((t) => t.id === id)!);
    trait.facts = [
      { type: "AttributeAdjust", target: "BoonDuration", value: 9999 },
    ];
    const model = gameDetails(trait, "trait", new Set());
    assert.equal(model.mode, "pve");
    assert.ok(
      model.facts.some((f) => f.label === label && f.detail === detail),
      `${id}: ${JSON.stringify(model.facts)}`,
    );
  }
});

test("同类敏捷效果保留触发阶段，不合并、不失去限定信息", () => {
  assert.deepEqual(
    pveTrait(2033)?.effects.map((e) => [e.duration, e.trigger]),
    [
      [1, "超载脉冲"],
      [4.5, "超载最后一次脉冲"],
    ],
  );
  assert.deepEqual(
    pveTrait(2195)?.effects.map((e) => [e.duration, e.trigger]),
    [
      [5, "激活决心"],
      [1, "触发决心"],
    ],
  );
});
test("同名特性和同数字技能不共享语义；原始明确的效果标签不会丢失", () => {
  const warrior = catalog.traits.find((t) => t.id === 1333)!;
  const result = gameDetails(warrior, "trait", new Set());
  assert.ok(!result.facts.some((f) => f.label.includes("激怒")));
  const skill = gameDetails(
    {
      id: 707,
      name: "测试技能",
      facts: [{ type: "Buff", text: "个人激怒", status: "激怒", duration: 3 }],
    },
    "skill",
    new Set(),
  );
  assert.equal(skill.reviewed, false);
  assert.equal(skill.facts[0].label, "个人激怒");
  assert.equal(skill.facts[0].detail, "3 秒");
});

test("幻术 Wiki 快照覆盖目录全部 111 特性与 71 技能，按 ID 保留两项差异", () => {
  const specs = new Set(
    catalog.specs.filter((s) => s.profession === "Mesmer").map((s) => s.id),
  );
  const expected = {
    traits: catalog.traits.filter((t) => specs.has(t.specialization)),
    skills: catalog.skills.filter((s) => s.professions?.includes("Mesmer")),
  };
  assert.equal(wikiSnapshot.mode, "pve");
  for (const kind of ["traits", "skills"] as const) {
    assert.deepEqual(
      Object.keys(wikiSnapshot.entries[kind])
        .map(Number)
        .filter((id) => expected[kind].some((e) => e.id === id))
        .sort((a, b) => a - b),
      expected[kind].map((e) => e.id).sort((a, b) => a - b),
    );
    for (const entry of Object.values(wikiSnapshot.entries[kind])) {
      if (entry.identityVerified) assert.ok(entry.revision > 0);
      else assert.deepEqual(entry.rows, []);
      for (const row of entry.rows) {
        assert.match(row.label, /[\u4e00-\u9fff]/);
        assert.doesNotMatch(row.label + row.detail, /[a-z]/i);
        if (row.healing)
          assert.ok(
            Number.isFinite(row.healing.base) &&
              Number.isFinite(row.healing.coefficient),
          );
      }
    }
  }
  assert.equal(wikiSnapshot.professionCoverage.Mesmer.traits.pages, 111);
  assert.equal(wikiSnapshot.professionCoverage.Mesmer.skills.pages, 71);
  assert.deepEqual(
    Object.entries(wikiSnapshot.entries.skills)
      .filter(([, e]) => e.profession === "Mesmer" && !e.identityVerified)
      .map(([id]) => +id),
    [45425, 77306],
  );
});

test("幻象回复显示 PvE 四档治疗公式，API 混杂值不会覆盖 Wiki", () => {
  const entity = structuredClone(catalog.traits.find((e) => e.id === 1866)!);
  const original = JSON.stringify(entity);
  const model = gameDetails(entity, "trait", new Set());
  assert.equal(model.mode, "pve");
  assert.deepEqual(
    model.facts
      .filter((f) => f.detail.includes("治疗效果"))
      .map((f) => f.detail),
    [219, 552, 744, 936].map((n) => `${n} + 0.77 × 治疗效果`),
  );
  assert.equal(model.facts.find((f) => f.label === "症状移除")?.detail, "1");
  assert.equal(model.facts.find((f) => f.label === "目标数")?.detail, "5");
  assert.ok(model.sources.some((s) => s.includes("oldid=3091125")));
  assert.equal(JSON.stringify(entity), original);
  entity.facts = [
    { type: "AttributeAdjust", target: "Healing", value: 999999 },
  ];
  assert.deepEqual(gameDetails(entity, "trait", new Set()).facts, model.facts);
});

test("幻象回复按合法特长的已选特性切换灵刃与乐器说明，不混合两类条件", () => {
  const entity = catalog.traits.find((e) => e.id === 1866)!;
  const minor = (id: number) =>
    new Set(
      catalog.traits
        .filter((t) => t.specialization === id && t.slot === "Minor")
        .map((t) => t.id),
    );
  const virtuoso = gameDetails(entity, "trait", minor(66));
  assert.equal(
    virtuoso.facts.filter((f) => f.label.includes("灵刃治疗")).length,
    5,
  );
  assert.ok(virtuoso.facts.some((f) => f.detail === "1128 + 0.77 × 治疗效果"));
  assert.ok(
    !virtuoso.facts.some(
      (f) => f.label.includes("分身治疗") || f.label.includes("渐强"),
    ),
  );
  const troubadour = gameDetails(entity, "trait", minor(73));
  assert.equal(
    troubadour.facts.filter((f) => f.detail.includes("治疗效果")).length,
    5,
  );
  assert.ok(troubadour.facts.some((f) => f.detail === "330 + 0.25 × 治疗效果"));
  assert.ok(!troubadour.facts.some((f) => f.label.includes("灵刃")));
});

test("Wiki 技能采用 PvE 冷却和昏迷，模糊铭文仅应用 Wiki 明确核实的主动修正", () => {
  const skill = catalog.skills.find((s) => s.id === 10232)!;
  const base = gameDetails(skill, "skill", new Set());
  assert.equal(base.facts.find((f) => f.label === "昏迷")?.detail, "2 秒");
  assert.equal(base.facts.find((f) => f.label === "增益移除")?.detail, "3");
  const enhanced = gameDetails(skill, "skill", new Set([752]));
  assert.equal(enhanced.facts.find((f) => f.label === "增益移除")?.detail, "5");
  assert.equal(
    enhanced.facts.find((f) => f.label === "增益移除")?.modified,
    true,
  );
  assert.ok(enhanced.selectedTraitNotes?.some((t) => t.id === 752));
  assert.equal(base.mode, "pve");
});

test("Wiki 区分分数时长和模式，不读取隐藏排序值或竞争模式奖励", () => {
  const model = (id: number) =>
    gameDetails(
      catalog.traits.find((t) => t.id === id)!,
      "trait",
      new Set(),
    );
  assert.equal(
    model(666).facts.find((f) => f.label === "再生")?.detail,
    "6 秒",
  );
  assert.equal(
    model(729).facts.find((f) => f.label === "个人急速")?.detail,
    "1.5 秒",
  );
  assert.ok(model(667).facts.some((f) => f.detail.includes("+7% 症状伤害")));
  assert.ok(!model(667).facts.some((f) => f.detail.includes("+10% 症状伤害")));
});

test("Wiki 页面 ID 不一致的技能只保留说明与来源，不从同名或 API 猜 PvE 数值", () => {
  for (const id of [45425, 77306]) {
    const entity = catalog.skills.find((e) => e.id === id)!;
    const model = gameDetails(entity, "skill", new Set([2206, 2367]));
    assert.deepEqual(model.facts, []);
    assert.equal(model.description, gameText(entity.description));
    assert.equal(model.reviewed, false);
    assert.equal(model.mode, undefined);
    assert.ok(
      model.sourceUrl?.startsWith("https://wiki.wishingstar.top/wiki/"),
    );
  }
});

test("Wiki 中文语义修正不会沿用错误的冷却重置、敏捷对象或击退说明", () => {
  const trait = (id: number) =>
    gameDetails(
      catalog.traits.find((t) => t.id === id)!,
      "trait",
      new Set(),
    );
  assert.match(trait(700).description, /缩短手枪技能/);
  assert.doesNotMatch(trait(700).description, /重置/);
  assert.match(trait(1859).description, /施加给你的敏捷/);
  assert.match(trait(1915).description, /灵刃术士在储存灵刃时触发/);
  const skill = gameDetails(
    catalog.skills.find((s) => s.id === 62573)!,
    "skill",
    new Set(),
  );
  assert.match(skill.description, /伤害附近敌人/);
  assert.doesNotMatch(skill.description, /击退/);
});

test("每个已接入职业的 Wiki 身份覆盖目录，未确认身份不会回退猜数值", () => {
  assert.deepEqual(
    [...wikiSnapshot.professions].sort(),
    catalog.professions.map((p) => p.id).sort(),
  );
  assert.equal(
    Object.keys(wikiSnapshot.entries.traits).length,
    catalog.traits.length,
  );
  assert.ok(
    Object.values(wikiSnapshot.entries.traits).every((e) => e.identityVerified),
  );
  for (const p of wikiSnapshot.professions) {
    const ids = new Set(
      catalog.specs.filter((s) => s.profession === p).map((s) => s.id),
    );
    const sets = {
      traits: catalog.traits.filter((t) => ids.has(t.specialization)),
      skills: catalog.skills.filter((s) => s.professions?.includes(p)),
    };
    for (const k of ["traits", "skills"] as const)
      for (const e of sets[k]) {
        const entry = wikiSnapshot.entries[k][e.id];
        assert.ok(entry, `${p}/${k}/${e.id}`);
        if (!entry.identityVerified)
          assert.deepEqual(
            gameDetails(e, k === "traits" ? "trait" : "skill", new Set()).facts,
            [],
          );
      }
    assert.equal(wikiSnapshot.professionCoverage[p].traits.skippedRows, 0);
    assert.equal(wikiSnapshot.professionCoverage[p].skills.skippedRows, 0);
  }
});

test("重名特性经 Wiki 实际索引消歧后按精确 ID 接入，不再指向宠物或其他特长", () => {
  for (const [id, title] of [
    [1368, "Defy_Pain_(warrior_trait)"],
    [2256, "Pistol_Proficiency_(bladesworn)"],
    [358, "Cleansing_Wave_(trait)"],
  ] as const) {
    const entry = wikiSnapshot.entries.traits[id];
    assert.equal(entry.title, title);
    assert.equal(entry.identityVerified, true);
    assert.ok(entry.revision > 0);
  }
  assert.ok(
    wikiSnapshot.entries.traits[358].rows.some(
      (r) => r.label === "症状移除" && r.detail === "1",
    ),
  );
});

test("守护者 Wiki 治疗采用明确 PvE 公式，触发增益保留类型与层数", () => {
  const heal = gameDetails(
    catalog.skills.find((s) => s.id === 30025)!,
    "skill",
    new Set(),
  );
  assert.ok(heal.facts.some((f) => f.detail === "6480 + 1 × 治疗效果"));
  assert.equal(heal.mode, "pve");
  const trap = gameDetails(
    catalog.skills.find((s) => s.id === 30273)!,
    "skill",
    new Set(),
  );
  assert.ok(
    trap.facts.some(
      (f) =>
        f.label.includes("陷阱触发") &&
        f.label.includes("威能") &&
        f.stacks === 10,
    ),
  );
});

test("战士 Wiki 保留怒气档位的治疗、时长和层数，战吼分档不混合", () => {
  const health = gameDetails(
    catalog.traits.find((t) => t.id === 1348)!,
    "trait",
    new Set(),
  );
  assert.ok(
    health.facts.some(
      (f) =>
        f.label === "怒气等级 1" &&
        f.detail === "2992 + 0.6 × 治疗效果 · 15 秒 · 2 层",
    ),
  );
  const precision = gameDetails(
    catalog.traits.find((t) => t.id === 1336)!,
    "trait",
    new Set(),
  );
  assert.ok(
    precision.facts.some(
      (f) =>
        f.label === "怒气等级 3" &&
        f.detail.includes("4 秒") &&
        f.detail.includes("250 暴击效果"),
    ),
  );
  const chant = gameDetails(
    catalog.skills.find((s) => s.id === 76782)!,
    "skill",
    new Set(),
  );
  assert.ok(
    chant.facts.some(
      (f) =>
        f.label === "4-6 层士气 · 治疗" && f.detail === "975 + 0.3 × 治疗效果",
    ),
  );
  const missing = gameDetails(
    catalog.skills.find((s) => s.id === 46044)!,
    "skill",
    new Set(),
  );
  assert.deepEqual(missing.facts, []);
  assert.deepEqual(missing.sources, []);
  assert.equal(missing.sourceUrl, undefined);
});

test("工程师 Wiki 区分所需增益、光子熔炉充能与热量条件", () => {
  const boon = gameDetails(
    catalog.traits.find((t) => t.id === 469)!,
    "trait",
    new Set(),
  );
  assert.ok(
    boon.facts.some((f) => f.label === "所需增益" && f.detail === "威能"),
  );
  const forge = gameDetails(
    catalog.traits.find((t) => t.id === 2106)!,
    "trait",
    new Set(),
  );
  assert.ok(
    forge.facts.some(
      (f) =>
        f.label === "光子熔炉过热" &&
        f.stacks === 6 &&
        f.detail.startsWith("4 秒"),
    ),
  );
  const heat = gameDetails(
    catalog.skills.find((s) => s.id === 44646)!,
    "skill",
    new Set(),
  );
  assert.ok(
    heat.facts.some(
      (f) => f.label === "热量超过 50% 时提供屏障" && f.detail === "2,900",
    ),
  );
});

test("游侠 Wiki 保留雕文两种形态和合体技能水下限定，不套用宠物同名数字", () => {
  const glyph = gameDetails(
    catalog.skills.find((s) => s.id === 31677)!,
    "skill",
    new Set(),
  );
  assert.ok(
    glyph.facts.some(
      (f) => f.label === "天界化身形态" && f.detail.includes("复苏"),
    ),
  );
  assert.ok(
    glyph.facts.some(
      (f) => f.label === "非天界化身形态" && f.detail.includes("稳固"),
    ),
  );
  const chomp = gameDetails(
    catalog.skills.find((s) => s.id === 41537)!,
    "skill",
    new Set(),
  );
  assert.ok(
    chomp.facts.some(
      (f) => f.label === "闪避" && f.detail === "1.5 秒 (仅水下)",
    ),
  );
  assert.ok(chomp.facts.some((f) => f.detail === "1285 + 0.5 × 治疗效果"));
  const retreat = gameDetails(
    catalog.skills.find((s) => s.id === 41461)!,
    "skill",
    new Set(),
  );
  assert.equal(retreat.reviewed, true);
  assert.match(retreat.sourceUrl!, /Devourer_Retreat_\(soulbeast\)$/);
  assert.ok(
    retreat.facts.some((f) => f.label === "距离" && f.detail === "300"),
  );
  assert.ok(
    retreat.facts.some((f) => f.label === "闪避" && f.detail === "0.75 秒"),
  );
});

test("原始 53 项身份逐项留存：28 项独立精确 ID 已接入，其余 25 项继续保护", () => {
  const baseline = JSON.parse(
    readFileSync("data/wiki-research-baseline.json", "utf8"),
  );
  const report = JSON.parse(
    readFileSync("data/wiki-identity-research.json", "utf8"),
  );
  assert.equal(baseline.identities.length, 53);
  const counts = { verified: 0, unconfirmed: 0 };
  for (const target of baseline.identities) {
    const record = report.entries[target.id];
    const entry = wikiSnapshot.entries.skills[target.id];
    if (record.status === "exact-id-verified") {
      counts.verified++;
      assert.equal(entry.identityVerified, true);
      assert.ok(
        record.candidates.some((c: { ids: number[] }) =>
          c.ids.includes(target.id),
        ),
      );
      assert.equal(entry.title, record.verified.title);
    } else {
      counts.unconfirmed++;
      assert.equal(entry.identityVerified, false);
      assert.deepEqual(entry.rows, []);
    }
  }
  assert.deepEqual(counts, { verified: 28, unconfirmed: 25 });
});

test("27 行原始 Wiki 注记均已复核，不显示误加的蔑视值或自身控制", () => {
  const baseline = JSON.parse(
    readFileSync("data/wiki-research-baseline.json", "utf8"),
  );
  const audit = JSON.parse(readFileSync("data/wiki-audit.json", "utf8"));
  assert.equal(baseline.sic.length, 27);
  for (const row of baseline.sic) {
    const entry = audit.entries[row.kind][row.id];
    assert.equal(entry.withheld.length, 0);
    assert.ok(
      entry.reviewedRows.some((r: { text: string }) => r.text === row.text),
    );
  }
  const facts = (id: number) =>
    gameDetails(
      catalog.skills.find((s) => s.id === id)!,
      "skill",
      new Set(),
    ).facts;
  assert.deepEqual(
    facts(14387)
      .filter((f) => f.label.includes("蔑视伤害"))
      .map((f) => f.detail),
    ["100", "150", "200"],
  );
  assert.ok(facts(62561).some((f) => f.detail === "主目标 400；其他目标 150"));
  assert.ok(facts(62603).some((f) => f.detail === "约 300"));
  assert.ok(facts(12542).some((f) => f.detail === "6 秒 · 10 次攻击"));
  for (const id of [76808, 77255])
    assert.ok(!facts(id).some((f) => f.label === "蔑视伤害"));
});

test("雕文、召唤指令各自保留数值和来源，未把子技能累计到父技能", () => {
  const model = (id: number) =>
    gameDetails(
      catalog.skills.find((s) => s.id === id)!,
      "skill",
      new Set(),
    );
  const glyph = model(31322);
  assert.equal(glyph.branches?.length, 2);
  assert.ok(!glyph.facts.some((f) => f.detail.includes("3076")));
  assert.ok(
    glyph.branches![1].facts.some(
      (f) => f.label === "治疗" && f.detail === "3076 + 1 × 治疗效果",
    ),
  );
  assert.deepEqual(
    model(5734).branches!.map(
      (b) => b.facts.find((f) => f.label === "冷却时间")?.detail,
    ),
    ["25 秒", "30 秒", "60 秒", "40 秒"],
  );
  const blood = model(10547);
  assert.ok(
    blood.branches![0].facts.some((f) => f.detail === "3960 + 1 × 治疗效果"),
  );
  assert.ok(!blood.facts.some((f) => f.detail.includes("3960")));
  assert.equal(model(10549).branches, undefined);
});

test("形态中的特性替代技能只在选中对应特性后出现，分支审计不会打包到浮层", () => {
  const shroud = catalog.skills.find((s) => s.id === 10574)!;
  const base = gameDetails(shroud, "skill", new Set());
  assert.ok(
    base.branches!.some(
      (b) =>
        b.label.startsWith("水下") && b.sourceUrl.endsWith("Tainted_Shackles"),
    ),
  );
  const traited = gameDetails(shroud, "skill", new Set([905]));
  assert.equal(
    base.branches!.filter((b) => b.sourceUrl.includes("Dhuumfire")).length,
    0,
  );
  assert.equal(
    traited.branches!.filter((b) => b.sourceUrl.includes("Dhuumfire")).length,
    2,
  );
  for (const entry of Object.values(wikiSnapshot.entries.skills)) {
    assert.equal("reviewedRows" in entry, false);
    for (const branch of entry.branches || []) {
      assert.match(branch.label, /[\u4e00-\u9fff]/);
      assert.doesNotMatch(branch.label, /[a-z]/i);
      assert.ok(branch.revision > 0);
      for (const row of branch.rows) {
        assert.match(row.label, /[\u4e00-\u9fff]/);
        assert.doesNotMatch(row.label + row.detail, /[a-z]|\[sic\]/i);
      }
    }
  }
  assert.equal(wikiSnapshot.branchCoverage.skippedRows, 0);
  assert.equal(wikiSnapshot.branchCoverage.withheldRows, 0);
});

test("潜行者 Wiki 区分潜行攻击症状与纹章主动威力，不将主动奖励写成被动", () => {
  const attack = gameDetails(
    catalog.traits.find((t) => t.id === 1169)!,
    "trait",
    new Set(),
  );
  assert.ok(
    attack.facts.some(
      (f) =>
        /^潜行攻击 · (致残|残废)$/.test(f.label) && f.detail.startsWith("5 秒"),
    ),
  );
  assert.ok(
    attack.facts.some(
      (f) => f.label === "潜行攻击 · 目盲" && f.detail === "5 秒",
    ),
  );
  const signet = gameDetails(
    catalog.skills.find((s) => s.id === 13046)!,
    "skill",
    new Set(),
  );
  assert.ok(
    signet.facts.some(
      (f) => f.label === "被动威力提高" && f.detail === "180 威力",
    ),
  );
  assert.ok(
    signet.facts.some(
      (f) => f.label === "主动威力提高" && f.detail === "5 秒 · 540 威力",
    ),
  );
});

test("三个语义模型仅在所有已建模数值与 Wiki 一致时优先，Wiki 变化会退出旧模型", () => {
  for (const id of [296, 707, 1865]) {
    const facts = wikiSnapshot.entries.traits[id].rows.map((r) => ({
      ...r,
      modified: false,
    }));
    const profile = reviewedTraitProfiles[id];
    assert.equal(reviewedProfileMatchesWiki(profile, facts), true, `${id}`);
    for (let i = 0; i < facts.length; i++) {
      const changed = structuredClone(facts);
      changed[i].detail = "99999";
      assert.equal(
        reviewedProfileMatchesWiki(profile, changed),
        false,
        `${id}/${i}`,
      );
    }
    assert.equal(reviewedProfileMatchesWiki(profile, []), false);
  }
});

test("元素 Wiki 保留协调与超载阶段，威能档位不丢条件", () => {
  const swift = gameDetails(
    catalog.traits.find((t) => t.id === 2061)!,
    "trait",
    new Set(),
  );
  assert.ok(
    swift.facts.some((f) => f.label === "大地协调" && f.detail === "25 耐力"),
  );
  assert.ok(
    swift.facts.some(
      (f) => f.label === "流水协调" && f.detail === "移除一个症状",
    ),
  );
  const overload = gameDetails(
    catalog.traits.find((t) => t.id === 2033)!,
    "trait",
    new Set(),
  );
  assert.ok(
    overload.facts.some(
      (f) =>
        f.label === "超载最后一次脉冲敏捷" && f.detail.startsWith("4.5 秒"),
    ),
  );
  const fire = gameDetails(
    catalog.skills.find((s) => s.id === 76711)!,
    "skill",
    new Set(),
  );
  assert.ok(
    fire.facts.some(
      (f) => f.label.includes("威能超过 20 层") && f.detail === "系数 ×3.0",
    ),
  );
});

test("唤灵师 Wiki 区分虹吸的伤害与治疗系数，并保留疫病脉冲的症状种类", () => {
  const aura = gameDetails(
    catalog.traits.find((t) => t.id === 1844)!,
    "trait",
    new Set(),
  );
  assert.ok(
    aura.facts.some(
      (f) => f.label === "帷幕中虹吸伤害" && f.detail === "129 + 0.0666 × 威力",
    ),
  );
  assert.ok(
    aura.facts.some(
      (f) =>
        f.label === "帷幕中虹吸治疗" && f.detail === "62 + 0.0666 × 治疗效果",
    ),
  );
  const plague = gameDetails(
    catalog.skills.find((s) => s.id === 10549)!,
    "skill",
    new Set(),
  );
  assert.ok(
    plague.facts.some(
      (f) =>
        f.label === "第二次脉冲 · 中毒" && f.detail === "5 秒 · -33% 治疗效能",
    ),
  );
  assert.ok(!plague.facts.some((f) => /168|176|1310/.test(f.detail)));
});

test("魂武者 Wiki 保留能量维持消耗与治疗公式，真龙天性按姿态 ID 消歧", () => {
  const hammer = gameDetails(
    catalog.skills.find((s) => s.id === 26557)!,
    "skill",
    new Set(),
  );
  assert.ok(
    hammer.facts.some((f) => f.label === "能量消耗" && f.detail === "5"),
  );
  assert.ok(
    hammer.facts.some((f) => f.label === "能量维持消耗" && f.detail === "-6"),
  );
  assert.ok(hammer.facts.some((f) => f.detail === "53 + 0.004 × 治疗效果"));
  assert.equal(wikiSnapshot.entries.skills[51675].identityVerified, true);
  assert.equal(wikiSnapshot.entries.skills[51675].title, "True_Nature_(dwarf)");
});
