import { load } from "cheerio";

export function parseConsumablePage(html, id) {
  const $ = load(html);
  const revision = Number(html.match(/"wgRevisionId":(\d+)/)?.[1]);
  const encodedTitle = html.match(/"wgPageName":("(?:\\.|[^"\\])*")/)?.[1];
  const title = encodedTitle ? JSON.parse(encodedTitle) : undefined;
  const ids = $(".infobox .gamelink[data-type=item]")
    .map((_, e) => Number($(e).attr("data-id")))
    .get();
  if (!revision || !title || !ids.includes(id))
    return { reason: "页面游戏ID未确认" };
  const nutritionSelector =
    "blockquote [id^=nourishment],.mw-parser-output > [id^=nourishment]";
  const disputed = /\[sic\]|verification requested/i.test(
    $(nutritionSelector).first().text(),
  );
  $("script,style,sup,.sortkey,.historical").remove();
  const sourceUrl = `https://wiki.wishingstar.top/wiki/${encodeURIComponent(title)}?oldid=${revision}`;
  const table = $(nutritionSelector).first();
  let text = table.find("td").last().html() || "";
  text = load(`<div>${text.replace(/<br\s*\/?\s*>/gi, "\n")}</div>`)("div")
    .text()
    .trim();
  const duration = text.match(
    /^(?:Nourishment|Enhancement)\s*\((\d+)\s*(m|h)\):\s*/i,
  );
  if (duration) text = text.slice(duration[0].length).trim();
  else text = "";
  if (disputed) text = "";
  const content = $(".mw-parser-output");
  const equivalences = [];
  content.find("li").each((_, el) => {
    const line = $(el).text().replace(/\s+/g, " ").trim();
    if (
      !/^(?:Same nourishment effect as |Grants the same effect as )/i.test(line)
    )
      return;
    const link = $(el)
      .find('a[href^="/wiki/"]')
      .filter((_, a) => $(a).text().trim())
      .first();
    if (link.length)
      equivalences.push({
        name: link.text().trim() || link.attr("title"),
        quote: line,
      });
  });
  return {
    title,
    revision,
    sourceUrl,
    text,
    disputed,
    duration: duration
      ? Number(duration[1]) * (duration[2].toLowerCase() === "h" ? 3600 : 60)
      : /Grants the same effect as .*only for a duration of 20 minutes/i.test(
            content.text(),
          )
        ? 1200
        : 3600,
    equivalences,
    pve: !/stats only apply in WvW|Only usable in WvW/i.test(content.text()),
    quote: content
      .find("blockquote")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim(),
  };
}

export function translateNutrition(text) {
  let value = text
    .replace(
      /Gain (\d+(?:\.\d+)?)% Increased Healing to Other Allies for Every 100 Healing Power/gi,
      "每100点治疗效果提升$1%对其他盟友的治疗量",
    )
    .replace(
      /Gain (\d+(?:\.\d+)?)% Increased Healing to Other Allies for Every 100 Concentration/gi,
      "每100点增益效果提升$1%对其他盟友的治疗量",
    );
  value = value
    .replace(
      /Gain (\d+) seconds of Quickness on dismount\. \(Cooldown: (\d+) seconds\)/gi,
      "下坐骑时获得$1秒急速（冷却：$2秒）",
    )
    .replace(
      /Lose a Condition on Successful Evade \(Cooldown: (\d+) Seconds\)/gi,
      "成功闪避时移除一个症状（冷却：$1秒）",
    );
  value = value
    .replace(
      "25% Chance on Critical Hit to Inflict Chill for 1 Second, Burning for 2 Seconds, and Poison for 3 Seconds(Cooldown: 20 Seconds)",
      "暴击时有25%概率造成1秒冰冻、2秒燃烧及3秒中毒（冷却：20秒）",
    )
    .replace(
      /\+(\d+) Power for (\d+) Seconds on Kill/gi,
      "击败敌人时获得$1点威力，持续$2秒",
    );
  const terms = {
    "Chance to Gain Might on Critical Hit": "暴击时获得威能的概率",
    "Chance to Steal Life on Critical Hit": "暴击时窃取生命的概率",
    "Incoming Condition Duration": "受到的症状持续时间",
    "Outgoing Healing": "对其他盟友的治疗量",
    "Healing Effectiveness": "对其他盟友的治疗量",
    "Incoming Damage": "受到的伤害",
    "Gain Health Every Second": "每秒恢复生命",
    "Experience from Kills": "击败敌人经验",
    "All Experience Gained": "所有经验获取",
    "WXP Gained": "世界经验获取",
    "Magic Find": "幸运值",
    "Gold Find": "金币获取",
    "Gold from Monsters": "怪物掉落金币",
    "Karma Gained": "业力获取",
    "May Cause Intermittent Gastric Distress": "可能间歇性引起肠胃不适",
    "Stats only apply in WvW": "属性仅在世界之战生效",
    "Healing Power": "治疗效果",
    "Condition Damage": "症状伤害",
    "Condition Duration": "症状持续时间",
    "Boon Duration": "增益持续时间",
    "Critical Chance": "暴击率",
    "Critical Damage": "暴击伤害",
    "Fishing Power": "渔力",
    Concentration: "增益效果",
    Expertise: "症状效果",
    Precision: "精准",
    Ferocity: "暴击效果",
    Toughness: "坚韧",
    Vitality: "体力",
    Power: "威力",
    Karma: "业力",
    "to All Attributes": "所有属性",
    "All Attributes": "所有属性",
    "All Stats": "所有属性",
    Health: "生命值",
  };
  for (const [english, chinese] of Object.entries(terms))
    value = value.replaceAll(new RegExp(`\\b${english}\\b`, "gi"), chinese);
  return value;
}
