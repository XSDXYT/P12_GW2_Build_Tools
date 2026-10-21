import { load } from "cheerio";

const terms = {
  "Number of Targets": "目标数",
  Radius: "半径",
  Range: "射程",
  "Conditions Removed": "症状移除",
  "Boons Removed": "增益移除",
  "Recharge Time Reduced": "冷却时间缩短",
  "Recharge Time": "冷却时间",
  "Maximum Effect Duration": "效果最长持续时间",
  "Maximum Stacks": "最大层数",
  "No-Clone Heal": "无分身治疗",
  "One-Clone Heal": "1 个分身治疗",
  "Two-Clone Heal": "2 个分身治疗",
  "Three-Clone Heal": "3 个分身治疗",
  "One-Blade Heal": "1 把灵刃治疗",
  "Two-Blade Heal": "2 把灵刃治疗",
  "Three-Blade Heal": "3 把灵刃治疗",
  "Four-Blade Heal": "4 把灵刃治疗",
  "Five-Blade Heal": "5 把灵刃治疗",
  "Crescendo Healing per Instrument": "每件乐器渐强治疗",
  Regen: "再生",
  Regeneration: "再生",
  Fury: "激怒",
  Might: "威能",
  Protection: "保护",
  Vigor: "活力",
  Swiftness: "迅捷",
  Quickness: "急速",
  Alacrity: "敏捷",
  Aegis: "圣盾",
  Stability: "稳固",
  Resistance: "抗性",
  Resolution: "坚决",
  "Chaos Aura": "混沌光环",
  "Chaos Armor": "混沌护甲",
  Bleeding: "流血",
  Burning: "燃烧",
  Poison: "中毒",
  Poisoned: "中毒",
  Torment: "折磨",
  Confusion: "困惑",
  Vulnerability: "易伤",
  Weakness: "虚弱",
  Blindness: "目盲",
  Blinded: "目盲",
  Crippled: "致残",
  Chilled: "冰冻",
  Slow: "迟缓",
  Immobilized: "定身",
  Daze: "晕眩",
  Stun: "昏迷",
  Fear: "恐惧",
  Taunt: "嘲讽",
  Stealth: "隐身",
  Superspeed: "超级速度",
  Distortion: "失真",
  Invulnerability: "无敌",
  Power: "威力",
  Precision: "精准",
  Toughness: "坚韧",
  Vitality: "体力",
  Ferocity: "暴击效果",
  "Condition Damage": "症状伤害",
  "Healing Power": "治疗效果",
  Concentration: "增益效果",
  Expertise: "症状效果",
  "Boon Duration": "增益持续时间",
  "Condition Duration": "症状持续时间",
  "Critical Chance": "暴击率",
  "Critical Damage": "暴击伤害",
  "Outgoing Healing": "输出治疗量",
  "Incoming Healing": "受到治疗量",
  "Strike Damage": "打击伤害",
  "Movement Speed": "移动速度",
  "Attack Speed": "攻击速度",
  "Damage Reduction": "伤害减免",
  "Damage Increase": "伤害提高",
  Damage: "伤害",
  Healing: "治疗",
  Heal: "治疗",
  Barrier: "屏障",
  "Defiance Break": "蔑视伤害",
  "Combo Field": "组合技区域",
  "Combo Finisher": "组合技终结",
  "Breaks Stun": "解除昏迷",
  "Breaks stun": "解除昏迷",
  Unblockable: "无法格挡",
  "Cannot be blocked": "无法格挡",
  Evade: "闪避",
  "Evade Duration": "闪避时间",
  "Block Duration": "格挡时间",
  "Number of Bounces": "弹跳次数",
  "Number of Impacts": "打击次数",
  "Number of Hits": "命中次数",
  "Number of Pulses": "脉冲次数",
  "Number of Clones": "分身数量",
  "Number of Phantasms": "幻影数量",
  "Number of Boons": "增益数量",
  "Number of Conditions": "症状数量",
  "Boon Removal": "增益移除",
  "Condition Removal": "症状移除",
  "Boon Conversion": "增益转换",
  "Condition Conversion": "症状转换",
  "Healing per Pulse": "每次脉冲治疗",
  "Healing per Clone": "每个分身治疗",
  "Healing per Illusion": "每个幻象治疗",
  "Healing per Second": "每秒治疗",
  "Initial Heal": "初始治疗",
  "Initial Healing": "初始治疗",
  "Initial Damage": "初始伤害",
  "Damage per Pulse": "每次脉冲伤害",
  "Damage per Hit": "每次命中伤害",
  Duration: "持续时间",
  Recharge: "冷却时间",
  "Cast Time": "施法时间",
  Count: "数量",
  "Blind Radius": "目盲半径",
  "Alacrity per Clone": "每个分身提供敏捷",
  "Base Protection Duration": "基础保护持续时间",
  "Additional Protection Duration": "额外保护持续时间",
  Interval: "间隔",
  "Personal Fury": "个人激怒",
  "Personal Quickness": "个人急速",
  "Phantasm Quickness": "幻影急速",
  "Reflect Missiles": "反射投射物",
  "Removes boons.": "移除增益",
  "Summons illusions.": "召唤幻象",
  "Increases the number of allied targets.": "增加友方目标数",
  "Removes conditions.": "移除症状",
  "Applies vulnerability.": "施加易伤",
  "Increases healing.": "增加治疗量",
  "Alacrity on Phantasm Spawn": "召唤幻影时获得敏捷",
  "Quickness per Clone": "每个分身提供急速",
  "Skills and actions are slower.": "技能与动作速度降低",
  "Reflects Projectiles": "反射投射物",
  "Increased critical-hit chance by 25%.": "暴击率提高 25%",
  "Cripples foes on hit.": "命中时使敌人致残",
  "Strikes up to five targets within range.": "打击范围内至多 5 个目标",
  "Ambush Attack Window": "伏击技能可用时间",
  "Gain Ferocity Based on a Percentage of Vitality": "体力转化为暴击效果的比例",
  "Lute Playing": "演奏鲁特琴",
  "Flute Playing": "演奏长笛",
  "Healing Increase to Others": "对其他盟友的治疗量提高",
  "Endurance Regeneration": "耐力回复速度",
  "1 Illusion": "1 个幻象伤害",
  "2 Illusions": "2 个幻象伤害",
  "3 Illusions": "3 个幻象伤害",
  "Always Receive—Swiftness": "必定获得迅捷",
  "Initial Stability": "初始稳固",
  "First-Pulse Stability": "第一次脉冲稳固",
  Cripple: "致残",
  "Condition Removed": "症状移除",
  "Rechage Reduced per Clone": "每个分身缩短冷却时间",
  Immobilize: "定身",
  "Endurance Gained": "恢复耐力",
  "Notes Granted": "获得音符",
  "Base Duration": "基础持续时间",
  "Duration per Instrument": "每件乐器增加持续时间",
  "Self-Healing": "自身治疗",
  "Ally Healing": "盟友治疗",
  "Heal Effectiveness": "治疗效能",
  "Scion's Reprieve": "受到治疗增益",
  "First-Hit Weakness": "第一次命中虚弱",
  "Second-Hit Vulnerability": "第二次命中易伤",
  "Third-Hit Boons Removed": "第三次命中移除增益",
  "Fourth-Hit Daze": "第四次命中晕眩",
  Ethereal: "幻光",
  Light: "光明",
  Dark: "黑暗",
  Smoke: "烟雾",
  Blast: "爆炸",
  Leap: "跳跃",
  Projectile: "投射物",
  Whirl: "旋风",
  "Number of Allied Targets": "友方目标数",
  "Signet Passive": "纹章被动",
  "Scepter Might Gain": "权杖提供威能",
  "Non-Scepter Might Gain": "非权杖提供威能",
  Endurance: "耐力",
  "Regeneration on Trigger": "触发时再生",
  "Alacrity on Trigger": "触发时敏捷",
  "Alacrity on Activation": "激活时敏捷",
  "Passive Heal": "被动治疗",
  "Active Heal": "主动治疗",
  "Heal on Trigger": "触发时治疗",
  "Initial Burning": "初始燃烧",
  "Aegis Refresh": "圣盾刷新间隔",
  "Empowered Sword": "强化单手剑",
  "Empowered Shield": "强化盾牌",
  "Empowered Staff": "强化法杖",
  "Empowered Hammer": "强化巨锤",
  "Self Condition Removal": "自身症状移除",
  "Light Aura": "光明光环",
  "Luminary's Blessing": "辉光祝福",
  "Number of Attacks to Trigger": "触发所需攻击次数",
  Fire: "火焰",
  Water: "流水",
  Ice: "寒冰",
  Lightning: "闪电",
  "Block the next incoming attack.": "格挡下一次攻击",
  "Incoming Damage": "受到的伤害",
  "Incoming Condition Damage": "受到的症状伤害",
  "Critical Vulnerability": "暴击易伤",
  "Removes Immobile": "移除定身",
  "Condition Effect Ignored": "忽略症状效果",
  "Maximum Count": "最大数量",
  "Brisk Pacing": "轻快步调",
  Motivation: "士气",
  "Motivation Cost per Interval": "每次间隔消耗士气",
  "Physical Projectile": "物理投射物",
  "Active Bonus": "主动加成",
  "On-Hit Stability": "命中时稳固",
  "Initial Superspeed": "初始超级速度",
  "Initial Aegis": "初始圣盾",
  "Initial Might": "初始威能",
  "Initial Fury": "初始激怒",
  "Maximum Fear": "最长恐惧",
  "Minimum Fear": "最短恐惧",
  "Supercharged Burning": "超充燃烧",
  "Echo Resolution": "回响坚决",
  "Echo Regeneration": "回响再生",
  "Echo Immobilize": "回响定身",
  "Bonus Might per Enemy Struck": "每命中一个敌人额外获得威能",
  "Unable to move.": "无法移动",
  "Skill Recharge Rate": "技能冷却恢复速度",
  "Gain adrenaline.": "获得怒气",
  "50% faster endurance regeneration.": "耐力回复速度提高 50%",
  "Stacks of might gained increased per level.": "每级提高获得的威能层数",
  "Healing increased per level.": "每级提高治疗量",
  "Boon duration increased for each boon granted per level.":
    "每级延长所提供的各项增益持续时间",
  "Heals for more.": "治疗量提高",
  "Heals allies around you.": "治疗周围盟友",
  "Heals for more. Additionally, applies boons to allies.":
    "治疗量提高，额外向盟友提供增益",
  "Applies might.": "提供威能",
  "Applies more stacks of might.": "提供更多威能层数",
  "Applies more stacks of might. Additionally, applies fury.":
    "提供更多威能层数，额外提供激怒",
  "Effectiveness Increased": "效果提高",
  "Required Boon": "所需增益",
  "Missiles Until Orbital Strike": "触发轨道打击所需导弹数",
  "Third-Trigger Might": "第三次触发威能",
  "Kinetic Charge": "动能充能",
  "At maximum charges gain a burst of speed.": "达到最大充能时获得爆发速度",
  Percent: "比例",
  "Self Superspeed": "自身超级速度",
  "Photon Forge Activation": "光子熔炉激活",
  "Photon Forge Deactivation": "光子熔炉关闭",
  "Photon Forge Overheated": "光子熔炉过热",
  "Conditions to Boons Over 50% Heat": "热量超过 50% 时症状转为增益数量",
  "Bleeding on Hit": "命中时流血",
  "Might on Hit": "命中时威能",
  "Protection on Evolve": "进化时保护",
  "Heat Threshold": "热量阈值",
  "Field Damage": "区域伤害",
  "Field Burning": "区域燃烧",
  "Field Pulses": "区域脉冲次数",
  "Field Duration": "区域持续时间",
  "Duration Increase above 50% Heat": "热量超过 50% 时持续时间延长",
  "Barrier Applied above 50% Heat": "热量超过 50% 时提供屏障",
  "Radius Increase above 50% Heat": "热量超过 50% 时半径增加",
  "Missiles Fired": "发射导弹数",
  "Storm Bleeding": "风暴流血",
  "Recharge increase per gyro": "每个陀螺增加冷却时间",
  "Cannot be knocked down, pushed back, pulled, launched, stunned, dazed, floated, sunk, feared, or taunted.":
    "免疫击倒、击退、拉拽、击飞、昏迷、晕眩、漂浮、沉没、恐惧和嘲讽",
  "Movement speed is greatly increased. Maximum duration: 10s":
    "移动速度大幅提高，最长持续 10 秒",
  "Opening Strike": "先发打击",
  "Your next attack is an opening strike.": "下一次攻击为先发打击",
  "Below 25 Percent": "生命低于 25%",
  "Below 50 Percent": "生命低于 50%",
  "Below 75 Percent": "生命低于 75%",
  "Cyclone Bow Pierces ()": "旋风弓穿透",
  "On Dodge": "闪避时",
  "Beastly Warden": "野兽守卫",
  Health: "生命值",
  "Lingering Light": "余光",
  "Reduces the cooldown of Celestial Avatar when exiting.":
    "退出天界化身时缩短其冷却时间",
  "Wind Force": "风力",
  "Gain access to Hawkeye at the stack threshold.":
    "达到层数阈值时可以使用鹰眼",
  "Trap Radius": "陷阱半径",
  "Chill per Second": "每秒冰冻",
  "Poison Per Pulse": "每次脉冲中毒",
  "Burning per pulse": "每次脉冲燃烧",
  "Cripple per Pulse": "每次脉冲致残",
  "Slow per Pulse": "每次脉冲迟缓",
  "Immobilize at Creation": "生成时定身",
  "Draw nearby enemies to you.": "将附近敌人拉向自己",
  "Push nearby enemies away from you.": "击退附近敌人",
  "Heal and remove conditions from nearby allies.": "治疗附近盟友并移除其症状",
  "Damage and apply conditions to nearby foes.": "伤害附近敌人并施加症状",
  "Heal yourself for a small amount, and heal allies for a large amount.":
    "少量治疗自身，大量治疗盟友",
  "Heal yourself for a large amount and allies for a small amount.":
    "大量治疗自身，少量治疗盟友",
  "Glyph. Grant barrier and endurance to nearby allies.":
    "为附近盟友提供屏障与耐力",
  "Glyph. Heal nearby allies and gain astral force.":
    "治疗附近盟友并获得星界能量",
  "Glyph. Break stun for nearby allies.": "为附近盟友解除昏迷",
  "Glyph. Daze nearby foes.": "晕眩附近敌人",
  "Prevent health drain while downed and revive downed allies in the targeted area. Grant boons to allies in that area.":
    "阻止倒地生命流失，复苏目标区域内倒地盟友，并为区域内盟友提供增益",
  "Cleanse conditions, and grant stability to allies in the area.":
    "移除区域内盟友的症状，并为其提供稳固",
  "underwater only": "仅水下",
  "Removes Crippled": "移除致残",
  "Removes Chilled": "移除冰冻",
  "Self-Vulnerability per Condition": "每个症状使自身获得易伤",
  "Conditions on Stealth Attack": "潜行攻击症状",
  "Removes Bleeding": "移除流血",
  "Removes Burning": "移除燃烧",
  "Removes Confusion": "移除困惑",
  "Removes Poisoned": "移除中毒",
  "Removes Torment": "移除折磨",
  "High Health Critical Damage Increase": "高生命值时暴击伤害提高",
  "Poison When Downed": "倒地时中毒",
  Revealed: "显形",
  "You cannot stealth": "无法进入潜行",
  "Endurance Threshold Increased": "耐力上限提高",
  "Offensive Artifact Boons": "攻击神器增益",
  "Defensive Artifact Boons": "防御神器增益",
  "Scoundrel's Luck": "无赖之运",
  "Your next Double Edge skill used on cooldown will always be successful, regardless of the remaining cooldown. If used on Skritt Scuffle, it instead reduces the chance of obtaining an Unstable Skritt Bomb.":
    "下次在冷却中使用双刃技能必定成功，不受剩余冷却影响；若使用鼠人混战，则改为降低获得不稳定鼠人炸弹的概率",
  "Prodigious Pincher": "妙手神偷",
  "When this reaches the maximum amount of stacks, remove all stacks, then Pilfer. Overrides existing artifacts.":
    "达到最大层数时移除全部层数并施展窃取，替换已有神器",
  "Passive Power Increase": "被动威力提高",
  "Active Power Increase": "主动威力提高",
  "Skill cooldown increase.": "技能冷却时间增加",
  "Base Health Damage": "基于基础生命值的伤害",
  "Fuse Time": "引信时间",
  "Self-Knockdown": "自身击倒",
  "Cooldown Increase": "冷却时间增加",
  "Might on Self-Destruct": "自毁时威能",
  "Fury on Self-Destruct": "自毁时激怒",
  "Coins Tossed": "抛掷硬币数",
  Heads: "正面",
  Tails: "反面",
  Initiative: "先攻值",
  "Conditions Converted to Boons": "症状转为增益数量",
  "Boons Converted to Conditions": "增益转为症状数量",
  "Damage to Self": "对自身伤害",
  Launch: "击飞",
  "Gain initiative and convert conditions on yourself to boons.":
    "获得先攻值，将自身症状转为增益",
  "Gain initiative and remove conditions on yourself.":
    "获得先攻值，移除自身症状",
  "Gain initiative and remove boons from yourself.": "获得先攻值，移除自身增益",
  "Convert boons on yourself into conditions.": "将自身增益转为症状",
  "Backfire. After a short period of time, the cannon misfires, damaging and inflicting conditions on you and nearby enemies within range of the summoned skritt.":
    "反噬：短暂延迟后火炮失控，对自身及召唤鼠人范围内的附近敌人造成伤害并施加症状",
  "Backfire. After shadowstepping, you are knocked down. You cannot reactivate this skill until it is fully recharged again.":
    "反噬：暗影步后自身被击倒，完全冷却前无法再次激活该技能",
  "Backfire. The shield explodes after a short period of time, dealing damage to yourself equal to a percentage of your base health, as well as damaging enemies around you.":
    "反噬：盾牌短暂延迟后爆炸，对自身造成基于基础生命值比例的伤害，并伤害附近敌人",
  "Backfire. You drop the potion on yourself, healing for more. The cooldown of this skill is increased, and you cannot reactivate this skill until it is fully recharged again.":
    "反噬：药水洒在自身，治疗量提高，技能冷却时间增加，完全冷却前无法再次激活",
  "Backfire. Flip a number of cursed Canach Coins. Gain effects depending on whether they land on heads or tails.":
    "反噬：抛掷数枚受诅咒的卡纳克硬币，按正反面获得不同效果",
  "Unstable Skritt Bomb": "不稳定鼠人炸弹",
  "Backfire. The bomb explodes in your hands, launching and damaging both you and enemies around you.":
    "反噬：炸弹在手中爆炸，击飞并伤害自身及附近敌人",
  "Burn nearby foes.": "燃烧附近敌人",
  "Heal yourself and nearby allies, curing a condition.":
    "治疗自身与附近盟友，并移除一个症状",
  "Blind nearby foes.": "使附近敌人目盲",
  "Create a shock wave that bleeds and cripples nearby foes.":
    "产生震荡波，使附近敌人流血和致残",
  "Removal upon Detonation": "引爆时移除症状",
  "Condition Removed on Leap": "跳跃终结移除症状",
  "Condition Removed on Blast": "爆炸终结移除症状",
  "Bountiful Power": "充沛力量",
  "At maximum, gain a burst of power.": "达到最大层数时获得爆发力量",
  "Alacrity per Pulse": "每次超载脉冲敏捷",
  "Alacrity on Overload": "超载最后一次脉冲敏捷",
  "Remove one condition.": "移除一个症状",
  "Flame Burst": "火焰爆发",
  "Blinding Flash": "致盲闪光",
  "Shock Wave": "震荡波",
  "Fire Attunement": "火焰协调",
  "Water Attunement": "流水协调",
  "Air Attunement": "空气协调",
  "Earth Attunement": "大地协调",
  "Lesser Fire Elemental": "次级火元素",
  "Lesser Ice Elemental": "次级冰元素",
  "Lesser Air Elemental": "次级气元素",
  "Lesser Earth Elemental": "次级土元素",
  "Fire Elemental": "火元素",
  "Ice Elemental": "冰元素",
  "Air Elemental": "气元素",
  "Earth Elemental": "土元素",
  "Deals damage.": "造成伤害",
  "Deals damage and chills.": "造成伤害并施加冰冻",
  "Deals damage and grants swiftness.": "造成伤害并提供迅捷",
  "Deals damage and is hard to kill.": "造成伤害且难以击杀",
  "Deals damage and heals.": "造成伤害并治疗",
  "Deals damage and stuns.": "造成伤害并施加昏迷",
  "Burn enemies.": "燃烧敌人",
  "Remove conditions from allies.": "移除盟友症状",
  "Daze enemies.": "晕眩敌人",
  "Grant barrier to allies.": "为盟友提供屏障",
  "Reduces incoming condition duration.": "缩短受到的症状持续时间",
  "Renewal of Fire": "火焰复兴",
  "Renewal of Water": "流水复兴",
  "Renewal of Air": "空气复兴",
  "Renewal of Earth": "大地复兴",
  Firestorm: "火焰风暴",
  "Ice Storm": "寒冰风暴",
  "Lightning Storm": "闪电风暴",
  Sandstorm: "沙尘暴",
  "Bonus Burning": "额外燃烧",
  "over 20 Might": "威能超过 20 层",
  "under 10 Might": "威能不足 10 层",
  "Electric Enchantment": "电能附魔",
  Blur: "模糊",
  "Evade all attacks.": "闪避所有攻击",
  "Heals and Grants Protection": "治疗并提供保护",
  "Removes 3 Conditions": "移除 3 个症状",
  "Boons Converted to Conditions while Scourge": "灾厄师增益转为症状数量",
  "Life Force Threshold while Scourge": "灾厄师生命之力阈值",
  "Life Siphon Damage While In Shroud": "帷幕中虹吸伤害",
  "Life Siphon Healing While In Shroud": "帷幕中虹吸治疗",
  "Reduction While in Death Shroud": "死亡帷幕中减免",
  "Blight Gained per Second in Shroud": "帷幕中每秒获得枯萎",
  "Self Bleeding": "自身流血",
  "Self-Bleeding": "自身流血",
  "Self Vulnerability": "自身易伤",
  "Self Poison": "自身中毒",
  "Self Weakness": "自身虚弱",
  "First Pulse": "第一次脉冲",
  "Second Pulse": "第二次脉冲",
  "Third Pulse": "第三次脉冲",
  "Fourth Pulse": "第四次脉冲",
  "Fifth Pulse": "第五次脉冲",
  "Sixth Pulse": "第六次脉冲",
  "Seventh Pulse": "第七次脉冲",
  "Eighth Pulse": "第八次脉冲",
  "Final Pulse": "最后一次脉冲",
  "Damaging Pulse": "伤害脉冲间隔",
  "Boon Application Interval": "增益施加间隔",
  "Passive Life-Siphon Heal": "被动虹吸治疗",
  "Might per Hit": "每次命中威能",
  "Might per Melee Hit": "每次近战命中威能",
  "Fumble (Unrestricted)": "非限定攻击失手几率",
  "Quickness on Melee Hit": "近战命中时急速",
  "Might per Pulse": "每次脉冲威能",
  "Might on Overload": "超载最后一次脉冲威能",
  "Self Effects on Cast": "施放时自身效果",
  "Life Force per Condition": "每个症状获得生命之力",
  "Effects in Impact Area": "冲击区域效果",
  "Blight on Self": "自身枯萎",
  Blight: "枯萎",
  "Blight Threshold": "枯萎阈值",
  "When above Blight Threshold": "高于枯萎阈值时",
  "Gain All Boons for Base Duration": "获得全部增益的基础持续时间",
  "Bonus Damage vs. Controlled": "对受控制目标伤害提高",
  "Bonus Damage per Condition": "目标每个症状提高伤害",
  "Ritualist Attack": "祭祀攻击",
  "Preservation Attack": "庇护灵攻击",
  "Anguish Attack": "苦痛灵攻击",
  "Wanderlust Attack": "流浪灵攻击",
  "Legendary Entity Stance": "传奇实体姿态",
  "Gain the same boons as the legend equipped in the other slot.":
    "获得另一槽位已装备传奇姿态所提供的相同增益",
  "True Nature": "真龙天性",
  "Remove an additional boon from enemies.": "额外移除敌人一个增益",
  "Remove an additional condition from allies.": "额外移除盟友一个症状",
  "Transfer an additional condition from yourself to enemies.":
    "额外将自身一个症状转移给敌人",
  "Grant an additional stack of stability to allies.": "额外为盟友提供一层稳固",
  "Increase the duration of boons on allies by an additional second.":
    "额外延长盟友增益持续时间 1 秒",
  "Additional Might Granted": "额外提供威能",
  "Ally Regeneration": "盟友再生",
  "Painful Bond": "痛苦联结",
  "Target takes increased damage from your summoned creatures.":
    "目标受到你的召唤生物伤害提高",
  "Profession Ability Might": "职业技能威能",
  "Profession Ability Regeneration": "职业技能再生",
  "75 to All Attributes": "全部属性 +75",
  Affinity: "亲和力",
  "Pulse might to nearby allies every few seconds.":
    "每隔数秒向附近盟友提供威能",
  "Pulse swiftness to nearby allies every few seconds.":
    "每隔数秒向附近盟友提供迅捷",
  "Pulse regeneration to nearby allies every few seconds.":
    "每隔数秒向附近盟友提供再生",
  "Pulse protection to nearby allies every few seconds.":
    "每隔数秒向附近盟友提供保护",
  "Pulse fury to nearby allies every few seconds.":
    "每隔数秒向附近盟友提供激怒",
  "When Empowered": "强化时",
  "Delay Time": "延迟时间",
  "Your attacks gain a follow-up strike.": "你的攻击会追加一次打击",
  "Self-Resistance per Condition": "每个症状使自身获得抗性",
  "Additional Torment": "额外折磨",
  "Pulsing Stability": "脉冲稳固",
  "Cascading Attacks": "连锁攻击次数",
  Tranquil: "祥和",
  "Your centaur skill is empowered.": "你的半人马姿态技能获得强化",
  "Facet of Nature—Assassin": "自然法则 · 刺客",
  "Facet of Nature—Centaur": "自然法则 · 半人马",
  "Facet of Nature—Demon": "自然法则 · 恶魔",
  "Facet of Nature—Dwarf": "自然法则 · 矮人",
  "Facet of Nature—Dragon": "自然法则 · 巨龙",
  "Grants allies the ability to steal life with their strikes.":
    "使盟友的打击能够虹吸生命",
  "Heal nearby allies every few seconds.": "每隔数秒治疗附近盟友",
  "Transfer a condition from nearby allies to yourself every few seconds.":
    "每隔数秒将附近盟友的一个症状转移给自身",
  "Reduce incoming damage to allies.": "降低盟友受到的伤害",
  "Increase the duration of boons applied to allies.":
    "延长施加给盟友的增益持续时间",
  "Pulse your invoked legend's Facet of Nature to nearby allies every few seconds.":
    "每隔数秒向附近盟友提供当前传奇姿态对应的自然法则",
  "Initial Vulnerability": "初始易伤",
  "Bonus Defiance Break": "额外蔑视伤害",
  "Enhance Bleeding": "强化流血",
  "Initial Self Heal": "初始自身治疗",
  "Final Heal": "最终治疗",
  "Initial Resolution": "初始坚决",
  "Your outgoing strikes deal additional damage and restore your health.":
    "你的打击造成额外伤害并为自身恢复生命",
  "Base Stability and Stability per Hit": "基础及每次命中稳固",
  "Base Fury": "基础激怒",
  "Number of Targets per Scythe": "每把镰刀目标数",
  "This skill deals increased damage. Apply additional conditions to enemies that are struck by both you and the fragment.":
    "此技能伤害提高，受到你与碎片共同命中的敌人额外获得症状",
  "You and the fragment shatter after the initial attack, dealing additional damage and confusion to enemies.":
    "初次攻击后，你与碎片碎裂，对敌人造成额外伤害并施加困惑",
  "Heal and remove conditions from allies in range of you and the fragment.":
    "治疗你与碎片范围内的盟友，并移除其症状",
  "You gain boons when this skill begins casting. Enemies struck by both you and the fragment are additionally stunned.":
    "开始施放时获得增益；被你与碎片共同命中的敌人额外受到昏迷",
  "Additional Energy Cost Reduction": "额外能量消耗降低",
  "Form of the Assassin": "刺客形态",
  "Form of the Monk": "僧侣形态",
  "Form of the Mesmer": "幻术师形态",
  "Form of the Warrior": "战士形态",
  "Form of the Dervish": "神唤者形态",
  "Whenever you use a Legendary Assassin skill or while channeling Impossible Odds, fire enchanted daggers at nearby enemies.":
    "使用传奇刺客技能或维持绝顶几率时，向附近敌人发射魔法匕首",
  "Your Legendary Centaur skills are always empowered and do not consume the tranquil effect.":
    "传奇半人马技能始终获得强化，且不消耗祥和效果",
  "Your Legendary Demon Stance skills have reduced energy costs, but your utility skills have increased cooldown.":
    "传奇恶魔姿态技能的能量消耗降低，通用技能冷却时间增加",
  "While you have any unique Legendary Dwarf Stance beneficial effect active, deal damage to nearby enemies when you're attacked.":
    "拥有传奇矮人姿态独有效果时，受到攻击会对附近敌人造成伤害",
  "When you use a Legendary Entity skill, a magical scythe appears and spins around you, dealing damage to enemies.":
    "使用传奇实体技能时，魔法镰刀出现并环绕你旋转，对敌人造成伤害",
  "Self Torment per Enemy Struck": "每击中一个敌人使自身获得折磨",
  "Damage increase per Affinity": "每点亲和力伤害提高",
  "Additional Conditions Removed": "额外移除症状数量",
  Knockdown: "击倒",
  "Stun enemies.": "使敌人昏迷",
  "Pulse Burning": "每次脉冲燃烧",
  "First-Hit Immobilize": "第一次命中定身",
  "Revive Pulses": "复苏脉冲次数",
  "Boon and Healing Pulses": "增益与治疗脉冲次数",
  "Vitality per Stack": "每层体力",
  "Maximum Boon Scaling": "增益加成计数上限",
  chance: "几率",
};
const intensity = new Set([
  "Might",
  "Stability",
  "Bleeding",
  "Burning",
  "Poison",
  "Torment",
  "Confusion",
  "Vulnerability",
]);
const effectNames = new Set([
  ...intensity,
  "Poisoned",
  "Protection",
  "Regeneration",
  "Regen",
  "Fury",
  "Swiftness",
  "Aegis",
  "Alacrity",
  "Quickness",
  "Vigor",
  "Resistance",
  "Resolution",
  "Crippled",
  "Chilled",
  "Blinded",
  "Blindness",
  "Slow",
  "Immobilized",
  "Stun",
  "Daze",
  "Superspeed",
  "Stealth",
  "Weakness",
  "Fear",
  "Taunt",
]);
const plain = (s) =>
  s
    .replace(/(\d*)[½¼¾⅓⅔]/g, (s, n) =>
      String(
        Number(n || 0) +
          { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 }[s.at(-1)],
      ),
    )
    .replace(/\s+/g, " ")
    .trim();
const normalized = (s) => plain(s).toLowerCase().replace(/[’']/g, "'");
const number = (s) => Number(s.replaceAll(",", ""));

function dictionary(english, chinese, names) {
  const map = new Map(
    Object.entries(terms).map(([a, b]) => [normalized(a), b]),
  );
  for (const [en, zh] of names) map.set(normalized(en), zh);
  english.facts.forEach((fact, i) => {
    const local = (english.chineseFacts || chinese.facts)?.[i];
    if (!local || local.type !== fact.type) return;
    for (const key of ["text", "status"]) {
      if (fact[key] && /[\u4e00-\u9fff]/.test(local[key] || ""))
        map.set(normalized(fact[key]), local[key]);
    }
  });
  map.set(normalized(english.name), chinese.name);
  return map;
}

function localize(value, map) {
  if (map.has(normalized(value))) return map.get(normalized(value));
  let out = value
    .replace(/Adrenaline Stage (\d+)/gi, "怒气等级 $1")
    .replace(/Level (\d+) Adrenaline/gi, "怒气等级 $1")
    .replace(/Level (\d+)/gi, "等级 $1")
    .replace(/Fumble\s*\(Unrestricted\)/gi, "非限定攻击失手几率");
  // Longest terms first to avoid replacing Power inside Healing Power.
  for (const [en, zh] of [...map].sort((a, b) => b[0].length - a[0].length)) {
    const escaped = en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), zh);
  }
  return out
    .replace(/\((?:passive effect|passive)\)/gi, "（被动）")
    .replace(/\((?:active effect|active)\)/gi, "（主动）")
    .replace(/seconds?\b/gi, "秒")
    .replace(/\b(?:per)\b/gi, "每")
    .replace(/\b(?:and)\b/gi, "及")
    .replace(/\b(?:to)\b/gi, "至")
    .replace(/\b(?:increased|increase|increases)\b/gi, "提高")
    .replace(/\b(?:reduced|reduction|reduces)\b/gi, "降低");
}

function pveOnly($, node) {
  if (
    $(node)
      .add($(node).parents())
      .filter(".gamemode")
      .toArray()
      .some((e) => !$(e).hasClass("pve"))
  )
    return null;
  const copy = $(node).clone();
  copy.find(".gamemode").each((_, e) => {
    if (!$(e).hasClass("pve")) $(e).remove();
  });
  copy
    .find(
      'script,style,.noexcerpt,[style*="display:none"],[style*="display: none"]',
    )
    .remove();
  return copy;
}

export function parseWikiPage(
  html,
  { kind, id, english, chinese, names = [], traitLinks = {}, review },
) {
  english = { ...english, facts: english.facts || [] };
  const $ = load(html);
  const plural = kind === "trait" ? "traits" : "skills";
  const box = $(`.infobox.${kind}`).first();
  const gameIds = box
    .find(`.gamelink[data-type="${kind}"]`)
    .toArray()
    .map((e) => Number($(e).attr("data-id")));
  const apiIds = box
    .find('a[href*="api.guildwars2.com/v2/"]')
    .toArray()
    .flatMap((e) => {
      const href = $(e).attr("href");
      try {
        const url = new URL(href);
        return url.pathname.endsWith(plural)
          ? (url.searchParams.get("ids") || "").split(",").map(Number)
          : [];
      } catch {
        return [];
      }
    });
  if (!gameIds.includes(id) && !apiIds.includes(id))
    throw Error(
      `Wiki identity mismatch: ${kind}/${id}; found ${[...gameIds, ...apiIds]}`,
    );
  const revision = Number(html.match(/"wgRevisionId":(\d+)/)?.[1]);
  if (!Number.isSafeInteger(revision) || revision <= 0)
    throw Error(`Missing revision: ${kind}/${id}`);
  if (review && review.revision !== revision)
    throw Error(`Review Wiki annotations for new revision: ${kind}/${id}`);
  // The first current tooltip only; never consume History, related skills or notes as base effects.
  const quote = box.nextAll("blockquote").first();
  if (!quote.length) throw Error(`Missing current tooltip: ${kind}/${id}`);
  const map = dictionary(english, chinese, names);
  const rows = [],
    skipped = [],
    crossChecks = [],
    withheld = [],
    reviewedRows = [];
  const compare = (label, field, value, candidates) => {
    const apiValues = [
      ...new Set(
        candidates.filter((v) => typeof v === "number" && Number.isFinite(v)),
      ),
    ];
    crossChecks.push({
      label,
      field,
      wiki: value,
      api: apiValues,
      status: !apiValues.length
        ? "not-provided"
        : apiValues.includes(value)
          ? apiValues.length > 1
            ? "mixed-includes-wiki"
            : "agrees"
          : "differs-wiki-wins",
    });
  };
  const add = (node) => {
    const row = pveOnly($, node);
    if (!row) return;
    const declaredReview = review?.rows.find(
      (r) => r.text === plain(row.text()),
    );
    if (
      declaredReview ||
      row.find("#sic,.sic").length ||
      /\[sic\]/i.test(row.text())
    ) {
      const text = plain(row.text());
      const notes = row
        .find("#sic [title],.sic [title]")
        .toArray()
        .map((e) => $(e).attr("title"))
        .filter((s) => s !== "wikipedia:sic");
      const decision = declaredReview;
      if (decision) {
        if (JSON.stringify(notes) !== JSON.stringify(decision.notes))
          throw Error(`Review Wiki annotation changed: ${kind}/${id}`);
        reviewedRows.push(decision);
        if (decision.action === "replace") {
          rows.push(...decision.rows);
          return;
        }
        if (decision.action === "omit") return;
        if (decision.action !== "allow")
          throw Error("Unknown Wiki review action");
        row.find("#sic,.sic").remove();
      } else {
        withheld.push({
          text,
          reason:
            "Wiki marks this value with sic; correction needs explicit review",
        });
        return;
      }
    }
    const formulas = row
      .find("abbr[title]")
      .toArray()
      .map((e) => $(e).attr("title"));
    row.find("sup").remove();
    row.find(".sic").remove();
    const text = plain(row.text());
    if (!text) return;
    const performance = {
      "Performance. Reciting this tale with the drums playing will grant you notes.":
        "战鼓正在演奏时，吟诵此传说可获得音符。",
      "Performance. Reciting this tale with the lute playing will grant you notes.":
        "鲁特琴正在演奏时，吟诵此传说可获得音符。",
      "Performance. Reciting this tale with the flute playing will grant you notes.":
        "长笛正在演奏时，吟诵此传说可获得音符。",
      "Performance. Reciting this tale with the harp playing will grant you notes.":
        "竖琴正在演奏时，吟诵此传说可获得音符。",
      "Performance. Reciting this tale with two or more instruments playing will grant you notes.":
        "至少两件乐器正在演奏时，吟诵此传说可获得音符。",
      "Performance. Command every instrument to begin playing in the background. Duration is determined by the number of instruments you currently have playing.":
        "令所有乐器开始在背景演奏；持续时间取决于当前正在演奏的乐器数量。",
    }[text];
    if (performance) {
      rows.push({ label: "演奏联动", detail: performance });
      return;
    }
    const split = text.indexOf(":");
    const lhs = split < 0 ? text : text.slice(0, split).trim();
    const rhs =
      split < 0
        ? ""
        : text
            .slice(split + 1)
            .trim()
            .replace(/\[sic\]/g, "");
    const duration = lhs.match(/\(([\d.]+)s\)$/);
    let baseLabel = lhs
      .replace(/\s*\([\d.]+s\)$/, "")
      .replace(/\s*\(\d+x\)$/, "")
      .trim();
    const conversion = baseLabel.match(
      /^Gain (.+) Based on a Percentage of (.+)$/i,
    );
    const stackMatch = baseLabel.match(/^(\d+)\s*(.+)$/);
    if (
      stackMatch &&
      (intensity.has(stackMatch[2]) ||
        /(?:Stability|Vulnerability|Might|Bleeding)$/.test(stackMatch[2]) ||
        /^Adrenaline Stage/.test(stackMatch[2]) ||
        row.find("sub").length)
    )
      baseLabel = stackMatch[2];
    let label = conversion
      ? `${localize(conversion[2], map)}转化为${localize(conversion[1], map)}的比例`
      : localize(baseLabel, map);
    const boon = row
      .find('a[href^="/wiki/"]')
      .toArray()
      .map((a) => $(a).attr("href").slice(6))
      .find((t) => effectNames.has(t));
    if (/^\d*\s*Boon on Trap Trigger$/.test(baseLabel)) {
      baseLabel = baseLabel.replace(/^\d+\s*/, "");
      label = `陷阱触发 · ${localize(boon || "Boon", map)}`;
    }
    if (baseLabel === "Conditions on Stealth Attack" && boon)
      label = `潜行攻击 · ${localize(boon, map)}`;
    if (/Artifact Boons$/.test(baseLabel) && boon)
      label += ` · ${localize(boon, map)}`;
    if (
      /^(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Final) Pulse$/.test(
        baseLabel,
      ) &&
      boon
    )
      label += ` · ${localize(boon, map)}`;
    const info = { label, detail: "" };
    const matchingFact = english.facts.find((f) =>
      [f.text, f.status].some(
        (v) => normalized(v || "") === normalized(baseLabel),
      ),
    );
    const matchingFacts = english.facts.filter((f) =>
      [f.text, f.status, f.target].some(
        (v) => normalized(v || "") === normalized(baseLabel),
      ),
    );
    if (matchingFact?.icon?.startsWith("https://render.guildwars2.com/"))
      info.icon = matchingFact.icon;
    const heal = formulas.find((s) =>
      /^[\d,.]+\s*\+\s*[\d.]+\s*\*\s*Healing Power$/.test(s),
    );
    if (heal) {
      const [, base, coefficient] = heal.match(
        /^([\d,.]+)\s*\+\s*([\d.]+)\s*\*/,
      );
      info.healing = { base: number(base), coefficient: number(coefficient) };
      info.detail = `${number(base)} + ${number(coefficient)} × 治疗效果`;
      compare(
        baseLabel,
        "healing-base",
        number(base),
        matchingFacts.map((f) => f.value),
      );
    } else if (duration) {
      const count = lhs.match(/^(\d+)\s*/)?.[1];
      info.detail = `${duration[1]} 秒`;
      compare(
        baseLabel,
        "duration",
        number(duration[1]),
        matchingFacts.map((f) => f.duration),
      );
      if (
        (intensity.has(baseLabel) ||
          intensity.has(boon) ||
          /(?:Stability|Vulnerability|Might|Bleeding)$/.test(baseLabel) ||
          /^Adrenaline Stage/.test(baseLabel) ||
          row.find("sub").length) &&
        count
      ) {
        info.stacks = +count;
        info.detail += ` · ${count} 层`;
      }
      const explicitBonus =
        /^Active (?:Power Increase|Bonus)$|^Adrenaline Stage/.test(baseLabel);
      const bonus = localize(
        explicitBonus
          ? rhs
          : rhs
              .split(",")
              .filter((s) => s.includes("%"))
              .map((s) => s.trim())
              .join(", "),
        map,
      );
      if (
        (rhs.includes("%") || explicitBonus) &&
        bonus &&
        !/[a-z]/i.test(bonus)
      )
        info.detail += ` · ${bonus}`;
      // Status descriptions often contain current-stat damage/healing examples; duration and stacks are authoritative here.
    } else if (
      formulas.some((s) => /^[\d,.]+\s*\+\s*[\d.]+\s*\*\s*Power$/.test(s))
    ) {
      const formula = formulas.find((s) =>
        /^[\d,.]+\s*\+\s*[\d.]+\s*\*\s*Power$/.test(s),
      );
      const [, base, coefficient] = formula.match(
        /^([\d,.]+)\s*\+\s*([\d.]+)\s*\*/,
      );
      info.detail = `${number(base)} + ${number(coefficient)} × 威力`;
      compare(
        baseLabel,
        "siphon-base",
        number(base),
        matchingFacts.map((f) => f.value),
      );
    } else if (formulas.some((s) => /weapon strength/i.test(s))) {
      const multiplier = rhs.match(/\(([\d.]+)\)/)?.[1];
      if (!multiplier) {
        skipped.push(text);
        return;
      }
      info.detail = `系数 ×${multiplier}`;
      compare(
        baseLabel,
        "damage-coefficient",
        number(multiplier),
        matchingFacts.map((f) => f.dmg_multiplier),
      );
      const hits = lhs.match(/\((\d+)x\)/)?.[1];
      if (hits) info.detail += ` · ${hits} 次命中`;
      label = label.replace(/\s*\(\d+x\)/, "");
      info.label = label;
    } else {
      info.detail = localize(rhs, map);
      if (baseLabel === "Confusion" && /Damage on Skill Use/.test(rhs))
        info.detail = "每秒造成症状伤害；目标使用技能时造成额外伤害";
      if (baseLabel === "Torment" && /Foe Is Stationary/.test(rhs))
        info.detail = "每秒造成症状伤害；目标静止时伤害提高";
      if (/^[\d.]+s$/.test(info.detail))
        info.detail = info.detail.slice(0, -1) + " 秒";
      if (/^[+−-]?[\d,.]+%?$/.test(rhs))
        compare(
          baseLabel,
          "value",
          number(rhs.replace(/%$/, "").replace("−", "-")),
          matchingFacts.map((f) => f.percent ?? f.value ?? f.distance),
        );
    }
    if (heal && duration) {
      info.detail += ` · ${duration[1]} 秒`;
      if (stackMatch && /^Adrenaline Stage/.test(baseLabel)) {
        info.stacks = +stackMatch[1];
        info.detail += ` · ${stackMatch[1]} 层`;
      }
    }
    if (baseLabel === "Required Boon") info.detail = localize(boon || "", map);
    const attunement = row.find('a[href$="_Attunement"]').first().attr("href");
    const attunementLabel = {
      "/wiki/Fire_Attunement": "火焰协调",
      "/wiki/Water_Attunement": "流水协调",
      "/wiki/Air_Attunement": "空气协调",
      "/wiki/Earth_Attunement": "大地协调",
    }[attunement];
    if (attunementLabel) {
      info.label = attunementLabel + (label.trim() ? ` · ${label}` : "");
      label = info.label;
    }
    const formLink = row.find(
      'a[href="/wiki/Celestial_Avatar"],a[href*="_(Celestial_Avatar)"],a[href*="_(non-celestial)"]',
    );
    if (
      kind === "skill" &&
      english.name.startsWith("Glyph of") &&
      (formLink.length || row.find('img[alt="Blank.png"]').length)
    ) {
      info.label = formLink
        .toArray()
        .some((a) => /Celestial_Avatar/.test($(a).attr("href")))
        ? "天界化身形态"
        : "非天界化身形态";
      label = info.label;
      info.detail = localize(rhs || text, map);
    }
    // Chant facts are grouped by motivation tier in separate definition lists.
    // Retain that context even when the heading has a spelling-only Wiki annotation.
    const group = plain($(node).closest("dl").children("dd").first().text())
      .replace(/\[sic\]/g, "")
      .match(/^(\d+-\d+)\s*Motivation:/);
    if (group && !/^\d+-\d+ Motivation$/.test(baseLabel)) {
      info.label = `${group[1]} 层士气 · ${info.label}`;
      label = info.label;
    }
    const attackGroup = plain(
      $(node).closest("dl").children("dd").first().text(),
    );
    if (
      /^(Ritualist|Preservation|Anguish|Wanderlust) Attack$/.test(
        attackGroup,
      ) &&
      baseLabel !== attackGroup
    ) {
      info.label = `${localize(attackGroup, map)} · ${info.label}`;
      label = info.label;
    }
    if (english.name === "Summon Spirits") {
      const spirit = $(node)
        .closest("dl")
        .prev("p")
        .find(
          'a[href="/wiki/Anguish"],a[href="/wiki/Wanderlust"],a[href="/wiki/Preservation"]',
        )
        .first()
        .attr("href");
      const recipient = {
        "/wiki/Anguish": "苦痛灵",
        "/wiki/Wanderlust": "流浪灵",
        "/wiki/Preservation": "庇护灵",
      }[spirit];
      if (recipient) {
        info.label = `${recipient} · ${info.label}`;
        label = info.label;
      } else if (baseLabel === "Defiance Break") {
        info.label = "流浪灵 · 蔑视伤害";
        label = info.label;
      }
    }
    const rawHits = lhs.match(/\((\d+)x\)/)?.[1];
    if (
      rawHits &&
      !formulas.some((s) => /weapon strength/i.test(s)) &&
      baseLabel === "Damage"
    )
      info.detail += ` · ${rawHits} 次命中`;
    if (stackMatch?.[2] === "Stack Threshold") {
      info.label = "层数阈值";
      label = info.label;
      info.detail = stackMatch[1] + " 层";
    }
    if (baseLabel === "Force of Will" && /\+X% Healing/.test(rhs))
      info.detail =
        localize(rhs.split(",")[0], map) + "；对其他盟友的治疗加成随体力变化";
    // Unknown language/expressions are retained in acquisition diagnostics, never guessed into Chinese UI.
    if (
      !/[\u4e00-\u9fff]/.test(label) ||
      /[a-z]/i.test(label + info.detail) ||
      (!info.detail && split >= 0)
    ) {
      skipped.push(text);
      return;
    }
    rows.push(info);
  };
  quote.find("dd").each((_, node) => {
    if (!$(node).find("dd").length) add(node);
  });
  const stats = pveOnly($, quote.find(".statistics").first());
  if (stats?.length) {
    // Recharge sits before its icon in the wiki tooltip header.
    for (const [href, label, unit] of [
      ["Recharge", kind === "trait" ? "内置冷却" : "冷却时间", " 秒"],
      ["Activation_time", "施法时间", " 秒"],
      ...(kind === "skill"
        ? [
            ["Energy", "能量消耗", ""],
            ["Energy#Upkeep", "能量维持消耗", ""],
            ["Initiative", "先攻值消耗", ""],
          ]
        : []),
    ]) {
      const statIcon = stats.find(`a[href="/wiki/${href}"]`);
      if (!statIcon.length) continue;
      let previous = statIcon[0].prev,
        value = "";
      while (
        previous &&
        (previous.type === "text" || previous.name === "big")
      ) {
        value =
          (previous.type === "text" ? previous.data : $(previous).text()) +
          value;
        previous = previous.prev;
      }
      value = plain(value);
      if (/^[−-]?[\d.]+$/.test(value)) {
        rows.unshift({ label, detail: `${value}${unit}` });
        if (href === "Recharge")
          compare(
            "Recharge",
            "value",
            number(value),
            english.facts
              .filter((f) => f.type === "Recharge")
              .map((f) => f.value),
          );
      }
    }
  }
  let variants;
  let traitOverrides;
  const notes = [];
  const relatedSection = quote
    .nextAll("h2")
    .filter((_, e) => $(e).find("#Related_traits").length)
    .first()
    .nextUntil("h2");
  const relatedTraits = [
    ...new Set(
      relatedSection
        .find('a[href^="/wiki/"]')
        .toArray()
        .map((e) => {
          const title = decodeURIComponent(
            $(e).attr("href").slice(6).split("#")[0],
          );
          return traitLinks[title];
        })
        .filter(Boolean),
    ),
  ];
  if (kind === "trait" && id === 753) {
    for (const row of rows)
      if (row.label === "持续时间延长") row.label = "困惑持续时间";
  }
  if (kind === "trait" && id === 1866) {
    const mechanics = quote
      .nextAll("h2")
      .filter((_, e) => $(e).find("#Mechanics").length)
      .first();
    const section = mechanics.nextUntil("h2");
    const extra = [];
    const before = rows.length;
    section.find("dd").each((_, e) => add(e));
    extra.push(...rows.splice(before));
    const blades = extra.filter((r) => /灵刃治疗/.test(r.label));
    const crescendo = extra.filter((r) => /渐强治疗/.test(r.label));
    if (blades.length !== 5 || crescendo.length !== 1)
      throw Error("Restorative Illusions specialization mechanics incomplete");
    variants = [
      { specialization: 66, replaceHealing: true, rows: blades },
      { specialization: 73, rows: crescendo },
    ];
    notes.push("使用粉碎技能时立即触发治疗，无需等待分身实际粉碎。");
  }
  if (kind === "skill" && id === 10232) {
    const section = quote
      .nextAll("h2")
      .filter((_, e) => $(e).find("#Mechanics").length)
      .first()
      .nextUntil("h2");
    const note = section
      .find("li")
      .filter(
        (_, e) => $(e).find('a[href="/wiki/Blurred_Inscriptions"]').length,
      )
      .text();
    const count = note.match(/Boons Removed:\s*(\d+)/)?.[1];
    if (!count)
      throw Error("Missing Blurred Inscriptions boon-removal contract");
    traitOverrides = [
      { trait: 752, rows: [{ label: terms["Boons Removed"], detail: count }] },
    ];
  }
  if (review && reviewedRows.length !== review.rows.length)
    throw Error(`Reviewed Wiki row missing: ${kind}/${id}`);
  return {
    revision,
    rows,
    skipped,
    crossChecks,
    withheld,
    reviewedRows,
    ...(variants ? { variants } : {}),
    ...(traitOverrides ? { traitOverrides } : {}),
    ...(notes.length ? { notes } : {}),
    ...(relatedTraits.length ? { relatedTraits } : {}),
  };
}

export async function createWikiSnapshot({
  catalog,
  manifest,
  readHtml,
  descriptionCorrections,
  reviews,
}) {
  const names = Object.entries(manifest.entries).flatMap(([kind, entries]) =>
    Object.entries(entries).map(([id, en]) => [
      en.name,
      catalog[kind].find((e) => e.id === +id)?.name || en.name,
    ]),
  );
  const traitLinks = Object.fromEntries(
    Object.entries(manifest.entries.traits).map(([id, e]) => [e.title, +id]),
  );
  const snapshot = {
    schema: 1,
    mode: "pve",
    professions: manifest.professions || ["Mesmer"],
    generatedAt: new Date().toISOString(),
    mirror: "https://wiki.wishingstar.top",
    specializationTraits: Object.fromEntries(
      catalog.specs
        .filter((s) =>
          (manifest.professions || ["Mesmer"]).includes(s.profession),
        )
        .map((s) => [
          s.id,
          catalog.traits
            .filter((t) => t.specialization === s.id)
            .map((t) => t.id),
        ]),
    ),
    entries: { traits: {}, skills: {} },
    coverage: {},
  };
  for (const [plural, entries] of Object.entries(manifest.entries)) {
    let skipped = 0;
    for (const [id, english] of Object.entries(entries)) {
      const chinese = catalog[plural].find((e) => e.id === +id);
      const html = await readHtml(plural, id);
      let parsed;
      try {
        if (html.includes("GW2_WIKI_HTTP_404"))
          throw Error("Wiki identity mismatch: article returned HTTP 404");
        parsed = parseWikiPage(html, {
          kind: plural === "traits" ? "trait" : "skill",
          id: +id,
          english,
          chinese,
          names,
          traitLinks,
          review: reviews?.entries?.[plural]?.[id],
        });
      } catch (error) {
        // Do not alias activation/charge IDs to a wiki effect ID by name alone.
        if (!error.message.startsWith("Wiki identity mismatch")) throw error;
        parsed = {
          revision: Number(html.match(/"wgRevisionId":(\d+)/)?.[1]) || 0,
          rows: [],
          skipped: [],
          crossChecks: [],
          identityVerified: false,
          identityIssue: error.message,
          ...(html.includes("GW2_WIKI_HTTP_404")
            ? { pageUnavailable: true }
            : {}),
        };
      }
      skipped += parsed.skipped.length;
      const correction = descriptionCorrections?.entries?.[plural]?.[id];
      if (correction) {
        if (parsed.identityVerified === false)
          throw Error(`Unverified description identity: ${plural}/${id}`);
        if (correction.revision !== parsed.revision)
          throw Error(
            `Review Chinese Wiki description for new revision: ${plural}/${id}`,
          );
        parsed.description = correction.description;
      }
      if (parsed.relatedTraits)
        parsed.selectedTraitNotes = parsed.relatedTraits.map((id) => {
          const trait = catalog.traits.find((t) => t.id === id);
          return {
            id,
            name: trait.name,
            description:
              snapshot.entries.traits[id]?.description || trait.description,
          };
        });
      snapshot.entries[plural][id] = {
        title: english.title,
        profession:
          plural === "traits"
            ? catalog.specs.find((s) => s.id === chinese.specialization)
                ?.profession
            : chinese.professions?.find((p) =>
                (manifest.professions || ["Mesmer"]).includes(p),
              ),
        identityVerified: true,
        ...parsed,
      };
    }
    snapshot.coverage[plural] = {
      pages: Object.keys(entries).length,
      verifiedPages: Object.values(snapshot.entries[plural]).filter(
        (e) => e.identityVerified,
      ).length,
      withFacts: Object.values(snapshot.entries[plural]).filter(
        (e) => e.rows.length,
      ).length,
      skippedRows: skipped,
    };
  }
  snapshot.professionCoverage = Object.fromEntries(
    snapshot.professions.map((p) => [
      p,
      Object.fromEntries(
        ["traits", "skills"].map((k) => {
          const entries = Object.values(snapshot.entries[k]).filter(
            (e) => e.profession === p,
          );
          return [
            k,
            {
              pages: entries.length,
              verifiedPages: entries.filter((e) => e.identityVerified).length,
              withFacts: entries.filter((e) => e.rows.length).length,
              skippedRows: entries.reduce((n, e) => n + e.skipped.length, 0),
            },
          ];
        }),
      ),
    ]),
  );
  return snapshot;
}
