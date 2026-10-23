import { loadBuild, downloadBuild, reloadBuild } from "./build-fixtures";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  createBuild,
  encodeShare,
  decodeShare,
  type Build,
} from "../src/domain";

const value = (page: Page, key: string) =>
  page.locator(`[data-value="${key}"]`);
function fixture(sigils: [number | null, number | null]): Build {
  const b = createBuild("Mesmer");
  b.name = "法印本地验收";
  Object.assign(b.equipment.weapon1, { weapon: "Staff", sigils });
  Object.assign(b.equipment.weapon2, { weapon: "Staff", sigils: [null, null] });
  b.skills[1] = 10232;
  b.skills[4] = 29519;
  return b;
}
async function seed(page: Page, b: Build) {
  await loadBuild(page, b);
  await expect(value(page, "Healing")).toBeVisible();
}

test("生命与亲善层数互斥，食物/油联动；保存下载不携带预览", async ({
  page,
}) => {
  const b = fixture([24582, 24584]);
  b.food = 91690;
  b.utility = 99842;
  await seed(page, b);
  await page.locator(".attribute-effects summary").click();
  const life = page.getByLabel("预览超级生命法印层数", { exact: true });
  const benevolence = page.getByLabel("预览超级亲善法印层数", { exact: true });
  await life.fill("25");
  await expect(value(page, "Healing")).toHaveText("350");
  await expect(value(page, "OutgoingHealing")).toHaveText("12.66%");
  await benevolence.fill("25");
  await expect(life).toHaveValue("0");
  await expect(value(page, "Healing")).toHaveText("100");
  await expect(value(page, "OutgoingHealing")).toHaveText("23.66%");
  await page
    .getByRole("button", { name: "查看对盟友治疗加成来源", exact: true })
    .click();
  await expect(page.locator(".attribute-breakdown")).toContainText(
    "超级亲善法印 · 25层",
  );

  const saved = await downloadBuild(page);
  expect(saved.version).toBe(1);
  expect(saved.equipment.weapon1.sigils).toEqual([24582, 24584]);
  expect(saved).not.toHaveProperty("stacks");
  expect(saved).not.toHaveProperty("outgoingHealingBonus");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 BD", exact: true }).click();
  expect(
    JSON.parse(readFileSync((await (await download).path())!, "utf8")),
  ).toEqual(saved);
  await reloadBuild(page);
  await expect(value(page, "OutgoingHealing")).toHaveText("11.16%");
});

test("群星九属性和恶魔时长立即计算，切换武器恢复", async ({ page }) => {
  await seed(page, fixture([86170, 24583]));
  await expect(value(page, "Torment")).toHaveText("20.00%");
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览超级群星法印层数", { exact: true }).fill("25");
  await expect(value(page, "Power")).toHaveText("1,050");
  await expect(value(page, "Healing")).toHaveText("50");
  await expect(value(page, "BoonDuration")).toHaveText("50");
  await expect(value(page, "Torment")).toHaveText("23.33%");
  await page.getByLabel("属性预览武器组").selectOption("2");
  await expect(value(page, "Healing")).toHaveText("0");
  await expect(value(page, "Power")).toHaveText("1,000");
  await expect(
    page.getByLabel("预览超级群星法印层数", { exact: true }),
  ).toHaveCount(0);
});

test("瘫痪技能详情与Markdown引用联动，已打开详情随武器切换恢复", async ({
  page,
}) => {
  const b = fixture([24639, 24639]);
  b.description = "[支配](gw2:skill/10232) [谦逊](gw2:skill/29519)";
  let upstream = 0;
  page.on("request", (r) => {
    if (/wiki\.(wishingstar\.top|guildwars2\.com)/.test(r.url())) upstream++;
  });
  await seed(page, b);
  await expect(value(page, "ControlDuration")).toHaveText("30.00%");
  const icon = page.locator('.skill-list [data-game-detail="skill-10232"]');
  await icon.focus();
  await icon.press("F1");
  const card = page.getByRole("dialog", { name: "支配纹章", exact: true });
  await expect(
    card.locator("li").filter({ hasText: /^昏迷/ }).locator("strong"),
  ).toHaveText("2.6 秒");
  await expect(
    card
      .locator("li")
      .filter({ hasText: /蔑视伤害/ })
      .locator("strong"),
  ).toHaveText("260");
  await expect(card).toContainText("基础 200 × (1 + 30%)");
  await expect(card).toContainText("控制时长与蔑视伤害已计入瘫痪法印");
  await page.getByLabel("属性预览武器组").selectOption("2");
  await expect(
    card
      .locator("li")
      .filter({ hasText: /蔑视伤害/ })
      .locator("strong"),
  ).toHaveText("200");
  await page.keyboard.press("Escape");
  await page.getByLabel("属性预览武器组").selectOption("1");
  await page.getByRole("tab", { name: "预览", exact: true }).click();
  await page
    .getByRole("region", { name: "BD描述预览" })
    .getByRole("button", { name: "谦逊", exact: true })
    .click();
  const humility = page.getByRole("dialog", { name: "谦逊纹章", exact: true });
  await expect(
    humility
      .locator("li")
      .filter({ hasText: /蔑视伤害/ })
      .locator("strong"),
  ).toHaveText("455");
  await expect(humility).not.toContainText("效果记录待核对");
  expect(upstream).toBe(0);
});

test("转移/隔离/远见按当前组预览，清除条件恢复基础属性", async ({ page }) => {
  const b = fixture([84505, 24600]);
  b.equipment.weapon2.sigils = [74326, null];
  await seed(page, b);
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览隔离法印效果生效中", { exact: true }).check();
  await page.getByLabel("预览远见法印效果生效中", { exact: true }).check();
  await expect(value(page, "Precision")).toHaveText("1,250");
  await expect(value(page, "CritDamage")).toHaveText("250");
  await expect(value(page, "CriticalChance")).toHaveText("16.90%");
  await expect(page.locator(".attribute-panel")).toContainText(
    "可暴击攻击必定暴击",
  );
  await page.getByLabel("属性预览武器组").selectOption("2");
  await expect(value(page, "OutgoingHealing")).toHaveText("10.00%");
  await expect(value(page, "Precision")).toHaveText("1,000");
  await expect(
    page.getByLabel("预览隔离法印效果生效中", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("属性预览武器组").selectOption("1");
  await page.getByRole("button", { name: "清除预览条件", exact: true }).click();
  await expect(value(page, "Precision")).toHaveText("1,000");
  await expect(
    page.getByLabel("预览远见法印效果生效中", { exact: true }),
  ).not.toBeChecked();
});

test("390px旧版1只读分享计算瘫痪与治疗法印，刷新与预览不改链接", async ({
  page,
}) => {
  const b = fixture([24639, 74326]);
  b.food = 91690;
  b.utility = 99842;
  b.description = "[支配](gw2:skill/10232)";
  const hash = "#build=" + encodeShare(b);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/" + hash);
  await expect(value(page, "OutgoingHealing")).toHaveText("21.16%");
  await page.locator('.skill-list [data-game-detail="skill-10232"]').click();
  const card = page.getByRole("dialog", { name: "支配纹章", exact: true });
  await expect(
    card
      .locator("li")
      .filter({ hasText: /蔑视伤害/ })
      .locator("strong"),
  ).toHaveText("260");
  await card.screenshot({ path: "test-results/sigil-control-mobile.png" });
  await page.keyboard.press("Escape");
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览激怒", { exact: true }).check();
  expect(new URL(page.url()).hash).toBe(hash);
  expect(decodeShare(hash.slice(7))).toEqual(b);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".attribute-panel")
    .screenshot({ path: "test-results/sigil-attributes-mobile.png" });
  await reloadBuild(page);
  await expect(value(page, "OutgoingHealing")).toHaveText("21.16%");
  await expect(value(page, "ControlDuration")).toHaveText("30.00%");
});

test("石蜥毒液石化/蔑视与描述引用随瘫痪联动，30秒毒液不延长且分享不变", async ({
  page,
}) => {
  const b = createBuild("Thief");
  Object.assign(b.equipment.weapon1, {
    weapon: "Staff",
    sigils: [24639, 24639],
  });
  Object.assign(b.equipment.weapon2, { weapon: "Staff", sigils: [null, null] });
  b.skills[4] = 13132;
  b.description = "[石化](gw2:skill/13132)";
  const hash = "#build=" + encodeShare(b);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/" + hash);
  await expect(value(page, "ControlDuration")).toHaveText("30.00%");
  await page.locator('.skill-list [data-game-detail="skill-13132"]').click();
  const card = page.getByRole("dialog", { name: "石蜥毒液", exact: true });
  const fact = (label: string) =>
    card
      .locator("li")
      .filter({ hasText: new RegExp(label + "：") })
      .locator("strong");
  await expect(fact("石化持续时间")).toHaveText("1.95 秒");
  await expect(fact("蔑视伤害")).toHaveText("195");
  await expect(fact("毒液持续时间")).toHaveText("30 秒");
  await expect(fact("目标数")).toHaveText("5");
  await card.screenshot({
    path: "test-results/basilisk-paralyzation-mobile.png",
  });
  await page.keyboard.press("Escape");
  await page.getByLabel("属性预览武器组").selectOption("2");
  await page
    .getByRole("region", { name: "BD描述预览" })
    .getByRole("button", { name: "石化", exact: true })
    .click();
  await expect(fact("石化持续时间")).toHaveText("1.5 秒");
  await expect(fact("蔑视伤害")).toHaveText("150");
  await page.keyboard.press("Escape");
  expect(new URL(page.url()).hash).toBe(hash);
  await reloadBuild(page);
  await page.locator('.skill-list [data-game-detail="skill-13132"]').click();
  await expect(fact("石化持续时间")).toHaveText("1.95 秒");
});
