import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createBuild,
  encodeShare,
  decodeShare,
  issues,
  type Catalog,
} from "./domain.ts";
import {
  mergeSkillCatalog,
  weaponSkillSlots,
  followingSkills,
} from "./weapon-skills.ts";
import { referenceIndex, searchReferences } from "./build-references.ts";
import { gameDetails } from "./game-details.ts";

const original: Catalog = JSON.parse(
  readFileSync("public/catalog.json", "utf8"),
);
const snapshot = JSON.parse(readFileSync("public/weapon-skills.json", "utf8"));
const catalog = mergeSkillCatalog(original, snapshot.skills);
const skill = (id: number) => catalog.skills.find((s) => s.id === id)!;

test("独立武器目录按精确ID合并，保留原技能和版本1；所有根引用均存在", () => {
  assert.equal(
    new Set(catalog.skills.map((s) => s.id)).size,
    catalog.skills.length,
  );
  for (const entry of original.skills) assert.equal(skill(entry.id), entry);
  for (const p of catalog.professions)
    for (const w of Object.values(p.weapons) as any[])
      for (const s of w.skills) assert.ok(skill(s.id), `${p.id}:${s.id}`);
  assert.ok(
    searchReferences(referenceIndex(catalog), "Abstraction").some(
      (r) => r.entity.id === 72076,
    ),
  );
  const b = createBuild();
  b.equipment.weapon1.weapon = "Rifle";
  assert.deepEqual(decodeShare(encodeShare(b)), b);
  assert.deepEqual(issues(b, catalog), issues(b, original));
});
test("幻术步枪3展示成像分离；独立PvE详情排除竞争模式并支持治疗缩放", () => {
  const b = createBuild();
  b.equipment.weapon1.weapon = "Rifle";
  const slots = weaponSkillSlots(b, catalog, 1);
  assert.deepEqual(
    slots.map((s) => s?.id),
    [71892, 71897, 72005, 72007, 72008],
  );
  assert.deepEqual(
    followingSkills(slots[2]!, catalog, b).map((s) => s.skill.id),
    [72076],
  );
  const d = gameDetails(skill(72076), "skill", new Set(), {
    healingPower: 1000,
  });
  assert.equal(d.facts.find((f) => f.label === "治疗")?.scaling?.value, 3430);
  assert.equal(d.facts.find((f) => f.label === "目盲")?.detail, "5 秒");
  assert.equal(d.facts.find((f) => f.label === "伤害")?.detail, "系数 ×1.81");
});
test("盗贼长矛使用陆地两条完整三段链，潜袭及神射手变种独立条件", () => {
  const b = createBuild("Thief");
  b.equipment.weapon1.weapon = "Spear";
  const slots = weaponSkillSlots(b, catalog, 1);
  assert.deepEqual(
    slots.map((s) => s?.id),
    [73145, 73041, 72986, 72927, 72991],
  );
  assert.deepEqual(
    followingSkills(slots[1]!, catalog, b).map((s) => s.skill.id),
    [72896, 73076],
  );
  assert.deepEqual(
    followingSkills(slots[2]!, catalog, b).map((s) => s.skill.id),
    [73063, 72904],
  );
  assert.deepEqual(
    followingSkills(slots[0]!, catalog, b).map((s) => s.skill.id),
    [73005],
  );
  b.specs[2].id = 58;
  assert.deepEqual(
    followingSkills(slots[0]!, catalog, b).map((s) => s.skill.id),
    [73005, 72924],
  );
  assert.equal(
    gameDetails(skill(73076), "skill", new Set()).facts.find(
      (f) => f.label === "流血",
    )?.detail,
    "3.5 秒 · 1 层",
  );
});
test("盗贼双持按副手选择第三技能，双手武器忽略残留副手，武器组独立", () => {
  const b = createBuild("Thief");
  b.equipment.weapon1.weapon = "Dagger";
  b.equipment.offhand1.weapon = "Pistol";
  assert.equal(weaponSkillSlots(b, catalog, 1)[2]?.id, 13040);
  b.equipment.offhand1.weapon = "Dagger";
  assert.equal(weaponSkillSlots(b, catalog, 1)[2]?.id, 13006);
  b.equipment.offhand1.weapon = "";
  assert.equal(weaponSkillSlots(b, catalog, 1)[2]?.id, 13110);
  b.equipment.weapon2.weapon = "Spear";
  b.equipment.offhand2.weapon = "Pistol";
  assert.equal(weaponSkillSlots(b, catalog, 2)[2]?.id, 72986);
  assert.equal(weaponSkillSlots(b, catalog, 1)[3], undefined);
});
test("元素四协调和编织者主副协调分配正确；武器训练不强制装备原特长", () => {
  const b = createBuild("Elementalist");
  b.equipment.weapon1.weapon = "Dagger";
  b.equipment.offhand1.weapon = "Dagger";
  for (const a of ["Fire", "Water", "Air", "Earth"] as const)
    assert.ok(
      weaponSkillSlots(b, catalog, 1, a).every(
        (s) => s && s.attunement === a && !s.dual_attunement,
      ),
    );
  const water = weaponSkillSlots(b, catalog, 1, "Water");
  b.specs[2].id = 56;
  const mixed = weaponSkillSlots(b, catalog, 1, "Fire", "Water");
  assert.equal(mixed[0]?.attunement, "Fire");
  assert.ok([mixed[2]?.attunement, mixed[2]?.dual_attunement].includes("Fire"));
  assert.ok(
    [mixed[2]?.attunement, mixed[2]?.dual_attunement].includes("Water"),
  );
  assert.equal(mixed[3]?.id, water[3]?.id);
  assert.equal(mixed[4]?.id, water[4]?.id);
  assert.equal(weaponSkillSlots(b, catalog, 1, "Water", "Air")[2]?.id, 46140);
  b.specs[2].id = null;
  b.equipment.weapon1.weapon = "Sword";
  assert.equal(weaponSkillSlots(b, catalog, 1)[0]?.id, 39964);
});
test("九职业各合法陆地武器组合有根技能，后续图无循环且不恢复历史瘟疫变身", () => {
  const names = new Set([
    "Axe",
    "Dagger",
    "Mace",
    "Pistol",
    "Scepter",
    "Sword",
    "Focus",
    "Shield",
    "Torch",
    "Warhorn",
    "Greatsword",
    "Hammer",
    "Longbow",
    "Shortbow",
    "Rifle",
    "Staff",
    "Spear",
  ]);
  for (const p of catalog.professions)
    for (const [weapon, w] of Object.entries(p.weapons) as [string, any][]) {
      if (!names.has(weapon)) continue;
      const b = createBuild(p.id);
      const main = w.flags.includes("Mainhand") || w.flags.includes("TwoHand");
      if (main) b.equipment.weapon1.weapon = weapon;
      else b.equipment.offhand1.weapon = weapon;
      const slots = weaponSkillSlots(b, catalog, 1);
      for (const i of main
        ? w.flags.includes("TwoHand")
          ? [0, 1, 2, 3, 4]
          : [0, 1, 2]
        : [3, 4]) {
        assert.ok(slots[i], `${p.id} ${weapon} slot${i + 1}`);
        const stages = followingSkills(slots[i]!, catalog, b).map(
          (s) => s.skill.id,
        );
        assert.equal(new Set(stages).size, stages.length);
        assert.ok(!stages.includes(slots[i]!.id));
      }
    }
  const b = createBuild("Necromancer");
  assert.equal(followingSkills(skill(10549), catalog, b).length, 0);
});
