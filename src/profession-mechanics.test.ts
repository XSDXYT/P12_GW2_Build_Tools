import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createBuild,
  parseBuild,
  encodeShare,
  decodeShare,
  issues,
  type Build,
  type Catalog,
} from "./domain.ts";
import { mergeSkillCatalog } from "./weapon-skills.ts";
import {
  mergeMechanicCatalog,
  mechanicSlots,
  emptyMechanicPreview,
  normalizeMechanics,
  landPets,
  morphIds,
  legendSkills,
} from "./profession-mechanics.ts";
import { calculateAttributes, type AttributeData } from "./attributes.ts";
import { gameDetails } from "./game-details.ts";
import { referenceIndex, parseReference } from "./build-references.ts";
import { petNaturalCommands } from "./pet-skills.ts";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const catalog: Catalog = mergeMechanicCatalog(
  mergeSkillCatalog(
    read("public/catalog.json"),
    read("public/weapon-skills.json").skills,
  ),
);
const attributes: AttributeData = read("public/attribute-data.json");
function build(profession: Build["profession"], elite?: number) {
  const b = createBuild(profession);
  if (elite) b.specs[2] = { id: elite, traits: [null, null, null] };
  return b;
}
const ids = (
  b: Build,
  preview = emptyMechanicPreview(),
  weaponSet: 1 | 2 = 1,
  att = "Fire",
) =>
  mechanicSlots(b, catalog, preview, weaponSet, att).map(
    (slot) => slot.skill?.id,
  );

test("医疗包、炮台腰带按来源派生，机械师/全息师替换F5，玉偃师不保留腰带", () => {
  const b = build("Engineer");
  b.skills = [5802, 5818, 5836, 5837, null];
  assert.deepEqual(ids(b), [29772, 6178, 6181, 6179, undefined]);
  b.skills[0] = 5834;
  assert.equal(ids(b)[0], 6119);
  b.specs[2].id = 43;
  assert.equal(ids(b)[4], 56920);
  b.specs[2].id = 57;
  assert.equal(ids(b)[4], 42938);
  b.specs[2] = { id: 70, traits: [2282, 2276, 2281] };
  assert.deepEqual(ids(b), [63334, 63293, 63141, 63050]);
  b.specs[2].traits = [null, null, null];
  assert.deepEqual(ids(b), [undefined, undefined, undefined, 63050]);
});

test("流金七个形态可留空但不可重复，F1随治疗变化，F5按双重螺旋改变", () => {
  assert.equal(morphIds.length, 7);
  const b = build("Engineer", 75);
  b.skills[0] = 5802;
  b.mechanics = { morphs: [76959, 76798, 77163] };
  assert.deepEqual(ids(b), [29772, 76959, 76798, 77163, 76642]);
  b.specs[2].traits[2] = 2334;
  assert.equal(ids(b)[4], 76651);
  assert.deepEqual(issues(b, catalog), []);
  b.mechanics.morphs = [76959, 76959, null];
  assert.match(issues(b, catalog).join(), /重复/);
  b.mechanics.morphs = [null, null, null];
  assert.deepEqual(issues(b, catalog), []);
  b.specs[2].id = 57;
  normalizeMechanics(b, catalog);
  assert.equal(b.mechanics, undefined);
});

test("62个陆地宠物排除水生物种，多技能宠物不按API数组第一项选陆地技能", () => {
  assert.equal(landPets.length, 62);
  for (const id of [21, 40, 41, 42, 43])
    assert.equal(
      landPets.some((p) => p.id === id),
      false,
    );
  assert.deepEqual(landPets.find((p) => p.id === 23)!.skills, [12685]);
  assert.deepEqual(landPets.find((p) => p.id === 26)!.skills, [12674]);
  const b = build("Ranger");
  b.mechanics = { pets: [23, 26] };
  assert.deepEqual(issues(b, catalog), []);
  b.mechanics.pets = [21, null];
  assert.match(issues(b, catalog).join(), /宠物选择无效/);
  b.mechanics.pets = [23, 23];
  assert.match(issues(b, catalog).join(), /不同的陆地宠物/);
});

test("魂兽合体区分宠物与玩家技能，泥浆兽、白虎及新增三宠采用各自映射", () => {
  const b = build("Ranger", 55);
  const p = { ...emptyMechanicPreview(), transformed: true };
  for (const [pet, expected] of [
    [5, [43136, 43060, 44626]],
    [63, [40625, 67382, 45797]],
    [64, [41406, 64882, 44626]],
    [72, [79203, 78091, 43375]],
    [73, [80035, 80031, 44626]],
    [74, [81024, 80985, 43375]],
  ] as const) {
    b.mechanics = { pets: [pet, null] };
    assert.deepEqual(ids(b, p).slice(0, 3), [...expected]);
  }
});

test("狂兽自然技能与觉醒技能分开，API缺页不借用合体数值或虚构公开引用", () => {
  const b = build("Ranger", 72);
  b.mechanics = { pets: [5, 73] };
  assert.deepEqual(ids(b), [12686, 12666, 12665, undefined, 63344]);
  assert.deepEqual(ids(b, { ...emptyMechanicPreview(), transformed: true }), [
    63209,
    63258,
    63094,
    undefined,
    63147,
  ]);
  const pet = landPets.find((p) => p.id === 73)!;
  const natural = petNaturalCommands(pet, catalog);
  assert.equal(natural.length, 2);
  assert.equal(
    natural.every((s) => s.uiOnly && s.id < 0),
    true,
  );
  assert.equal(
    catalog.skills.some((s) => s.id < 0),
    false,
  );
  assert.equal(
    gameDetails(natural[0], "skill", new Set(), {
      healingPower: 2500,
      boonDuration: 100,
    }).facts.length,
    0,
  );
});

test("宠物与机甲详情不使用角色治疗、增益、症状和法印参数", () => {
  for (const id of [12670, 63293, 63141]) {
    const pet = catalog.skills.find((s) => s.id === id)!;
    const normal = gameDetails(pet, "skill", new Set());
    const buffed = gameDetails(pet, "skill", new Set([1099]), {
      healingPower: 2500,
      boonDuration: 100,
      conditionDuration: 100,
      controlDurationBonus: 30,
    });
    assert.deepEqual(buffed, normal);
    assert.equal(
      buffed.facts.some(
        (f) => f.scaling || f.equipmentScaling || f.durationScaling,
      ),
      false,
    );
  }
});

test("翠玉核心只加一次235体力，旧BD不默认装备；合体加成仅在预览并支持转换池", () => {
  const b = build("Ranger", 55);
  const base = calculateAttributes(b, catalog, attributes);
  assert.equal(base.primary.Vitality, 1000);
  b.jadeBotCore = 96613;
  b.mechanics = { pets: [5, 1] };
  const core = calculateAttributes(b, catalog, attributes);
  assert.equal(core.primary.Vitality, 1235);
  assert.equal(
    core.primarySources.Vitality.filter((s) => s.label.includes("翠玉核心"))
      .length,
    1,
  );
  const merged = calculateAttributes(b, catalog, attributes, 1, {
    might: 0,
    fury: false,
    flags: { soulbeastMerged: true },
    stacks: { activePet: 0 },
  });
  assert.equal(merged.primary.Vitality, 1335);
  assert.equal(merged.outgoingHealingBonus, 25);
  assert.equal(
    calculateAttributes(b, catalog, attributes).outgoingHealingBonus,
    0,
  );
});

test("元素四协调、过载、四元晶与魔宠不能混用，编织者保留独立第五槽", () => {
  assert.deepEqual(ids(build("Elementalist")), [5492, 5493, 5494, 5495]);
  assert.deepEqual(
    mechanicSlots(
      build("Elementalist", 48),
      catalog,
      emptyMechanicPreview(),
    ).flatMap((s) => s.following.map((s) => s.id)),
    [29706, 29415, 29719, 29618],
  );
  for (const [att, id] of Object.entries({
    Fire: 63396,
    Water: 62723,
    Air: 62940,
    Earth: 62837,
  }))
    assert.equal(
      ids(build("Elementalist", 67), emptyMechanicPreview(), 1, att)[4],
      id,
    );
  assert.equal(ids(build("Elementalist", 56))[4], 80231);
  const evoker = build("Elementalist", 80);
  evoker.mechanics = { familiar: "Water" };
  assert.equal(ids(evoker)[4], 77225);
});

test("九职业和36个精英特长显示真实槽数，不统一套五个腰带；战士爆发随武器组", () => {
  for (const s of catalog.specs.filter((s) => s.elite)) {
    const b = build(s.profession, s.id);
    b.equipment.weapon1.weapon = "Sword";
    const slots = mechanicSlots(b, catalog, emptyMechanicPreview());
    assert.ok(slots.length >= 1 && slots.length <= 5, s.name);
    assert.equal(new Set(slots.map((s) => s.key)).size, slots.length, s.name);
    assert.equal(
      slots.every((s) => !s.skill || typeof s.skill.name === "string"),
      true,
      s.name,
    );
  }
  assert.deepEqual(ids(build("Guardian", 27)), [29887, 30783, 30029]);
  assert.deepEqual(
    ids(build("Mesmer", 66)),
    [62617, 62616, 62602, 68273, 62597],
  );
  assert.deepEqual(
    ids(build("Necromancer", 60)),
    [44946, 40813, 43448, 44428, 44663],
  );
  assert.deepEqual(ids(build("Thief", 71)), [63067, 63155]);
  const warrior = build("Warrior", 18);
  warrior.equipment.weapon1.weapon = "Greatsword";
  warrior.equipment.weapon2.weapon = "Rifle";
  assert.equal(ids(warrior)[0], 14375);
  assert.equal(
    ids(warrior, { ...emptyMechanicPreview(), berserk: true }, 2)[0],
    29644,
  );
});

test("传奇只提供当前专精合法姿态，第二传奇派生，契灵F2按当前传奇变化，移除专精清理残留", () => {
  const b = build("Revenant", 79);
  b.mechanics = { legends: [76610, 28134] };
  b.skills = legendSkills(76610);
  assert.deepEqual(issues(b, catalog), []);
  assert.equal(ids(b)[1], 78661);
  assert.equal(
    ids(b, { ...emptyMechanicPreview(), activeLegend: 1 })[1],
    78845,
  );
  b.skills[1] = 27322;
  assert.match(issues(b, catalog).join(), /第一组传奇/);
  b.specs[2].id = null;
  normalizeMechanics(b, catalog);
  assert.deepEqual(b.mechanics?.legends, [null, 28134]);
  assert.deepEqual(b.skills, Array(5).fill(null));
});

test("新增配置沿用v1下载/导入/分享，旧BD不补字段，坏长度/负ID/未知核心拒绝", () => {
  const old = createBuild();
  assert.deepEqual(parseBuild(JSON.stringify(old)), old);
  assert.equal(
    Object.hasOwn(parseBuild(JSON.stringify(old)), "mechanics"),
    false,
  );
  for (const b of [
    Object.assign(build("Engineer", 75), {
      mechanics: { morphs: [76959, null, 77163] },
      jadeBotCore: 96613,
    }),
    Object.assign(build("Ranger", 55), { mechanics: { pets: [5, 73] } }),
  ]) {
    assert.deepEqual(parseBuild(JSON.stringify(b)), b);
    assert.deepEqual(decodeShare(encodeShare(b)), b);
  }
  for (const value of [
    { jadeBotCore: 1 },
    { mechanics: { pets: [-1, null] } },
    { mechanics: { pets: [5] } },
    { mechanics: { morphs: [null, null] } },
    { mechanics: { activePet: 1 } },
  ])
    assert.throws(() => parseBuild(JSON.stringify({ ...old, ...value })));
});

test("Markdown含新增机制技能、真实宠物与翠玉核心，内部UI键不可导出为引用", () => {
  const index = referenceIndex(catalog);
  assert.equal(
    index.some((r) => r.kind === "skill" && r.entity.id === 76959),
    true,
  );
  assert.equal(
    index.some((r) => r.kind === "item" && r.entity.id === 96613),
    true,
  );
  assert.equal(
    index.some((r) => r.kind === "pet" && r.entity.id === 73),
    true,
  );
  assert.equal(
    index.some((r) => r.entity.id < 0),
    false,
  );
  assert.deepEqual(parseReference("gw2:pet/73"), { kind: "pet", id: 73 });
  assert.equal(parseReference("gw2:skill/-7301"), undefined);
});
