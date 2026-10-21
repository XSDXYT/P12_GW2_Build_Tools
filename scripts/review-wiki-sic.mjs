// Explicit editorial review of the original 27 annotations, not an automatic
// interpretation of arbitrary future Wiki notes. Source revisions are pinned.
import { readFile, writeFile } from "node:fs/promises";
import { load } from "cheerio";
const root = new URL("../", import.meta.url);
const baseline = JSON.parse(
  await readFile(new URL("data/wiki-research-baseline.json", root), "utf8"),
);
const normalized = (s) => s.replace(/\s+/g, " ").trim();
const stages = (values) =>
  values.map((v, i) => ({
    label: `怒气等级 ${i + 1} · 蔑视伤害`,
    detail: String(v),
  }));
const expected = {
  1876: '"condition" should be capitalized',
  12542: "Missing period.",
  14387: "Depends on Level, Level 1: 100, Level 2: 150, Level 3: 200",
  14404: "Missing period.",
  14414: "Depends on Level, Level 1: 125, Level 2: 225, Level 3: 325",
  14443: "Depends on Level, Level 1: 100, Level 2: 150, Level 3: 200",
  28231: "Missing period.",
  29666: "Missing period.",
  29852: "Unused skill fact",
  30105: "200 or 300 in melee",
  30343: "300",
  40601: "Depends on Level, Level 1: 100, Level 2: 150, Level 3: 200",
  41110: "Depends on Level, Level 1: 125, Level 2: 225, Level 3: 325",
  41746: "Depends on Level, Level 1: 100, Level 2: 150, Level 3: 200",
  46335: "150 for knockback and 232 for launch",
  55029: "Missing period.",
  56873: "50",
  56928: "Recharge Reduced per Clone",
  62561: "400 on target, 150 versus others",
  62603: "approx. 300",
  62965: "Missing period.",
  63275: "150 per pull up to 450",
  76782: "unnecessary space before numbers",
  76808: "knockdown is applied to self",
  77079: "maximum 200",
  77255: "launch is applied to self",
};
const replacements = {
  14387: stages([100, 150, 200]),
  14414: stages([125, 225, 325]),
  14443: stages([100, 150, 200]),
  40601: stages([100, 150, 200]),
  41110: stages([125, 225, 325]),
  41746: stages([100, 150, 200]),
  30105: [{ label: "蔑视伤害", detail: "200；近战范围内 300" }],
  30343: [{ label: "蔑视伤害", detail: "300" }],
  46335: [{ label: "蔑视伤害", detail: "击退 150；击飞 232" }],
  56873: [{ label: "蔑视伤害", detail: "50（每个粉碎）" }],
  62561: [{ label: "蔑视伤害", detail: "主目标 400；其他目标 150" }],
  62603: [{ label: "移动距离", detail: "约 300" }],
  63275: [{ label: "蔑视伤害", detail: "每次拉拽 150，最多 450" }],
  77079: [{ label: "蔑视伤害", detail: "最多 200" }],
};
const entries = { traits: {}, skills: {} };
for (const e of baseline.sic) {
  const html = await readFile(
    new URL(`data/wiki-cache/${e.kind}-${e.id}.html`, root),
    "utf8",
  );
  const $ = load(html);
  const q = $(".infobox").first().nextAll("blockquote").first();
  const nodes = q
    .find("dd")
    .toArray()
    .filter((n) => !$(n).find("dd").length)
    .map((n) => $(n).clone())
    .filter((n) => {
      n.find(
        '.gamemode:not(.pve),[style*="display:none"],[style*="display: none"]',
      ).remove();
      return normalized(n.text()) === e.text;
    });
  if (nodes.length !== 1) throw Error(`Review row not uniquely found: ${e.id}`);
  const notes = nodes[0]
    .find("#sic [title],.sic [title]")
    .toArray()
    .map((n) => $(n).attr("title"))
    .filter((s) => s !== "wikipedia:sic");
  if (notes.length !== 1 || notes[0] !== expected[e.id])
    throw Error(`Review note changed: ${e.id}: ${notes}`);
  const revision = Number(html.match(/"wgRevisionId":(\d+)/)?.[1]);
  if (revision !== e.revision) throw Error(`Review revision changed: ${e.id}`);
  let action = "allow",
    rows;
  if ([29852, 76808, 77255].includes(e.id)) action = "omit";
  else if (replacements[e.id]) {
    action = "replace";
    rows = replacements[e.id];
  } else if (e.text.includes("Unblockable")) {
    action = "replace";
    const count = e.text.match(/^(\d+) /)?.[1];
    const duration = e.text.match(/\(([\d.]+)s\)/)[1];
    rows = [
      {
        label: count ? "无法格挡" : "每次近战命中 · 无法格挡",
        detail: `${duration} 秒${count ? ` · ${count} 次攻击` : ""}`,
      },
    ];
  }
  const page = (entries[e.kind][e.id] ??= { revision, rows: [] });
  page.rows.push({ text: e.text, notes, action, ...(rows ? { rows } : {}) });
}
// New annotations discovered on the linked skill pages. Charge's note also
// explicitly corrects its unannotated knockdown row in this same revision.
Object.assign(entries.skills, {
  35304: {
    revision: 3069393,
    rows: [
      {
        text: "Defiance Break: 232[sic]",
        notes: ["332"],
        action: "replace",
        rows: [{ label: "蔑视伤害", detail: "332" }],
      },
    ],
  },
  5721: {
    revision: 3021145,
    rows: [
      {
        text: "Defiance Break: 400[sic]",
        notes: ["300, 350-400 with 1-2 Water Arrow stacks"],
        action: "replace",
        rows: [{ label: "蔑视伤害", detail: "300；1–2 层水箭时 350–400" }],
      },
    ],
  },
  10647: {
    revision: 2812692,
    rows: [
      {
        text: "Defiance Break: 332[sic]",
        notes: [
          "The Defiance Break sums up 232 from launch and 100 from knockdown while the actual knockdown duration is 2 seconds and thus deals 200 defiance bar damage.",
        ],
        action: "replace",
        rows: [{ label: "蔑视伤害", detail: "每次击飞 232；击倒 200" }],
      },
      {
        text: "Knockdown: 1 second",
        notes: [],
        action: "replace",
        evidence: "Notes: Actual knockdown duration is 2 seconds.",
        rows: [{ label: "击倒", detail: "2 秒" }],
      },
    ],
  },
});
await writeFile(
  new URL("data/wiki-reviews.json", root),
  JSON.stringify({ schema: 1, entries }, null, 2) + "\n",
  "utf8",
);
console.log(
  `Reviewed ${Object.values(entries)
    .flatMap((v) => Object.values(v))
    .reduce(
      (s, p) => s + p.rows.length,
      0,
    )} rows across ${Object.values(entries).reduce((s, v) => s + Object.keys(v).length, 0)} pages (${baseline.sic.length} original annotations).`,
);
