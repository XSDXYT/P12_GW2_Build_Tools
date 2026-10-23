import { test, expect, type Page } from "@playwright/test";
import { createBuild, encodeShare, type Build } from "../src/domain";
import { jadeCore, landPets, legendSkills } from "../src/profession-mechanics";
import { loadBuild, downloadBuild } from "./build-fixtures";

const slot = (page: Page, key: string) =>
  page.locator(`.profession-mechanics [data-mechanic-slot="${key}"] > button`);
function fixture(profession: Build["profession"], spec?: number) {
  const b = createBuild(profession);
  b.name = "职业机制验收";
  if (spec) b.specs[2].id = spec;
  return b;
}

test("工程腰带跟随治疗技能，流金形态可搜索、去重、留空并保存；换专精清理选择", async ({
  page,
}) => {
  const b = fixture("Engineer", 75);
  b.skills[0] = 5802;
  await loadBuild(page, b);
  await expect(slot(page, "F1")).toHaveAttribute(
    "data-game-detail",
    "skill-29772",
  );
  await slot(page, "F1").focus();
  await slot(page, "F1").press("F1");
  await expect(page.locator(".game-tooltip")).toHaveCount(1);
  const heal = page.getByRole("button", { name: "选择治疗技能", exact: true });
  await heal.focus();
  await heal.press("F1");
  await expect(page.locator(".game-tooltip")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await slot(page, "F2").click();
  await page.getByRole("option", { name: /^防护协议：保护/ }).click();
  await expect(slot(page, "F2")).toHaveAttribute(
    "data-game-detail",
    "skill-76959",
  );
  await slot(page, "F3").click();
  await expect(
    page.getByRole("option", { name: /^防护协议：保护/ }),
  ).toBeDisabled();
  await page.getByRole("option", { name: /^防护协议：净化/ }).click();
  let saved = await downloadBuild(page);
  expect(saved.mechanics?.morphs).toEqual([76959, 76798, null]);
  await page.getByRole("button", { name: "选择治疗技能", exact: true }).click();
  await page.getByRole("option", { name: /^H型试剂/ }).click();
  await expect(slot(page, "F1")).toHaveAttribute(
    "data-game-detail",
    "skill-6119",
  );
  await page.getByRole("button", { name: /选择第3条特性线/ }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("option", { name: /^全息师/ }).click();
  await expect(slot(page, "F5")).toHaveAttribute(
    "data-game-detail",
    "skill-42938",
  );
  saved = await downloadBuild(page);
  expect(saved.mechanics?.morphs).toBeUndefined();
  expect(saved.skills[0]).toBe(5834);
});

test("10级翠玉核心参与属性预览和来源，可下载与分享；旧文件不会默认加体力", async ({
  page,
  context,
}) => {
  await loadBuild(page, fixture("Mesmer"));
  await expect(page.locator('[data-value="Vitality"]')).toHaveText("1,000");
  await page.getByRole("button", { name: /^翠玉核心：/ }).click();
  await page.getByRole("option", { name: new RegExp(jadeCore.name) }).click();
  await expect(page.locator('[data-value="Vitality"]')).toHaveText("1,235");
  await page.getByRole("button", { name: "查看体力来源", exact: true }).click();
  await expect(page.locator(".attribute-breakdown")).toContainText(
    "10 级翠玉核心",
  );
  await page.getByRole("button", { name: "关闭属性来源", exact: true }).click();
  const b = await downloadBuild(page);
  expect(b.jadeBotCore).toBe(96613);
  const shared = await context.newPage();
  await shared.goto("/#build=" + encodeShare(b));
  await expect(shared.locator('[data-value="Vitality"]')).toHaveText("1,235");
  await shared.reload();
  await expect(shared.locator('[data-value="Vitality"]')).toHaveText("1,235");
});

test("游侠宠物搜索和魂兽合体联动，状态不保存，普通宠物与合体详情不混算", async ({
  page,
}) => {
  const b = fixture("Ranger", 55);
  b.mechanics = { pets: [5, 73] };
  b.jadeBotCore = 96613;
  await loadBuild(page, b);
  await expect(slot(page, "F2")).toHaveAttribute(
    "data-game-detail",
    "skill-12666",
  );
  await slot(page, "F5").click();
  await expect(slot(page, "F1")).toHaveAttribute(
    "data-game-detail",
    "skill-43136",
  );
  await expect(page.locator('[data-value="Vitality"]')).toHaveText("1,335");
  await page.keyboard.press("Escape");
  await page
    .locator('[aria-label="当前宠物预览"]')
    .getByRole("button", { name: "宠物 2", exact: true })
    .click();
  await expect(slot(page, "F1")).toHaveAttribute(
    "data-game-detail",
    "skill-80035",
  );
  await expect(page.locator(".build-caption")).not.toContainText("尚未保存");
  expect(await downloadBuild(page)).toEqual(b);
  await page.getByRole("button", { name: /选择陆地宠物1/ }).click();
  const petName = landPets.find((p) => p.id === 46)!.name;
  await page.getByRole("searchbox").fill(petName);
  await page.getByRole("option", { name: new RegExp(`^${petName}`) }).click();
  const saved = await downloadBuild(page);
  expect(saved.mechanics?.pets).toEqual([46, 73]);
});

test("元素机制图标切协调及编织者副协调；唤元特长元素限制生效，预览不写入", async ({
  page,
}) => {
  const b = fixture("Elementalist", 56);
  b.equipment.weapon1.weapon = "Sword";
  await loadBuild(page, b);
  await slot(page, "F3").click();
  await expect(page.getByLabel("技能主协调", { exact: true })).toHaveValue(
    "Air",
  );
  await expect(page.getByLabel("技能副协调", { exact: true })).toHaveValue(
    "Fire",
  );
  expect(await downloadBuild(page)).toEqual(b);
  const evoker = fixture("Elementalist", 80);
  evoker.mechanics = { familiar: "Water" };
  evoker.specs[2].traits[2] = 2437;
  await loadBuild(page, evoker);
  await expect(page.getByLabel("技能主协调", { exact: true })).toHaveValue(
    "Water",
  );
  await page.getByLabel("技能主协调", { exact: true }).selectOption("Fire");
  await expect(page.getByLabel("技能主协调", { exact: true })).toHaveValue(
    "Water",
  );
  await expect(slot(page, "F5")).toHaveAttribute(
    "data-game-detail",
    "skill-77225",
  );
});

test("传奇切换预览同步F2和技能组合，第二传奇预览不污染保存", async ({
  page,
}) => {
  const b = fixture("Revenant", 79);
  b.mechanics = { legends: [76610, 28134] };
  b.skills = legendSkills(76610);
  await loadBuild(page, b);
  await expect(slot(page, "F2")).toHaveAttribute(
    "data-game-detail",
    "skill-78661",
  );
  await page
    .locator('[aria-label="当前传奇预览"]')
    .getByRole("button", { name: "传奇 2", exact: true })
    .click();
  await expect(slot(page, "F2")).toHaveAttribute(
    "data-game-detail",
    "skill-78845",
  );
  await expect(
    page.locator('.skills-bar [aria-label="选择治疗技能"]'),
  ).toHaveAttribute("data-game-detail", "skill-26937");
  expect(await downloadBuild(page)).toEqual(b);
});

test("宠物与新机制技能可在Markdown引用，手机界面保持两面板及描述在最后", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const b = fixture("Ranger", 72);
  b.mechanics = { pets: [5, 73] };
  b.description = "[幼龄河獭](gw2:pet/73) 与 [防护协议](gw2:skill/76959)";
  await page.goto("/#build=" + encodeShare(b));
  await expect(page.locator(".profession-mechanics")).toBeVisible();
  await expect(slot(page, "F1")).toHaveAttribute(
    "data-game-detail",
    "skill-12686",
  );
  await page
    .locator(".build-reference")
    .filter({ hasText: "幼龄河獭" })
    .click();
  await expect(page.locator(".game-tooltip")).toContainText("魂兽类型");
  await page
    .getByRole("button", { name: "关闭技能与特性详情", exact: true })
    .click();
  await slot(page, "F5").click();
  await expect(slot(page, "F1")).toHaveAttribute(
    "data-game-detail",
    "skill-63209",
  );
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await page.locator("main .panel").count()).toBe(2);
  await page
    .locator(".profession-mechanics")
    .screenshot({ path: "test-results/profession-mechanics-mobile.png" });
});
