import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseWikiStructure } from "./wiki-structure.mjs";
import { reconcileStructure } from "./data-source-policy.mjs";
import { loadSourcePolicy, writeSourcedSnapshot } from "./data-source-io.mjs";

const row = (name, value) => `<dt>${name}</dt><dd>${value}</dd>`;
const page = (body, ids = [42], kind = "trait", revision = 123) =>
  `<script>{"wgRevisionId":${revision}}</script><div class="infobox ${kind}">${body}${ids.map((id) => `<span class="gamelink" data-type="${kind}" data-id="${id}"></span>`).join("")}</div>`;
const context = {
  kind: "traits",
  id: 42,
  title: "Example_Trait",
  revision: 123,
  specNames: { 1: "Inspiration" },
};
function fixture() {
  const entry = parseWikiStructure(
    page(
      row("Tier", "Grandmaster") +
        row("Type", "Major") +
        row("Specialization", '<a title="Inspiration">Inspiration</a>'),
    ),
    context,
  );
  return {
    input: {
      traits: [
        {
          id: 42,
          tier: 3,
          order: 1,
          slot: "Major",
          specialization: 1,
          name: "中文",
          icon: "render",
          facts: [{ value: 999 }],
          traited_facts: [{ value: 5 }],
        },
      ],
      skills: [],
      stats: [{ id: 7 }],
      statChoices: { equipment: [7] },
      specs: [{ id: 1, major_traits: [42] }],
    },
    policy: {
      dataset: "catalog",
      evidence: {
        schema: 1,
        specNames: context.specNames,
        entries: { traits: { 42: entry }, skills: {} },
      },
      reviews: { schema: 1, rules: [] },
      revisions: {
        traits: { 42: { ...entry, identityVerified: true } },
        skills: {},
      },
    },
  };
}

test("Wiki只提取当前精确ID的显式结构，保留API位置/名称/图标/原始数值", () => {
  const { input, policy } = fixture();
  const before = structuredClone(input);
  const { output, audit } = reconcileStructure(input, policy);
  const { sourcePolicy, ...data } = output;
  assert.deepEqual(data, before);
  assert.deepEqual(input, before);
  assert.equal(audit.summary.confirmed, 3);
  assert.equal(
    audit.rows[0].url,
    "https://wiki.guildwars2.com/wiki/Example_Trait?oldid=123",
  );
  assert.equal(output.traits[0].order, 1);
  assert.equal(sourcePolicy.effects, "wiki-pve-first");
});

test("Wiki字段缺失则保留API，API缺字段可用明确Wiki值补齐且可重复生成", () => {
  const { input, policy } = fixture();
  delete input.traits[0].tier;
  const first = reconcileStructure(input, policy);
  assert.equal(first.output.traits[0].tier, 3);
  assert.equal(first.audit.summary.filled, 1);
  const second = reconcileStructure(first.output, policy);
  assert.deepEqual(second, first);
  assert.equal(
    second.audit.rows.find((r) => r.field === "tier").apiMissing,
    true,
  );
  const sparse = structuredClone(policy);
  delete sparse.evidence.entries.traits[42].values.tier;
  assert.equal(
    reconcileStructure(
      { ...input, traits: [{ ...input.traits[0], tier: 2 }] },
      sparse,
    ).output.traits[0].tier,
    2,
  );
});

test("冲突先留审计，只有绑定旧API值和Wiki revision的审定记录可覆盖", () => {
  const { input, policy } = fixture();
  input.traits[0].tier = 2;
  let result = reconcileStructure(input, policy);
  assert.equal(result.output.traits[0].tier, 2);
  assert.deepEqual(result.audit.conflicts, ["traits/42/tier"]);
  policy.reviews.rules = [
    {
      kind: "traits",
      id: 42,
      field: "tier",
      apiValue: 2,
      wikiValue: 3,
      revision: 123,
      reason: "当前页面明确列为Grandmaster",
    },
  ];
  result = reconcileStructure(input, policy);
  assert.equal(result.output.traits[0].tier, 3);
  assert.equal(result.audit.summary.corrected, 1);
  assert.equal(result.output.sourcePolicy.overrides[0].apiValue, 2);
  assert.deepEqual(reconcileStructure(result.output, policy), result);
  const caughtUp = reconcileStructure(
    { ...input, traits: [{ ...input.traits[0], tier: 3 }] },
    policy,
  );
  assert.equal(caughtUp.audit.summary.confirmed, 3);
  assert.deepEqual(caughtUp.output.sourcePolicy.overrides, []);
  input.traits[0].tier = 1;
  assert.equal(reconcileStructure(input, policy).audit.conflicts.length, 1);
});

test("Wiki换版后能依据保留的API原值重新审定，不把旧覆盖值当成API", () => {
  const { input, policy } = fixture();
  input.traits[0].tier = 2;
  policy.reviews.rules = [
    {
      kind: "traits",
      id: 42,
      field: "tier",
      apiValue: 2,
      wikiValue: 3,
      revision: 123,
      reason: "第一版",
    },
  ];
  const first = reconcileStructure(input, policy);
  const updated = structuredClone(policy);
  updated.evidence.entries.traits[42].revision = 124;
  updated.evidence.entries.traits[42].values.tier = 1;
  updated.evidence.entries.traits[42].url =
    "https://wiki.guildwars2.com/wiki/Example_Trait?oldid=124";
  updated.revisions.traits[42].revision = 124;
  updated.reviews.rules = [
    {
      kind: "traits",
      id: 42,
      field: "tier",
      apiValue: 2,
      wikiValue: 1,
      revision: 124,
      reason: "新版本重审",
    },
  ];
  const second = reconcileStructure(first.output, updated);
  assert.equal(second.output.traits[0].tier, 1);
  assert.equal(second.output.sourcePolicy.overrides[0].apiValue, 2);
  assert.equal(second.output.sourcePolicy.overrides[0].revision, 124);
  const tampered = structuredClone(first.output);
  tampered.traits[0].tier = 1;
  assert.throws(
    () => reconcileStructure(tampered, updated),
    /previously resolved/,
  );
  const missing = fixture();
  delete missing.input.traits[0].tier;
  const filled = reconcileStructure(missing.input, missing.policy);
  updated.reviews.rules = [];
  assert.equal(
    reconcileStructure(filled.output, updated).output.traits[0].tier,
    1,
  );
});

test("来源版本、ID、字段白名单及审定记录失配时拒绝更新", () => {
  for (const mutate of [
    (p) => p.revisions.traits[42].revision++,
    (p) => (p.revisions.traits[42].identityVerified = false),
    (p) => (p.evidence.entries.traits[42].id = 43),
    (p) => (p.evidence.entries.traits[42].values.facts = []),
    (p) => (p.evidence.entries.traits[42].values.tier = 9),
    (p) => (p.evidence.entries.traits[42].evidence.tier = ""),
    (p) => (p.evidence.entries.traits[42].url = "https://web.archive.org/old"),
    (p) =>
      (p.reviews.rules = [
        {
          kind: "traits",
          id: 42,
          field: "tier",
          apiValue: 2,
          wikiValue: 3,
          revision: 999,
          reason: "旧审定",
        },
      ]),
  ]) {
    const { input, policy } = fixture();
    mutate(policy);
    assert.throws(() => reconcileStructure(input, policy));
  }
});

test("多ID文章、重复字段、未知字段不推断；错误身份和历史文章不接入", () => {
  const body =
    row("Tier", "Grandmaster") +
    row("Type", "Major") +
    row("Training order", "2");
  assert.deepEqual(parseWikiStructure(page(body, [42, 43]), context), {
    skipped: "multiple-game-ids",
  });
  const result = parseWikiStructure(
    page(body + row("Tier", "Master")),
    context,
  );
  assert.deepEqual(result.values, { slot: "Major" });
  assert.throws(
    () => parseWikiStructure(page(body, [43]), context),
    /identity/,
  );
  assert.throws(
    () => parseWikiStructure(page(body), { ...context, revision: 124 }),
    /revision/,
  );
  assert.throws(
    () =>
      parseWikiStructure(page(body), { ...context, title: "Example/history" }),
    /current Wiki/,
  );
});

test("技能结构使用明确槽位及职业，不把模式效果或技能链链接当作基础结构", () => {
  const html = page(
    row(
      "Profession",
      '<a title="Mesmer"><img></a><a title="Mesmer">Mesmer</a><small><a title="Thief">Thief</a></small>',
    ) +
      row("Slot", "Healing") +
      row("Sequence", '<a href="/wiki/Other">Other</a>') +
      row("Attunement", "Fire and Water"),
    [42],
    "skill",
  );
  const result = parseWikiStructure(html, { ...context, kind: "skills" });
  assert.deepEqual(result.values, {
    professions: ["Mesmer"],
    slot: "Heal",
    type: "Heal",
  });
});

test("修正不能破坏父特性线归属或引入不存在的词条ID", () => {
  const { input, policy } = fixture();
  input.specs[0].id = 2;
  assert.ok(
    reconcileStructure(input, policy).audit.conflicts.includes(
      "specs/2/major_traits/42",
    ),
  );
  input.statChoices.equipment = [999];
  assert.throws(() => reconcileStructure(input, policy), /stat choice/);
  input.statChoices.equipment = [7];
  input.traits.push({ ...input.traits[0] });
  assert.throws(() => reconcileStructure(input, policy), /duplicate API/);
});

test("特性位置冲突被拦截，精英武器训练的tier0不强塞入三个次要槽", () => {
  const { input, policy } = fixture();
  input.specs[0].elite = true;
  input.traits.push({ id: 43, tier: 0, slot: "Minor", specialization: 1 });
  assert.equal(reconcileStructure(input, policy).audit.conflicts.length, 0);
  input.traits.push({ ...input.traits[0], id: 44 });
  input.specs[0].major_traits.push(44);
  assert.ok(
    reconcileStructure(input, policy).audit.conflicts.includes(
      "specs/1/major_traits/44/position",
    ),
  );
  input.traits[1].tier = 1;
  assert.ok(
    reconcileStructure(input, policy).audit.conflicts.includes(
      "traits/43/parent",
    ),
  );
});

test("有争议或来源失效时磁盘上的有效快照保持原样", async () => {
  const dir = await mkdtemp(join(tmpdir(), "p12-sources-"));
  try {
    const file = join(dir, "catalog.json");
    await writeFile(file, "ORIGINAL");
    const { input, policy } = fixture();
    input.traits[0].tier = 2;
    await assert.rejects(
      () =>
        writeSourcedSnapshot(file, input, "catalog", {
          policy,
          auditDirectory: join(dir, "audit"),
        }),
      /existing/,
    );
    assert.equal(await readFile(file, "utf8"), "ORIGINAL");
    assert.equal(
      JSON.parse(await readFile(join(dir, "audit", "catalog.json"), "utf8"))
        .summary.conflicts,
      1,
    );
    policy.revisions.traits[42].revision++;
    await assert.rejects(
      () =>
        writeSourcedSnapshot(file, input, "catalog", {
          policy,
          auditDirectory: join(dir, "audit"),
        }),
      /Stale/,
    );
    assert.equal(await readFile(file, "utf8"), "ORIGINAL");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("当前三份快照可离线复核；不把API原始facts或全部武器实体标为Wiki已验证", async () => {
  const policy = await loadSourcePolicy();
  const json = async (path) => JSON.parse(await readFile(path, "utf8"));
  for (const [dataset, path] of [
    ["catalog", "public/catalog.json"],
    ["weapons", "public/weapon-skills.json"],
    ["attributes", "public/attribute-data.json"],
  ]) {
    const input = await json(path);
    const result = reconcileStructure(input, { ...policy, dataset });
    assert.equal(result.audit.conflicts.length, 0);
    assert.deepEqual(result.output, input);
    if (dataset === "weapons")
      assert.ok(result.audit.summary.apiOnlyEntities > 1000);
  }
});
