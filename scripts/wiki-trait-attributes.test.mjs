import test from "node:test";
import assert from "node:assert/strict";
import { attachTraitModifiers } from "./wiki-trait-modifiers.mjs";

function fixture() {
  const html =
    '<script>{"wgRevisionId":12}</script><div class="mw-parser-output"><div class="infobox trait"></div><blockquote>Gain vitality based on power. Gain Vitality Based on a Percentage of Power: 10%</blockquote></div>';
  return {
    snapshot: {
      entries: {
        skills: {},
        traits: {
          42: {
            identityVerified: true,
            profession: "Engineer",
            title: "Trait",
            revision: 12,
            rows: [{ label: "威力转化为体力的比例", detail: "10%" }],
          },
        },
      },
    },
    catalog: {
      traits: [{ id: 42, name: "特性", specialization: 1 }],
      specs: [{ id: 1, profession: "Engineer" }],
    },
    config: {
      professions: ["Engineer"],
      rules: [],
      attributeBonuses: [
        {
          trait: 42,
          revision: 12,
          evidence: ["Gain vitality based on power."],
          guards: [{ label: "威力转化为体力的比例", detail: "10%" }],
          rules: [{ target: "Vitality", from: "Power", amount: 10 }],
        },
      ],
    },
    readHtml: async () => html,
  };
}
test("属性元数据只接受已核实同职业ID、版本、当前PvE证据与基础行", async () => {
  const f = fixture();
  await attachTraitModifiers(f);
  assert.equal(f.snapshot.traitAttributeBonuses[0].rules[0].amount, 10);
  assert.equal(f.snapshot.modifierCoverage.attributeTraits, 1);
  for (const mutate of [
    (f) => {
      f.snapshot.entries.traits[42].identityVerified = false;
    },
    (f) => {
      f.snapshot.entries.traits[42].profession = "Guardian";
    },
    (f) => {
      f.snapshot.entries.traits[42].revision = 13;
    },
    (f) => {
      f.config.attributeBonuses[0].guards[0].detail = "15%";
    },
    (f) => {
      f.config.attributeBonuses.push(
        structuredClone(f.config.attributeBonuses[0]),
      );
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(
      () => attachTraitModifiers(f),
      /attribute|Attribute|source revision/,
    );
  }
});
test("竞争模式或历史中的属性依据不生效，未知条件与非法叠层合约被拒绝", async () => {
  for (const transform of [
    (html) =>
      html.replace(
        "Gain vitality based on power.",
        '<span class="gamemode pvp">Gain vitality based on power.</span>',
      ),
    (html) =>
      html
        .replace("Gain vitality based on power.", "")
        .replace(
          "</div>",
          '<div class="mw-heading2"><h2 id="Version_history">History</h2></div>Gain vitality based on power.</div>',
        ),
  ]) {
    const f = fixture(),
      read = f.readHtml;
    f.readHtml = async () => transform(await read());
    await assert.rejects(() => attachTraitModifiers(f), /Attribute evidence/);
  }
  for (const rule of [
    { target: "Power", amount: NaN },
    { target: "Health", amount: 100 },
    { target: "Power", amount: 100, gates: ["guessedCondition"] },
    { target: "Power", amount: 10, perStack: "unreviewed" },
    { target: "critical", amount: 10, anyGates: ["guessedCondition"] },
    { target: "Power", amount: 10, scaleWith: "Vitality" },
    { target: "duration", amount: 10, effect: "UnreviewedStatus" },
    { target: "criticalMultiplier", amount: 10, from: "Power" },
    { target: "Power", amount: 10, requiresTraits: [123456] },
  ]) {
    const f = fixture();
    f.config.attributeBonuses[0].rules = [rule];
    await assert.rejects(
      () => attachTraitModifiers(f),
      /Unsupported attribute/,
    );
  }
});

test("百分比属性转换允许有界层数；跨职业条件特性或隐藏专精条件被拒绝", async () => {
  const f = fixture(),
    d = f.config.attributeBonuses[0];
  d.controls = [
    { key: "instruments", label: "乐器数", description: "最多4件", max: 4 },
  ];
  d.rules = [
    {
      target: "Vitality",
      from: "Vitality",
      amount: 4,
      perStack: "instruments",
    },
  ];
  await attachTraitModifiers(f);
  assert.equal(
    f.snapshot.traitAttributeBonuses[0].rules[0].perStack,
    "instruments",
  );
  const bad = fixture();
  bad.config.attributeBonuses[0].controls = [
    {
      key: "shroud",
      label: "帷幕",
      description: "预览",
      excludeSpecializations: [99999],
    },
  ];
  await assert.rejects(
    () => attachTraitModifiers(bad),
    /Invalid attribute preview/,
  );
});
