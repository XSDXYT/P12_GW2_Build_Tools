import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gameDetails, type DetailFact } from "./game-details.ts";
import { projectEffectDurations } from "./effect-durations.ts";
import { createBuild, armorSlots, type Catalog } from "./domain.ts";
import {
  calculateAttributes,
  parseAttributeEffect,
  type AttributeData,
} from "./attributes.ts";
const catalog: Catalog = JSON.parse(
  readFileSync("public/catalog.json", "utf8"),
);
const data: AttributeData = JSON.parse(
  readFileSync("public/attribute-data.json", "utf8"),
);
const row = (label: string, detail = "4 秒 · 3 层"): DetailFact => ({
  label,
  detail,
  modified: false,
});

test("时长按各类奖励计算并限制0–100%，保留层数和对象、基础时长与输入", () => {
  const rows = [
    { ...row("威能"), recipient: "其他盟友", trigger: "命中时" },
    row("激怒"),
    row("折磨"),
    row("燃烧"),
  ];
  const before = structuredClone(rows);
  const out = projectEffectDurations(rows, {
    boonDuration: 20,
    boons: { Might: 150 },
    conditionDuration: 10,
    conditions: { Torment: 40, Burning: -10 },
  });
  assert.deepEqual(
    out.map((r) => r.detail),
    ["8 秒 · 3 层", "4.8 秒 · 3 层", "5.6 秒 · 3 层", "4 秒 · 3 层"],
  );
  assert.equal(out[0].durationScaling?.base, 4);
  assert.equal(out[0].durationScaling?.bonus, 100);
  assert.equal(out[0].recipient, "其他盟友");
  assert.equal(out[0].trigger, "命中时");
  assert.deepEqual(rows, before);
});
test("冷却、场地、毒液有效期、隐身、控制、复制延长和自身症状不套普通时长", () => {
  const rows = [
    "冷却时间",
    "引爆窗口",
    "持续时间",
    "毒液有效期",
    "隐身",
    "超级速度",
    "昏迷",
    "晕眩",
    "石化",
    "变形",
    "威能持续时间延长",
    "复制 · 威能",
    "自身流血",
    "每击中一个敌人使自身获得折磨",
  ].map((s) => row(s));
  assert.deepEqual(
    projectEffectDurations(rows, { boonDuration: 100, conditionDuration: 100 }),
    rows,
  );
  assert.deepEqual(projectEffectDurations([row("威能")], {}), [row("威能")]);
});
test("单增益符文奖励进入各自属性及详情，不污染通用奖励或其他增益", () => {
  assert.deepEqual(parseAttributeEffect("+50% Might Duration").durations, {
    Might: 50,
  });
  const b = createBuild();
  for (const slot of armorSlots) b.equipment[slot].runeId = 24714;
  const attrs = calculateAttributes(b, catalog, data);
  assert.equal(attrs.boonDuration, 0);
  assert.equal(attrs.boons.Might, 50);
  assert.equal(attrs.boons.Fury, 0);
  assert.equal(
    attrs.durationSources.Might.reduce((n, s) => n + s.amount, 0),
    50,
  );
  const d = gameDetails(
    { id: 72005, name: "鼓舞成像" },
    "skill",
    new Set(),
    attrs,
  );
  assert.equal(
    d.facts.find((f) => f.label === "威能")?.detail,
    "13.5 秒 · 12 层",
  );
  assert.equal(d.facts.find((f) => f.label === "激怒")?.detail, "9 秒");
});
test("先保留特性基础修正和自身/盟友语义，再投影时长；分支和引用共用模型", () => {
  const t = catalog.traits.find((t) => t.id === 707)!;
  const d = gameDetails(t, "trait", new Set(), { boonDuration: 50 });
  assert.equal(
    d.facts.find((f) => f.effectId === "personal-fury")?.detail,
    "12 秒",
  );
  assert.equal(
    d.facts.find((f) => f.effectId === "allied-fury")?.detail,
    "6 秒",
  );
  const a = gameDetails({ id: 72076, name: "成像分离" }, "skill", new Set(), {
    conditions: { Blind: 60, Weakness: 20 },
  });
  assert.equal(a.facts.find((f) => f.label === "目盲")?.detail, "8 秒");
  assert.equal(a.facts.find((f) => f.label === "虚弱")?.detail, "6 秒");
  assert.equal(a.facts.find((f) => f.label === "引爆窗口")?.detail, "2 秒");
});
test("API明确应用行与非玩家分支边界，不在重复原始记录中挑第一条", () => {
  const api = {
    id: 999999,
    name: "测试",
    facts: [
      { type: "Buff", status: "威能", duration: 3 },
      { type: "Buff", status: "中毒", duration: 4 },
      { type: "Buff", status: "中毒", duration: 8 },
    ],
  };
  const d = gameDetails(api, "skill", new Set(), {
    boonDuration: 50,
    conditionDuration: 50,
  });
  assert.equal(d.facts[0].detail, "4.5 秒");
  assert.equal(d.unresolved.length, 1);
  const original = gameDetails(
    catalog.skills.find((s) => s.id === 29519)!,
    "skill",
    new Set(),
  );
  const projected = gameDetails(
    catalog.skills.find((s) => s.id === 29519)!,
    "skill",
    new Set(),
    { boonDuration: 100, conditionDuration: 100 },
  );
  assert.deepEqual(projected.branches, original.branches);
});
