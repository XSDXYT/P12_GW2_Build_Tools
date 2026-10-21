import test from "node:test";
import assert from "node:assert/strict";
import { parseWikiPage, createWikiSnapshot } from "./wiki-details.mjs";
import { attachWikiBranches } from "./wiki-branches.mjs";
import { rechargeTableRows, attachTraitModifiers } from "./wiki-trait-modifiers.mjs";

test("冷却对照只读取当前 PvE 或共用行，排除竞争模式、历史和额外条件", () => {
  const table=rows=>`<table><tr><th></th><th>Skill</th><th>Traited recharge</th></tr>${rows}</table>`;
  const row=(title,text)=>`<tr><td><a href="/wiki/${title}">${title}</a>${text}</td><td>30 → 24</td></tr>`;
  const html=`<div class="mw-parser-output">${table(row('Shared','')+row('Competitive',' (PvP, WvW)')+row('PvE',' (PvE, PvP)')+row('Conditional',' (while moving)'))}<h2><span id="Version_history">History</span></h2>${table(row('Old',''))}</div>`;
  assert.deepEqual(rechargeTableRows(html).map(r=>r.title),['Shared','PvE']);
});

test("数值修正绑定来源版本、证据与目标基础行，不从不一致的冷却表发布数值", async () => {
  const html='<script>{"wgRevisionId":12345}</script><div class="mw-parser-output"><div class="infobox trait"></div><blockquote>Recharge Reduced: 20%</blockquote><table><tr><th>Skill</th><th>Traited recharge</th></tr><tr><td><a href="/wiki/Example_Skill">Skill</a></td><td>30 → 24</td></tr></table></div>';
  const make=()=>({
    snapshot:{entries:{traits:{42:{title:'Example_Trait',profession:'Mesmer',revision:12345,identityVerified:true,rows:[]}},skills:{7:{title:'Example_Skill',profession:'Mesmer',revision:54321,identityVerified:true,rows:[{label:'冷却时间',detail:'30 秒'}]}}}},
    catalog:{traits:[{id:42,name:'特性',specialization:1}],specs:[{id:1,profession:'Mesmer'}]},
    readHtml:async()=>html,
    config:{professions:['Mesmer'],rules:[{id:'extra',trait:42,revision:12345,evidence:'Recharge Reduced: 20%',targets:[{kind:'skills',id:7,revision:54321,guards:[{label:'冷却时间',detail:'30 秒'}]}],changes:[{type:'append',row:{label:'额外效果',detail:'1 秒'}}]}]},
  });
  const p=make();const audit=await attachTraitModifiers(p);
  assert.equal(p.snapshot.entries.skills[7].modifiers.length,2);
  assert.equal(audit.rules[0].trait,42);
  const stale=make();stale.config.rules[0].revision=999;
  await assert.rejects(()=>attachTraitModifiers(stale),/source revision/);
  const changed=make();changed.config.rules[0].evidence='Not present';
  await assert.rejects(()=>attachTraitModifiers(changed),/evidence changed/);
  const target=make();target.config.rules[0].targets[0].revision=999;
  await assert.rejects(()=>attachTraitModifiers(target),/target revision/);
  const incompatible=make();incompatible.snapshot.entries.skills[7].rows[0].detail='40 秒';incompatible.config.rules=[];
  const skipped=await attachTraitModifiers(incompatible);
  assert.equal(skipped.rules.length,0);assert.equal(skipped.skipped.length,1);
});

const context = {
  kind: "trait",
  id: 42,
  english: { name: "Example", facts: [] },
  chinese: { name: "测试特性", facts: [] },
  names: [],
};
const page = (rows, extra = "") =>
  `<script>RLCONF={"wgRevisionId":12345}</script><div class="mw-parser-output"><div class="infobox trait"><span class="gamelink" data-type="trait" data-id="42"></span></div><blockquote><dl>${rows}</dl></blockquote>${extra}</div>`;

test("Wiki 按显式模式筛选，先出现 WvW 也不会覆盖 PvE 治疗公式", () => {
  const rows = `<dd><div class="gamemode wvw">No-Clone Heal: 219 (0.46)<sup><abbr title="219 + 0.46 * Healing Power">?</abbr></sup></div><div class="gamemode pve">No-Clone Heal: 219 (0.77)<sup><abbr title="219 + 0.77 * Healing Power">?</abbr></sup></div><div class="gamemode pvp">No-Clone Heal: 219 (0.3)<sup><abbr title="219 + 0.3 * Healing Power">?</abbr></sup></div></dd>`;
  const result = parseWikiPage(page(rows), context);
  assert.deepEqual(result.rows, [
    {
      label: "无分身治疗",
      detail: "219 + 0.77 × 治疗效果",
      healing: { base: 219, coefficient: 0.77 },
    },
  ]);
  assert.equal(result.revision, 12345);
});

test("Wiki 只读当前详情，不把历史、其他技能或非 PvE 父层的效果带入", () => {
  const html = page(
    '<div class="gamemode pvp wvw"><dd>Radius: 9999</dd></div><dd>Radius: 360</dd>',
    "<h2>History</h2><blockquote><dl><dd>Radius: 8000</dd></dl></blockquote>",
  );
  assert.deepEqual(parseWikiPage(html, context).rows, [
    { label: "半径", detail: "360" },
  ]);
});

test("Wiki 相同增益保留个人和幻影对象，并正确读取可见分数而非隐藏排序数字", () => {
  const html = page(
    '<dd>Personal Quickness (1<span style="display:none">0.5</span><big>½</big>s): Skills and actions are faster.</dd><dd>Phantasm Quickness (3s): Skills and actions are faster.</dd>',
  );
  assert.deepEqual(parseWikiPage(html, context).rows, [
    { label: "个人急速", detail: "1.5 秒" },
    { label: "幻影急速", detail: "3 秒" },
  ]);
});

test("Wiki 伤害显示系数与命中数，不将示例伤害当成当前配装伤害", () => {
  const html = page(
    '<dd>2 Illusions (2x): 490 (1.84)<sup><abbr title="(weapon strength) * 1.84 * Power / (target armor)">?</abbr></sup></dd>',
  );
  assert.deepEqual(parseWikiPage(html, context).rows, [
    { label: "2 个幻象伤害", detail: "系数 ×1.84 · 2 次命中" },
  ]);
});

test("Wiki 游戏 ID 不匹配、缺少版本或当前详情时拒绝生成", () => {
  assert.throws(
    () =>
      parseWikiPage(
        page("<dd>Radius: 360</dd>").replace('data-id="42"', 'data-id="43"'),
        context,
      ),
    /identity mismatch/,
  );
  assert.throws(
    () =>
      parseWikiPage(
        page("").replace('"wgRevisionId":12345', '"wgRevisionId":0'),
        context,
      ),
    /Missing revision/,
  );
  assert.throws(
    () => parseWikiPage(page("").replaceAll("blockquote", "section"), context),
    /Missing current tooltip/,
  );
});

test("Wiki 非属性效果按名称翻译，无法可靠表达的内容留在诊断而不混入浮层", () => {
  const parsed = parseWikiPage(
    page(
      "<dd>Reflect Missiles</dd><dd>Unknown Conditional Branch: 9999</dd><dd>5Might (8s): +150 Power</dd>",
    ),
    context,
  );
  assert.deepEqual(parsed.rows, [
    { label: "反射投射物", detail: "" },
    { label: "威能", detail: "8 秒 · 5 层", stacks: 5 },
  ]);
  assert.deepEqual(parsed.skipped, ["Unknown Conditional Branch: 9999"]);
});

test("Wiki 士气分组和自定义效果充能保留上下文，不读取症状示例伤害作为阈值", () => {
  const html = page(
    '<dd>4-6 Motivation: Heals for more.</dd><dd>Healing: 975 (0.3)<sup><abbr title="975 + 0.3 * Healing Power">?</abbr></sup></dd>',
  );
  assert.ok(
    parseWikiPage(html, context).rows.some(
      (r) =>
        r.label === "4-6 层士气 · 治疗" && r.detail === "975 + 0.3 × 治疗效果",
    ),
  );
  const result = parseWikiPage(
    page(
      "<dd><sub>6</sub> Photon Forge Overheated (4s): Your next attack sets the target on fire.</dd><dd><sub>3</sub> Stack Threshold: 393 Damage</dd>",
    ),
    context,
  );
  assert.deepEqual(result.rows, [
    { label: "光子熔炉过热", detail: "4 秒 · 6 层", stacks: 6 },
    { label: "层数阈值", detail: "3 层" },
  ]);
});

test("Wiki 所需增益展示名称，不把示例威能属性当奖励", () => {
  const result = parseWikiPage(
    page(
      '<dd>Required Boon: <a href="/wiki/Might">30 Condition Damage, 30 Power</a></dd>',
    ),
    context,
  );
  assert.deepEqual(result.rows, [{ label: "所需增益", detail: "威能" }]);
});

test("Wiki 症状百分比不携带默认伤害样例，虹吸伤害采用威力公式", () => {
  const result = parseWikiPage(
    page(
      '<dd>Poison (8s): 536 Damage, -33% Heal Effectiveness</dd><dd>Life Siphon Damage: 129 (0.0666)<sup><abbr title="129 + 0.0666 * Power">?</abbr></sup></dd>',
    ),
    {
      ...context,
      english: {
        name: "Example",
        facts: [{ text: "Life Siphon Damage", type: "Number" }],
      },
      chinese: {
        name: "测试特性",
        facts: [{ text: "虹吸伤害", type: "Number" }],
      },
    },
  );
  assert.deepEqual(result.rows, [
    { label: "中毒", detail: "8 秒 · -33% 治疗效能" },
    { label: "虹吸伤害", detail: "129 + 0.0666 × 威力" },
  ]);
});

test("Wiki 页头资源按 PvE 分支读取，维持消耗不冒充冷却秒数", () => {
  const html = page("")
    .replace("infobox trait", "infobox skill")
    .replace('data-type="trait"', 'data-type="skill"')
    .replace(
      "<blockquote>",
      '<blockquote><div class="statistics">5 <a href="/wiki/Energy">能量图标</a><span class="gamemode wvw">-9 <a href="/wiki/Energy#Upkeep">维持图标</a></span><span class="gamemode pve">-6 <a href="/wiki/Energy#Upkeep">维持图标</a></span>30 <a href="/wiki/Recharge">冷却图标</a></div>',
    );
  const result = parseWikiPage(html, {
    ...context,
    kind: "skill",
    english: { name: "Example", facts: [{ type: "Recharge", value: 20 }] },
  });
  assert.ok(
    result.rows.some((r) => r.label === "能量消耗" && r.detail === "5"),
  );
  assert.ok(
    result.rows.some((r) => r.label === "能量维持消耗" && r.detail === "-6"),
  );
  assert.ok(
    result.crossChecks.some(
      (c) =>
        c.label === "Recharge" &&
        c.status === "differs-wiki-wins" &&
        c.wiki === 30,
    ),
  );
});

test("Wiki 页面更新后必须重新核对绑定旧版本的中文语义修正", async () => {
  const catalog = {
    specs: [{ id: 1, profession: "Mesmer" }],
    traits: [{ id: 42, name: "测试特性", specialization: 1, facts: [] }],
    skills: [],
  };
  const manifest = {
    entries: {
      traits: { 42: { name: "Example", title: "Example", facts: [] } },
      skills: {},
    },
  };
  const descriptionCorrections = {
    entries: {
      traits: { 42: { revision: 12344, description: "已核实的中文说明。" } },
    },
  };
  const params = {
    catalog,
    manifest,
    descriptionCorrections,
    readHtml: async () => page("<dd>Radius: 360</dd>"),
  };
  await assert.rejects(
    () => createWikiSnapshot(params),
    /Review Chinese Wiki description/,
  );
  descriptionCorrections.entries.traits[42].revision = 12345;
  const result = await createWikiSnapshot(params);
  assert.equal(result.entries.traits[42].description, "已核实的中文说明。");
});

test("Wiki 明确标注 sic 的争议数值保留审计，不丢弃注记后冒充可靠数值", () => {
  const result = parseWikiPage(
    page('<dd>Range: 450<span id="sic">[sic]</span></dd><dd>Radius: 240</dd>'),
    context,
  );
  assert.deepEqual(result.rows, [{ label: "半径", detail: "240" }]);
  assert.equal(result.withheld.length, 1);
  assert.match(result.withheld[0].text, /450/);
});

test("Wiki 与 API 不同或 API 混有多值时，展示仍取明确 Wiki PvE 值", () => {
  const result = parseWikiPage(
    page(
      '<dd>Radius: 360</dd><dd><div class="gamemode pve">Fury (8s): +25% Critical Chance</div></dd>',
    ),
    {
      ...context,
      english: {
        name: "Example",
        facts: [
          { type: "Distance", text: "Radius", distance: 240 },
          { type: "Buff", status: "Fury", duration: 4 },
          { type: "Buff", status: "Fury", duration: 8 },
        ],
      },
    },
  );
  assert.equal(result.rows[0].detail, "360");
  assert.equal(
    result.crossChecks.find((c) => c.label === "Radius").status,
    "differs-wiki-wins",
  );
  assert.equal(
    result.crossChecks.find((c) => c.label === "Fury").status,
    "mixed-includes-wiki",
  );
});

test("sic 复核同时绑定版本、原行和注记，已复核替换与排除均保留审计", () => {
  const html = page(
    '<dd>Defiance Break: 500<span id="sic"><span title="maximum 200">[sic]</span></span></dd><dd>Range: 450<span id="sic"><span title="Unused skill fact">[sic]</span></span></dd>',
  );
  const review = {
    revision: 12345,
    rows: [
      {
        text: "Defiance Break: 500[sic]",
        notes: ["maximum 200"],
        action: "replace",
        rows: [{ label: "蔑视伤害", detail: "最多 200" }],
      },
      { text: "Range: 450[sic]", notes: ["Unused skill fact"], action: "omit" },
    ],
  };
  const result = parseWikiPage(html, { ...context, review });
  assert.deepEqual(result.rows, [{ label: "蔑视伤害", detail: "最多 200" }]);
  assert.equal(result.withheld.length, 0);
  assert.equal(result.reviewedRows.length, 2);
  assert.throws(
    () =>
      parseWikiPage(html, {
        ...context,
        review: { ...review, revision: 12344 },
      }),
    /new revision/,
  );
  assert.throws(
    () =>
      parseWikiPage(html.replace("maximum 200", "maximum 300"), {
        ...context,
        review,
      }),
    /annotation changed/,
  );
  assert.throws(
    () =>
      parseWikiPage(html.replace("500<span", "501<span"), {
        ...context,
        review,
      }),
    /row missing/,
  );
});

test("sic 拼写复核恢复治疗公式，不影响其他未复核行的暂存保护", () => {
  const html = page(
    '<dd>Healing: 961 (0.1)<sup><abbr title="961 + 0.1 * Healing Power">?</abbr></sup><span id="sic"><span title="Spelling">[sic]</span></span></dd><dd>Range: 450<span id="sic">[sic]</span></dd>',
  );
  const result = parseWikiPage(html, {
    ...context,
    review: {
      revision: 12345,
      rows: [
        {
          text: "Healing: 961 (0.1)?[sic]",
          notes: ["Spelling"],
          action: "allow",
        },
      ],
    },
  });
  assert.deepEqual(result.rows[0].healing, { base: 961, coefficient: 0.1 });
  assert.equal(result.withheld.length, 1);
});

test("关联分支独立保存事实与来源，父页和子页版本或 ID 变化拒绝发布", async () => {
  const html = page("<dd>Radius: 360</dd>")
    .replace("infobox trait", "infobox skill")
    .replace('data-type="trait"', 'data-type="skill"');
  const make = () => ({
    snapshot: {
      entries: {
        skills: {
          1: {
            identityVerified: true,
            revision: 12345,
            rows: [{ label: "半径", detail: "120" }],
          },
        },
      },
    },
    manifest: { entries: { skills: { 1: { title: "Parent" } } } },
    config: {
      parents: {
        1: {
          profession: "Ranger",
          revision: 12345,
          sources: [{ title: "Parent", revision: 12345 }],
          branches: [{ title: "Child", id: 42, context: "天界化身形态" }],
        },
      },
      pages: { Child: { id: 42, revision: 12345 } },
      issues: [],
    },
    api: {
      en: { 42: { name: "Child", facts: [] } },
      zh: { 42: { name: "子技能", facts: [] } },
    },
    readArticle: async () => html,
  });
  const params = make();
  const audit = await attachWikiBranches(params);
  assert.deepEqual(params.snapshot.entries.skills[1].rows, [
    { label: "半径", detail: "120" },
  ]);
  assert.deepEqual(params.snapshot.entries.skills[1].branches[0], {
    id: 42,
    title: "Child",
    revision: 12345,
    label: "天界化身形态 · 子技能",
    rows: [{ label: "半径", detail: "360" }],
  });
  assert.equal(audit.pages.Child.id, 42);
  const stale = make();
  stale.config.parents[1].revision = 999;
  await assert.rejects(() => attachWikiBranches(stale), /parent revision/);
  const mismatch = make();
  mismatch.readArticle = async () =>
    html.replace('data-id="42"', 'data-id="43"');
  await assert.rejects(() => attachWikiBranches(mismatch), /identity mismatch/);
  const source = make();
  source.config.parents[1].sources[0].revision = 999;
  await assert.rejects(() => attachWikiBranches(source), /index revision/);
});

test("祭祀和精魂分组保留攻击对象，原始伤害行也保留多次命中", () => {
  const html = page(
    '<dd>Ritualist Attack</dd><dd>Damage: 10 (1.0)<sup><abbr title="(weapon strength) * Power">?</abbr></sup></dd>',
  ).replace(
    "</blockquote>",
    '<dl><dd>Wanderlust Attack</dd><dd>Damage (4x): 10 (0.72)<sup><abbr title="(weapon strength) * Power">?</abbr></sup></dd></dl></blockquote>',
  );
  const result = parseWikiPage(html, context);
  assert.ok(
    result.rows.some(
      (r) => r.label === "祭祀攻击 · 伤害" && r.detail === "系数 ×1.0",
    ),
  );
  assert.ok(
    result.rows.some(
      (r) =>
        r.label === "流浪灵攻击 · 伤害" && r.detail === "系数 ×0.72 · 4 次命中",
    ),
  );
  const summon = page("<dd>Damage (4x): 500</dd>").replace(
    "<dl>",
    '<p><a href="/wiki/Anguish">Anguish</a></p><dl>',
  );
  assert.deepEqual(
    parseWikiPage(summon, {
      ...context,
      english: { name: "Summon Spirits", facts: [] },
    }).rows,
    [{ label: "苦痛灵 · 伤害", detail: "500 · 4 次命中" }],
  );
});
