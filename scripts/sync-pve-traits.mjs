// Reads public game parameters only. Does not execute, vendor, or redistribute
// reference-source programs, authored descriptions, or tooltip implementations.
import ts from "typescript";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const commit = "85bdcbd9bc64a6299242bce740d6a42d9da5f210";
const base = `https://raw.githubusercontent.com/Kadenar/gw2-combat-simulator/${commit}/`;
const repository = "https://github.com/Kadenar/gw2-combat-simulator";
const catalog = JSON.parse(await readFile("public/catalog.json", "utf8"));
const professions = catalog.professions.map((p) => p.id.toLowerCase());
const known = new Set(catalog.traits.map((t) => t.id));
async function get(path) {
  const response = await fetch(base + path, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error(`${response.status} ${path}`);
  return response.text();
}
async function batches(values, run) {
  const out = [];
  for (let i = 0; i < values.length; i += 8)
    out.push(...(await Promise.all(values.slice(i, i + 8).map(run))));
  return out;
}
const treeResponse = await fetch(
  `https://api.github.com/repos/Kadenar/gw2-combat-simulator/git/trees/${commit}?recursive=1`,
);
if (!treeResponse.ok) throw Error(`Source tree: ${treeResponse.status}`);
const tree = await treeResponse.json();
if (tree.truncated || !Array.isArray(tree.tree))
  throw Error("Incomplete source tree");
const paths = tree.tree
  .filter(
    (entry) =>
      entry.type === "blob" &&
      entry.path.endsWith(".ts") &&
      /^js\/games\/gw2\/professions\/[^/]+\/(core\/traits(?:\/|\.ts$)|specializations\/[^/]+\/traits(?:\/|\.ts$)|app\/tooltips\/)/.test(
        entry.path,
      ),
  )
  .map((entry) => entry.path);
const unknown = Symbol("not a literal");
function parse(path, text, imported = {}) {
  const file = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declarations = new Map();
  function collect(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    )
      declarations.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  }
  collect(file);
  const resolving = new Set();
  function value(node) {
    if (!node) return unknown;
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node)
    )
      return value(node.expression);
    if (ts.isPrefixUnaryExpression(node)) {
      const v = value(node.operand);
      return typeof v === "number"
        ? node.operator === ts.SyntaxKind.MinusToken
          ? -v
          : v
        : unknown;
    }
    if (ts.isIdentifier(node)) {
      if (Object.hasOwn(imported, node.text)) return imported[node.text];
      if (!declarations.has(node.text) || resolving.has(node.text))
        return unknown;
      resolving.add(node.text);
      const v = value(declarations.get(node.text));
      resolving.delete(node.text);
      return v;
    }
    if (ts.isPropertyAccessExpression(node)) {
      const object = value(node.expression);
      return object !== unknown && object && typeof object === "object"
        ? (object[node.name.text] ?? unknown)
        : unknown;
    }
    if (ts.isBinaryExpression(node)) {
      const a = value(node.left),
        b = value(node.right);
      if (typeof a !== "number" || typeof b !== "number") return unknown;
      return (
        {
          [ts.SyntaxKind.PlusToken]: () => a + b,
          [ts.SyntaxKind.MinusToken]: () => a - b,
          [ts.SyntaxKind.AsteriskToken]: () => a * b,
          [ts.SyntaxKind.SlashToken]: () => a / b,
        }[node.operatorToken.kind]?.() ?? unknown
      );
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(file);
      if (name === "Object.freeze") return value(node.arguments[0]);
      if (name === "boonKey") return value(node.arguments[0]);
      return unknown;
    }
    if (ts.isArrayLiteralExpression(node)) {
      const entries = node.elements.map(value);
      return entries.some((v) => v === unknown) ? unknown : entries;
    }
    if (ts.isObjectLiteralExpression(node)) {
      const out = {};
      for (const p of node.properties) {
        if (ts.isSpreadAssignment(p)) {
          const v = value(p.expression);
          if (v !== unknown && v && typeof v === "object")
            Object.assign(out, v);
          continue;
        }
        if (!ts.isPropertyAssignment(p)) continue;
        const key = ts.isComputedPropertyName(p.name)
          ? value(p.name.expression)
          : p.name.text;
        const v = value(p.initializer);
        if (key !== unknown && v !== unknown) out[key] = v;
      }
      return out;
    }
    return unknown;
  }
  const property = (node, key) =>
    node && ts.isObjectLiteralExpression(node)
      ? node.properties.find(
          (p) => ts.isPropertyAssignment(p) && p.name.getText(file) === key,
        )?.initializer
      : undefined;
  return { file, value, property, declarations };
}
const constantsPath = "js/games/gw2/platform/constants.ts";
const constants = parse(constantsPath, await get(constantsPath));
const common = Object.fromEntries(
  [...constants.declarations.keys()]
    .map((key) => [key, constants.value(ts.factory.createIdentifier(key))])
    .filter(([, value]) => value !== unknown),
);
// Enum-like public game categories only; no simulator behavior is evaluated.
Object.assign(common, {
  BOON: {
    AEGIS: "Aegis",
    ALACRITY: "Alacrity",
    FURY: "Fury",
    MIGHT: "Might",
    PROTECTION: "Protection",
    QUICKNESS: "Quickness",
    REGENERATION: "Regeneration",
    RESISTANCE: "Resistance",
    RESOLUTION: "Resolution",
    STABILITY: "Stability",
    SWIFTNESS: "Swiftness",
    VIGOR: "Vigor",
  },
  CONDITION: {
    BLEEDING: "Bleeding",
    BURNING: "Burning",
    CONFUSION: "Confusion",
    POISONED: "Poison",
    TORMENT: "Torment",
    BLINDNESS: "Blind",
    CHILLED: "Chilled",
    CRIPPLED: "Crippled",
    FEAR: "Fear",
    IMMOBILIZED: "Immobilized",
    SLOW: "Slow",
    TAUNT: "Taunt",
    VULNERABILITY: "Vulnerability",
    WEAKNESS: "Weakness",
  },
});
const ids = Object.fromEntries(
  await batches(professions, async (profession) => {
    const path = `js/games/gw2/professions/${profession}/data/ids.ts`;
    const parsed = parse(path, await get(path));
    return [
      profession,
      {
        TRAIT: parsed.value(
          ts.factory.createIdentifier(`${profession.toUpperCase()}_TRAIT_IDS`),
        ),
        ID: parsed.value(
          ts.factory.createIdentifier(`${profession.toUpperCase()}_SKILL_IDS`),
        ),
      },
    ];
  }),
);
const documents = await batches(paths, async (path) => [path, await get(path)]);
const profiles = new Map(),
  presentations = new Map();
const attributeNames = {
  Power: "威力",
  Precision: "精准",
  Toughness: "坚韧",
  Vitality: "体力",
  Ferocity: "暴击效果",
  ConditionDamage: "症状伤害",
  HealingPower: "治疗效果",
  Concentration: "增益效果",
  Expertise: "症状效果",
};
const phrases = {
  "Internal cooldown": "内置冷却",
  "Defiant interrupt cooldown": "对藐视目标的打断冷却",
  "Maximum stacks": "最多层数",
  "Stack duration": "叠层持续时间",
  Concentration: "增益效果",
  Expertise: "症状效果",
  Power: "威力",
  Precision: "精准",
  Toughness: "坚韧",
  Vitality: "体力",
  Ferocity: "暴击效果",
  "Condition damage": "症状伤害",
  "Healing power": "治疗效果",
  "Phantasm critical chance": "幻象暴击率加成",
  "Critical chance": "暴击率加成",
  "Critical chance increase": "暴击率加成",
  "Base critical damage": "基础暴击伤害加成",
  "Enhanced critical damage": "满足条件时的暴击伤害加成",
  "Target health threshold": "目标生命值阈值",
  "Ferocity per stack": "每层暴击效果",
  "Recharge reduction": "冷却减少",
  "Sword recharge": "剑技能冷却变化",
  "Mace recharge": "钉锤技能冷却变化",
  "Mace base boon duration": "钉锤基础增益时长增加",
  "Symbol duration increase": "符号时长增加",
  "Strike damage": "直伤加成",
  "Illusion strike damage": "幻术造物直伤加成",
  "Critical chance with alacrity": "拥有敏捷时的暴击率加成",
  "Additional critical chance with fury": "拥有激怒时的额外暴击率",
  "Vitality converted to ferocity": "体力转换为暴击效果",
  "Precision converted to ferocity": "精准转换为暴击效果",
  "Precision converted to expertise": "精准转换为症状效果",
  "Power converted to vitality": "威力转换为体力",
  "Power converted to ferocity": "威力转换为暴击效果",
  "Power converted to condition damage": "威力转换为症状伤害",
  "Vitality converted to condition damage": "体力转换为症状伤害",
  "Power converted to healing power": "威力转换为治疗效果",
  "Toughness converted to condition damage": "坚韧转换为症状伤害",
};
function chinese(label) {
  if (phrases[label]) return phrases[label];
  const wordMap = {
    burning: "燃烧",
    bleeding: "流血",
    confusion: "困惑",
    poison: "中毒",
    torment: "折磨",
    condition: "症状",
    boon: "增益",
    strike: "直伤",
    damage: "伤害",
    critical: "暴击",
    duration: "持续时间",
    bonus: "加成",
    increase: "提高",
    multiplier: "倍率",
    recharge: "冷却变化",
    ferocity: "暴击效果",
    precision: "精准",
    power: "威力",
    vitality: "体力",
    concentration: "增益效果",
    expertise: "症状效果",
    conversion: "转换比例",
    maximum: "最多",
    stacks: "层数",
    stack: "叠层",
    per: "每",
    second: "秒",
    chance: "几率",
    health: "生命值",
    threshold: "阈值",
    base: "基础",
    additional: "额外",
    while: "处于",
    fury: "激怒",
    as: "作为",
    virtuoso: "幻锋",
    phantasm: "幻象",
    illusion: "幻术造物",
    clone: "分身",
    sword: "剑",
    greatsword: "巨剑",
    dagger: "匕首",
    axe: "斧",
    torch: "火炬",
    pistol: "手枪",
    staff: "法杖",
    mace: "钉锤",
    shield: "盾牌",
    rifle: "步枪",
    longbow: "长弓",
    shortbow: "短弓",
    warhorn: "战号",
    hammer: "巨锤",
    spear: "长矛",
    healing: "治疗",
    outgoing: "输出",
    incoming: "受到",
    protection: "保护",
    resolution: "决心",
    regeneration: "再生",
    effectiveness: "效能",
    reduction: "减少",
    reduced: "减少",
    extension: "延长",
    interval: "间隔",
    pulse: "脉冲",
    count: "数量",
    radius: "半径",
    range: "范围",
    cooldown: "冷却",
    target: "目标",
    below: "低于",
    above: "高于",
    disabled: "受控制",
    and: "及",
    or: "或",
    on: "对",
    yourself: "自身",
    allies: "盟友",
    pet: "宠物",
    merged: "融合时",
    shroud: "帷幕",
    berserk: "狂暴",
    mode: "状态",
    reaper: "夺魂者",
    harbinger: "先驱者",
    beastmode: "兽魂融合",
    scourge: "灾厄师",
    shades: "沙影",
    shade: "沙影",
    active: "激活",
    passive: "被动",
  };
  const words = label.toLowerCase().match(/[a-z]+|\d+|[%+]/g) || [];
  if (
    !words.length ||
    words.some((word) => !wordMap[word] && !/^\d+$|^[%+]$/.test(word))
  )
    return null;
  return words.map((word) => wordMap[word] || word).join("");
}
for (const [path, text] of documents) {
  const profession = path.split("/")[4];
  const parsed = parse(path, text, { ...common, ...ids[profession] });
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(parsed.file) === "defineTrait"
    ) {
      const declaration = node.arguments[0];
      const id = parsed.value(parsed.property(declaration, "id"));
      if (typeof id === "number" && known.has(id)) {
        const balance = parsed.value(parsed.property(declaration, "balance"));
        if (balance && balance !== unknown && typeof balance === "object")
          profiles.set(id, { balance, path });
      }
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isComputedPropertyName(node.name) &&
      ts.isCallExpression(node.initializer)
    ) {
      const id = parsed.value(node.name.expression),
        call = node.initializer;
      if (
        typeof id === "number" &&
        known.has(id) &&
        ["traitTooltip", "traitSkillTooltip"].includes(
          call.expression.getText(parsed.file),
        )
      ) {
        const specs =
          call.arguments[
            call.expression.getText(parsed.file) === "traitSkillTooltip" ? 2 : 1
          ];
        const rows = [];
        if (specs && ts.isArrayLiteralExpression(specs))
          for (const tuple of specs.elements) {
            const sameProfile =
              ts.isCallExpression(tuple) &&
              tuple.expression.getText(parsed.file) === "fromProfile" &&
              parsed.value(tuple.arguments[0]) === id;
            const elements = ts.isArrayLiteralExpression(tuple)
              ? tuple.elements
              : sameProfile
                ? tuple.arguments.slice(1)
                : [];
            if (!elements.length) continue;
            const field = parsed.value(elements[0]),
              label = parsed.value(elements[1]);
            const formatter = elements[2]?.getText(parsed.file) || "number";
            if (
              typeof field !== "string" ||
              typeof label !== "string" ||
              ![
                "number",
                "tooltipSeconds",
                "tooltipPercent",
                "tooltipFactorChange",
                "tooltipDecimal",
              ].includes(formatter)
            )
              continue;
            const translated = chinese(label);
            if (translated)
              rows.push({ field, label: translated, format: formatter });
          }
        const qualifier = parsed.value(call.arguments[2]);
        presentations.set(id, {
          rows,
          path,
          qualifier: typeof qualifier === "string" ? qualifier : undefined,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed.file);
}
const statusNames = {
  Aegis: "圣盾",
  Alacrity: "敏捷",
  Fury: "激怒",
  Might: "威能",
  Protection: "保护",
  Quickness: "急速",
  Regeneration: "再生",
  Resistance: "抗性",
  Resolution: "决心",
  Stability: "稳固",
  Swiftness: "迅捷",
  Vigor: "活力",
  Bleeding: "流血",
  Burning: "燃烧",
  Confusion: "困惑",
  Poison: "中毒",
  Torment: "折磨",
  Blind: "目盲",
  Chilled: "冰冻",
  Crippled: "残废",
  Fear: "恐惧",
  Immobilized: "定身",
  Slow: "迟缓",
  Taunt: "嘲讽",
  Vulnerability: "易伤",
  Weakness: "虚弱",
};
const entries = {};
for (const [id, { balance, path }] of profiles) {
  const presentation = presentations.get(id);
  if (!presentation) continue;
  const rows = [];
  for (const field of presentation.rows) {
    const amount = balance[field.field];
    if (typeof amount !== "number" || !Number.isFinite(amount)) continue;
    const format =
      id === 753 && field.field === "durationMultiplier"
        ? "tooltipPercent"
        : field.format;
    rows.push({
      label: field.label,
      amount: Number(
        (format === "tooltipPercent"
          ? amount * 100
          : format === "tooltipFactorChange"
            ? (amount - 1) * 100
            : amount
        ).toFixed(6),
      ),
      unit:
        format === "tooltipSeconds"
          ? "s"
          : ["tooltipPercent", "tooltipFactorChange"].includes(format)
            ? "%"
            : "number",
    });
  }
  const effects = [];
  // These equal-status packets occur at different boundaries; retain that
  // factual distinction with our own short Chinese labels.
  const stages = {
    2033: {
      "Pulse Alacrity": "超载脉冲",
      "Final Alacrity": "超载最后一次脉冲",
    },
    2195: {
      Alacrity: "激活决心",
      alacrity: "激活决心",
      "alacrity (triggered)": "触发决心",
    },
  };
  const qualifiers = {
    "per eligible shatter hit": "每次满足条件的粉碎命中",
    "replacement per eligible shatter hit": "替换满足条件的粉碎命中效果",
    "while in shroud": "处于帷幕时",
    "on entering shroud": "进入帷幕时",
  };
  for (const effect of balance.effects || []) {
    if (
      !["boon", "condition"].includes(effect.type) ||
      typeof effect.duration !== "number" ||
      !Number.isFinite(effect.duration)
    )
      continue;
    const status = statusNames[effect.boon || effect.condition];
    if (!status) continue;
    if (presentation.qualifier && !qualifiers[presentation.qualifier]) continue;
    const audience = effect.audience;
    let recipient;
    const isSummon =
      common.ACTOR?.SUMMON != null && effect.actorType === common.ACTOR.SUMMON;
    if (audience?.recipients === "self")
      recipient = isSummon ? "召唤物" : "自身";
    if (audience?.recipients === "party")
      recipient = audience.maximumRecipients
        ? `小队至多 ${audience.maximumRecipients} 人${audience.affectsSelf === false ? "（不含自身）" : ""}`
        : `小队成员${audience.affectsSelf === false ? "（不含自身）" : ""}`;
    if (audience?.recipients === "summons")
      recipient =
        audience.affectsSelf === false || isSummon ? "召唤物" : "自身及召唤物";
    if (effect.type === "condition" && effect.target === "self")
      recipient = "自身";
    // Missing recipients are deliberately not guessed from packet order or name.
    const trigger =
      stages[id]?.[effect.name] || qualifiers[presentation.qualifier];
    effects.push({
      status,
      duration: effect.duration,
      ...(typeof effect.stacks === "number" ? { stacks: effect.stacks } : {}),
      ...(typeof effect.applications === "number"
        ? { applications: effect.applications }
        : {}),
      ...(recipient ? { recipient } : {}),
      ...(trigger ? { trigger } : {}),
    });
  }
  // Never publish indistinguishable packets as numeric alternatives. A future
  // source change without preserved audience/stage metadata falls back safely.
  const key = (effect) =>
    JSON.stringify([effect.status, effect.recipient, effect.trigger]);
  const unambiguous = effects.filter(
    (effect) =>
      effects.filter((other) => key(other) === key(effect)).length === 1,
  );
  if (rows.length || unambiguous.length)
    entries[id] = {
      rows,
      effects: unambiguous,
      paths: [path, presentation.path],
    };
}
if (Object.keys(entries).length < 100 || !entries[707] || !entries[708])
  throw Error(
    "PvE extraction coverage is unexpectedly low; nothing was written",
  );
await mkdir("src/data", { recursive: true });
const output = {
  schema: 1,
  mode: "pve",
  balance: "live",
  sourceCommit: commit,
  source: repository,
  catalogRevision: catalog.revision,
  generatedAt: new Date().toISOString(),
  descriptionSource:
    "Catalog Chinese descriptions: Wishingstarmoye with official Guild Wars 2 API fallback",
  policy:
    "Game parameters only; no reference source programs, authored descriptions, or implementations included.",
  traits: entries,
};
await writeFile(
  "src/data/pve-traits.json",
  JSON.stringify(output, null, 2) + "\n",
);
console.log(
  `PvE snapshot: ${Object.keys(entries).length} traits, ${Object.values(entries).reduce((sum, e) => sum + e.rows.length, 0)} scalar facts, ${Object.values(entries).reduce((sum, e) => sum + e.effects.length, 0)} independent effects; ${profiles.size} literal profiles examined.`,
);
