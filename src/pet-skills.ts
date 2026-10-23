import type { Catalog, Entity } from "./domain";

// Game identities/family associations only. Locators: official Wiki pet tables,
// cross-checked against Kadenar's fixed 85bdcbd game-data records. No reference
// program logic, authored descriptions, cooldown estimates or formulas copied.
// Most natural Pet skill IDs return 404 from /v2/skills. Missing PvE numerical
// evidence is not replaced by the identically named Soulbeast player's facts.
type PetAttack = [number, string, string, string];
const commands: Record<string, PetAttack[]> = {
  Bear: [
    [12686, "撕咬", "Bite_(bear)", "咬击敌人，为宠物恢复生命。"],
    [12665, "蔑视痛苦", "Defy_Pain", "宠物在短时间内免疫伤害。"],
  ],
  Bird: [
    [12719, "俯冲", "Swoop", "宠物俯冲攻击目标。"],
    [12720, "急速鸣叫", "Quickening_Screech", "宠物鸣叫，帮助附近盟友移动。"],
  ],
  Canine: [
    [12661, "致残跃击", "Crippling_Leap", "跃向敌人并施加残废。"],
    [12662, "野蛮冲撞", "Brutal_Charge_(canine)", "冲向目标并将其击倒。"],
  ],
  Drake: [
    [12669, "猛咬", "Chomp_(drake)", "咬住敌人，为宠物恢复生命。"],
    [12671, "甩尾", "Tail_Swipe", "用尾巴攻击周围敌人。"],
  ],
  Feline: [
    [12694, "撕咬", "Bite_(feline)", "咬击目标。"],
    [12657, "猛扑", "Maul_(feline)", "连续抓击目标并施加流血。"],
  ],
  Devourer: [
    [12673, "扫尾", "Tail_Lash_(devourer)", "使用尾巴击退敌人。"],
    [12678, "噬蝎遁地", "Devourer_Retreat", "钻入地下后退，躲避攻击。"],
  ],
  Moa: [
    [12706, "协调鸣叫", "Harmonic_Cry", "治疗宠物自身和附近盟友。"],
    [12707, "狂怒攻击", "Frenzied_Attack", "连续啄击目标并施加易伤。"],
  ],
  Porcine: [
    [12734, "猛击", "Maul_(porcine)", "攻击面前敌人并施加流血。"],
    [12738, "野蛮冲撞", "Brutal_Charge_(porcine)", "冲撞敌人并将其击倒。"],
  ],
  Spider: [
    [12725, "毒气", "Poison_Gas", "向区域喷吐毒液。"],
    [12654, "缠绕蛛网", "Entangling_Web", "吐出蛛网使敌人定身。"],
  ],
  Wyvern: [
    [31613, "扫尾", "Tail_Lash_(wyvern_skill)", "用尾巴扫击附近敌人。"],
    [31321, "振翅击退", "Wing_Buffet", "扇动翅膀将敌人击退。"],
  ],
  Phoenix: [
    [64070, "疾冲", "Dash_(phoenix)", "向前冲刺并留下气流。"],
    [65209, "振翅击退", "Wing_Buffet_(phoenix)", "扇动翅膀击退敌人。"],
  ],
  Bristleback: [
    [31599, "锋利尖刺", "Sharpen_Spines", "强化宠物随后攻击的流血效果。"],
    [31775, "尖刺之雨", "Rain_of_Spikes", "向周围敌人发射尖刺。"],
  ],
  Smokescale: [
    [31430, "扑倒", "Takedown", "突袭并控制目标。"],
    [31854, "烟鳞突袭", "Smoke_Assault", "在烟雾中连续攻击附近敌人。"],
  ],
  "Fanged Iboga": [
    [41864, "残废痛苦", "Crippling_Anguish", "发射造成症状的投射物。"],
    [45262, "麻醉孢子", "Narcotic_Spores", "喷出孢子，使区域内敌人困惑。"],
  ],
  Jacaranda: [
    [40487, "召唤闪电", "Call_Lightning", "在目标区域召唤闪电。"],
    [41710, "光合作用", "Photosynthesize", "宠物恢复生命并清除症状。"],
  ],
  "Rock Gazelle": [
    [43593, "踢击", "Kick_(gazelle)", "踢击敌人。"],
    [44051, "冲锋", "Charge_(gazelle)", "向目标发起冲锋。"],
  ],
  "Siege Turtle": [
    [63502, "重炮射击", "Heavy_Shot", "发射翠玉导弹，打击目标附近敌人。"],
    [67179, "践踏", "Slam_(turtle)", "跃起后践踏地面，击退附近敌人。"],
  ],
  "Aether Hunter": [
    [70950, "突刺", "Lunge", "向前突进，攻击路径上的敌人。"],
    [70332, "地脉漩涡", "Ley-Line_Vortex", "旋转形成地脉能量漩涡。"],
  ],
  "Sky-Chak Striker": [
    [71501, "电击", "Electrocute", "以电流攻击目标区域。"],
    [71532, "喷吐黏液", "Spit_Goop", "向目标喷吐黏液。"],
  ],
  Spinegazer: [
    [72527, "虚空凝视", "Staring_Void", "向前方释放能量。"],
    [72652, "折磨幻象", "Tormenting_Visions", "以幻象折磨目标。"],
  ],
  Warclaw: [
    [74252, "战斗猛扑", "Battle_Maul", "扑击敌人。"],
    [73376, "拍击", "Bop", "拍击敌人并将其击倒。"],
  ],
  "Janthiri Bee": [
    [75661, "嗡嗡冲撞", "Bumble", "冲向目标。"],
    [76021, "螫刺悲痛", "Stinging_Sorrow", "以螫刺攻击目标。"],
  ],
};
export function petNaturalCommands(pet: Entity, catalog?: Catalog): Entity[] {
  let pair = commands[pet.family];
  if (pet.id === 63)
    pair = [
      commands.Feline[0],
      [63891, "相位突袭", "Phase_Pounce", "穿越裂隙接近目标并施加症状。"],
    ];
  if (pet.id === 64)
    pair = [
      [67277, "猛击", "Maul_(wallow)", "攻击敌人并施加流血。"],
      [67084, "亡者疫病", "Undead_Plague", "在周围释放有毒气体。"],
    ];
  if (pet.id === 72)
    pair = [
      [78204, "蜥兽之力", "Saurian_Might", "以原始力量砸击面前地面。"],
      [77805, "跃动飞蜥", "Leaping_Lizard", "跳向敌人并施加残废。"],
    ];
  // Wiki names/relationships are known for these two new species; their natural
  // attack API IDs have not been established. Negative IDs are private UI keys,
  // never game IDs, selectable configuration, or Markdown references.
  if (pet.id === 73)
    pair = [
      [-7301, "喷射", "Jet", "踏着水浪冲向敌人。"],
      [-7303, "尾鞭", "Tail_Whip", "用尾巴猛击敌人。"],
    ];
  if (pet.id === 74)
    pair = [
      [-7401, "削弱", "Enervate", "吸取目标能量，使其虚弱。"],
      [-7403, "吸血掠袭", "Vampiric_Predation", "扑向敌人并虹吸生命。"],
    ];
  return (pair || []).map(([id, name, title, description], i) => {
    const original = catalog?.skills.find((s) => s.id === id);
    const artwork = catalog?.skills.find(
      (s) => s.id === pet.mergedSkills[i],
    )?.icon;
    return original
      ? { ...original, mechanicActor: "pet" }
      : {
          id,
          name,
          englishName: title.replaceAll("_", " "),
          description,
          icon: artwork,
          type: "Pet",
          detailOnly: true,
          mechanicActor: "pet",
          wikiDescriptionOnly: true,
          uiOnly: id < 0,
          sourceUrl: `https://wiki.guildwars2.com/wiki/${title}`,
          facts: [],
        };
  });
}
