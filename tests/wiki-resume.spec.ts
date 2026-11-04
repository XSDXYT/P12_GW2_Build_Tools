import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createBuild, encodeShare, type Catalog } from "../src/domain";
import { loadBuild, downloadBuild } from "./build-fixtures";

const catalog: Catalog = JSON.parse(
  readFileSync("public/catalog.json", "utf8"),
);
async function open(page: Page, selector: string) {
  const icon = page.locator(selector).first();
  await expect(icon).toBeVisible();
  await icon.focus();
  await icon.press("F1");
  const card = page.locator(".game-tooltip");
  await expect(card).toBeVisible();
  return card;
}

test("Wiki恢复：强力突破后续图标与Markdown共用独立PvE效果", async ({
  page,
}) => {
  const b = createBuild();
  b.name = "Wiki强力突破验收";
  b.equipment.weapon1.weapon = "Staff";
  b.skills[1] = 10237;
  b.description = "[强力突破](gw2:skill/10238)";
  const upstream: string[] = [];
  page.on("request", (r) => {
    if (/wiki\.(guildwars2\.com|wishingstar\.top)/.test(r.url()))
      upstream.push(r.url());
  });
  await loadBuild(page, b);
  await page.getByRole("button", { name: "展开后续技能", exact: true }).click();
  const card = await open(page, '[data-game-detail="skill-10238"]');
  await expect(card).toContainText("稳固：3 秒 · 3 层");
  await expect(card).toContainText("计数冷却时间：30 秒");
  await expect(card).toContainText("最大计数：2");
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "预览", exact: true }).click();
  const md = await open(
    page,
    '.build-reference[data-game-detail="skill-10238"]',
  );
  await expect(md).toContainText("稳固：3 秒 · 3 层");
  await expect(md).not.toContainText(/效果记录待核对|45 秒/);
  expect(upstream).toEqual([]);
});

test("Wiki恢复：风暴之魂与法印分别更新属性、引用及手机只读分享", async ({
  page,
  context,
}) => {
  const b = createBuild("Elementalist");
  b.name = "Wiki控制联动验收";
  b.equipment.weapon1.weapon = "Staff";
  b.equipment.weapon1.sigils[0] = 24639;
  const trait = catalog.traits.find((t) => t.id === 1502)!;
  b.specs[0].id = trait.specialization;
  b.description = "[静电场](gw2:skill/5671)";
  await loadBuild(page, b);
  await page.getByRole("tab", { name: "预览", exact: true }).click();
  let card = await open(
    page,
    '.build-reference[data-game-detail="skill-5671"]',
  );
  await expect(card).toContainText("昏迷：2.6 秒");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: trait.name, exact: true }).click();
  await expect(page.locator('[data-value="StunDuration"]')).toHaveText(
    "63.00%",
  );
  await expect(page.locator('[data-value="DazeDuration"]')).toHaveText(
    "30.00%",
  );
  card = await open(page, '.build-reference[data-game-detail="skill-5671"]');
  await expect(card).toContainText("昏迷：3.26 秒");
  await expect(card).toContainText("蔑视伤害：326");
  await page.keyboard.press("Escape");
  const saved = await downloadBuild(page);
  expect(saved.version).toBe(1);
  expect(Object.keys(saved)).not.toContain("stunDurationBonus");
  const readonly = await context.newPage();
  await readonly.setViewportSize({ width: 390, height: 844 });
  await readonly.goto("/#build=" + encodeShare(saved));
  await expect(readonly.locator('[data-value="StunDuration"]')).toHaveText(
    "63.00%",
  );
  const shared = await open(
    readonly,
    '.build-reference[data-game-detail="skill-5671"]',
  );
  await expect(shared).toContainText("昏迷：3.26 秒");
  await readonly.screenshot({
    path: "test-results/wiki-resume-control-mobile.png",
    fullPage: true,
  });
  await readonly.close();
});

test("Wiki恢复：游侠长弓特性点选和取消更新独立武器冷却", async ({ page }) => {
  const b = createBuild("Ranger");
  b.name = "Wiki长弓冷却验收";
  b.equipment.weapon1.weapon = "Longbow";
  const trait = catalog.traits.find((t) => t.id === 1698)!;
  b.specs[0].id = trait.specialization;
  await loadBuild(page, b);
  const selector = '.weapon-skill-list [data-game-detail="skill-12509"]';
  let card = await open(page, selector);
  await expect(card).toContainText("冷却时间：8 秒");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: trait.name, exact: true }).click();
  card = await open(page, selector);
  await expect(card).toContainText("冷却时间：6.4 秒");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: trait.name, exact: true }).click();
  card = await open(page, selector);
  await expect(card).toContainText("冷却时间：8 秒");
});
