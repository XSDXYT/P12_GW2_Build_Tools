import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url),
  file = (p) => new URL(p, root);
const report = JSON.parse(
  await readFile(file("data/wiki-identity-research.json"), "utf8"),
);
const entries = Object.entries(report.entries);
for (const [, entry] of entries) {
  if (entry.status === "exact-id-verified") {
    entry.conclusion =
      "Wiki 实际链接指向独立版本，页面含精确游戏 ID，已接入详情。";
    continue;
  }
  if (entry.candidates.every((c) => !c.revision)) {
    entry.classification = "page-unavailable";
    entry.conclusion =
      "原技能页为 404；当前特长与职业索引未找到精确 ID 页面。不能据此断言技能已退役。";
  } else if (
    entry.candidates.some(
      (c) => c.canonical === "Hall_of_Chains_(achievements)",
    )
  ) {
    entry.classification = "unrelated-redirect";
    entry.conclusion =
      "同名文章重定向至成就页，不能用于技能数值。当前索引无精确 ID 证据。";
  } else {
    entry.classification = "unlisted-id";
    entry.conclusion =
      "已检索实际索引与同名分支，但 Wiki 只列其他游戏 ID；施放、效果、水下或历史 ID 的等价关系仍无明确证据。";
  }
}
await writeFile(
  file("data/wiki-identity-research.json"),
  JSON.stringify(report, null, 2) + "\n",
  "utf8",
);
const verified = entries.filter(([, e]) => e.status === "exact-id-verified");
const remaining = entries.filter(([, e]) => e.status !== "exact-id-verified");
const lines = [
  "# Wiki 技能身份与注记复核（2026-10-21）",
  "",
  `原始 53 项均已逐项核查：${verified.length} 项通过精确 ID 校验并接入，${remaining.length} 项仍缺少可确认的 Wiki 身份证据。不是按同名合并，也不回退 API 数值。`,
  "",
  "## 已确认的差异",
  "",
  "- 游侠 25 项：宠物、武器等同名页与魂兽合体技能页分开；从 Soulbeast/职业技能索引找到独立页面并校验 ID。",
  "- 工程师 3 项 Locked：明确属于融合师锁定状态，页面列出 76790、77107、77388；不是通用 Locked 页面。",
  "",
  "## 尚无身份依据的 25 项",
  "",
  "| 职业 | 游戏 ID / 中文名称 | 核查结论 | Wiki 页面所列 ID |",
  "| --- | --- | --- | --- |",
  ...remaining.map(
    ([id, e]) =>
      `| ${e.profession} | ${id} ${e.name} | ${e.conclusion} | ${[...new Set(e.candidates.flatMap((c) => c.ids))].join("、") || "无技能 ID"} |`,
  ),
  "",
  "逐页标题、版本、所查索引及候选页保存在 [wiki-identity-research.json](../data/wiki-identity-research.json)。原始清单固定于 [wiki-research-baseline.json](../data/wiki-research-baseline.json)，以后重建不会让已解决项从本轮审计中消失。",
  "",
  "## 原始 27 行 sic 注记",
  "",
  "26 页共 27 行全部完成显式复核：3 行仅拼写/排版，7 行无法格挡效果按次数和持续时间恢复，14 行按注记纠正数值或条件，3 行确认排除。",
  "",
  "- 无法格挡用“次攻击”，不冒充增益层数。",
  "- 撼地重击/旋风打击按怒气 1/2/3 档为 100/150/200；碎颅为 125/225/325。",
  "- 头槌重击 300；如来神掌主目标 400、其他目标 150；暗影疾风击退 150、击飞 232。",
  "- 时间沉降每次粉碎的晕眩 50；影幕每次拉拽 150、最多 450；迷神手鼓最多 200；“严寒刺骨！”普通 200、近战 300。",
  "- 流动决心保留“约 300”，不标成精确距离。",
  "- 分裂弧斩未使用射程字段、审讯团传送装备自身击倒、斯克鼠乱斗自身击飞均排除。",
  "- 复核数据绑定 revision、原行与注记；页面更新或内容变化后必须重审。新 sic 仍暂存审计，不自动套用这些结论。",
  "",
  "注记与决定见 [wiki-reviews.json](../data/wiki-reviews.json)，不会进入普通详情浮层。",
  "新采集的分支还复核了 Dust Charge（35304，蔑视伤害 332）、Deep Freeze（5721，基础 300，1–2 层水箭时 350–400）和血肉魔像 Charge（10647，每次击飞 232、击倒 200，实际击倒 2 秒）。这 3 行 sic 和 1 行未标注的错误时长同样绑定各自页面版本。",
  "",
  "## 关联分支范围",
  "",
  "雕文协调/天界化身分支、形态技能、召唤武器与工程工具包、唤灵仆从指令使用当前 Wiki 实际技能表或技能链链接。每个子页独立校验游戏 ID 与 revision，中文名称来自对应 ID 的中文 API，事实数值以 Wiki PvE 为准。父技能与子技能分组展示，不将子技能效果累计到父技能，也不新增保存字段。",
  "当前覆盖 41 个父技能的 204 个关联分支、192 个独立子页。相同技能在陆地和水下分别关联时保留两个上下文；特性替代技能按所需特性显示。祭祀本人、苦痛灵、流浪灵和庇护灵的攻击分别标注。当前主页面及子页面的未翻译、未复核行均为零。",
  "",
  "本轮不等于完整宠物 AI、召唤物属性缩放或所有翻转技能模拟；不会根据 API 的历史 transform 列表给当前瘟疫之地添加旧变身技能。",
];
await writeFile(file("docs/WIKI_REVIEW.md"), lines.join("\n") + "\n", "utf8");
console.log(
  `${verified.length} verified, ${remaining.length} documented unresolved identities`,
);
