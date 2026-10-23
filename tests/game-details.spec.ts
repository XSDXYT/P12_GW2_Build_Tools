import { loadBuild, downloadBuild, reloadBuild } from "./build-fixtures";
import { test, expect, type Page } from "@playwright/test";
import { createBuild, encodeShare, type Build } from "../src/domain";

function fireBuild() {
  const b = createBuild("Elementalist");
  b.specs[0] = { id: 31, traits: [null, null, null] };
  return b;
}
async function seed(page: Page, b: Build) {
  await loadBuild(page, b);
  await expect(page.locator(".trait-lines")).toBeVisible();
}

test("灵感线按游戏槽位上下排列，目录乱序不影响位置、选择或版本1分享", async ({
  page,
}) => {
  const b = createBuild("Mesmer");
  b.specs[0] = { id: 23, traits: [738, 740, 1866] };
  // API bulk response order is not a display-order contract.
  await page.route("**/catalog.json", async (route) => {
    const response = await route.fetch();
    const catalog = await response.json();
    catalog.traits.reverse();
    await route.fulfill({ response, json: catalog });
  });
  const expected = [
    "医者反馈",
    "咒语回复",
    "同情容貌",
    "聚能反馈",
    "自我回复",
    "迷幻大师",
    "精神防御",
    "幻象回复",
    "模糊铭文",
  ];
  const line = page.locator(".trait-line").first();
  const buttons = line.locator(".major-list button");
  const check = async () => {
    await expect(buttons).toHaveCount(9);
    expect(
      await buttons.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("aria-label")),
      ),
    ).toEqual(expected);
    const positions = await buttons.evaluateAll((nodes) =>
      nodes.map((n) => n.getBoundingClientRect().top),
    );
    for (const start of [0, 3, 6]) {
      expect(positions[start]).toBeLessThan(positions[start + 1]);
      expect(positions[start + 1]).toBeLessThan(positions[start + 2]);
    }
    for (const name of ["咒语回复", "自我回复", "幻象回复"])
      await expect(
        line.getByRole("button", { name, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
  };
  await seed(page, b);
  await check();
  await page.screenshot({
    path: "test-results/inspiration-order-desktop.png",
    fullPage: true,
  });
  await line.getByRole("button", { name: "医者反馈", exact: true }).click();

  expect((await downloadBuild(page)).specs[0].traits).toEqual([756, 740, 1866]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#build=" + encodeShare(b));
  await check();
  await page.keyboard.press("Escape");
  await line.scrollIntoViewIfNeeded();
  await line.screenshot({ path: "test-results/inspiration-order-mobile.png" });
  await reloadBuild(page);
  await check();
});

test("详情忽略打开前排队的视口滚动事件，实际滚动后仍关闭", async ({ page }) => {
  const b = createBuild("Engineer");
  b.specs[2] = { id: 57, traits: [null, null, null] };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#build=" + encodeShare(b));
  await page.getByRole("button", { name: "太阳聚镜", exact: true }).click();
  const card = page.getByRole("dialog", { name: "太阳聚镜", exact: true });
  await expect(card).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event("scroll")));
  await expect(card).toBeVisible();
  const before = await page.evaluate(() => scrollY);
  await page.evaluate(() => scrollBy(0, 50));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  await expect(card).toHaveCount(0);
});

test("再生始终显示；随后选择混沌线立即联动混沌执念且无重复选项", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-value="BoonDuration"]')).toBeVisible();
  await page.locator(".attribute-effects summary").click();
  const regeneration = page.getByLabel("预览拥有再生", { exact: true });
  await expect(regeneration).toHaveCount(1);
  await regeneration.check();
  await expect(page.locator('[data-value="BoonDuration"]')).toHaveText("0");
  await page
    .getByRole("button", { name: "选择第1条特性线：未选择", exact: true })
    .click();
  await page.getByRole("option", { name: /^混沌/ }).click();
  await expect(regeneration).toHaveCount(1);
  await expect(regeneration).toBeChecked();
  await expect(page.locator('[data-value="BoonDuration"]')).toHaveText("250");
  await expect(page.locator('[data-value="ConditionDuration"]')).toHaveText(
    "100",
  );
  await regeneration.uncheck();
  await expect(page.locator('[data-value="BoonDuration"]')).toHaveText("0");
  await expect(page.locator('[data-value="ConditionDuration"]')).toHaveText(
    "0",
  );
  await regeneration.check();

  const saved = await downloadBuild(page);
  expect(saved).not.toHaveProperty("flags");
  expect(saved).not.toHaveProperty("preview");
  await reloadBuild(page);
  await page.locator(".attribute-effects summary").click();
  await expect(regeneration).not.toBeChecked();
  await expect(page.locator('[data-value="BoonDuration"]')).toHaveText("0");
});

test("悬停特性展示图标描述与效果，移入浮层可阅读，Esc关闭且不修改BD", async ({
  page,
}) => {
  const b = fireBuild();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, b);
  const icon = page.getByRole("button", { name: "燃烧精准", exact: true });
  await icon.hover();
  const card = page.getByRole("dialog", { name: "燃烧精准", exact: true });
  await expect(card).toBeVisible();
  await expect(card).toContainText("你的暴击有几率施加燃烧");
  await expect(card).toContainText("内置冷却：5 秒");
  await expect(card).toContainText("33%");
  await expect(card).toContainText("3 秒 · 1 层");
  await expect(card).toContainText("持续时间延长：20%（燃烧）");
  await expect(card.locator(".game-tooltip-facts img").first()).toHaveAttribute(
    "src",
    /render.guildwars2.com/,
  );
  await card.getByRole("link", { name: "在中文维基查看 ↗" }).hover();
  await expect(card).toBeVisible();
  const bounds = await card.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(12);
  expect(bounds!.y).toBeGreaterThanOrEqual(12);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1280 - 11);
  await page.screenshot({
    path: "test-results/trait-tooltip-desktop.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(icon).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".build-caption")).toContainText("已就绪");
  expect(errors).toEqual([]);
});

test("剑术大师分别显示自身与盟友的PvE基础效果，不把8秒和4秒混为备选", async ({
  page,
}) => {
  const b = createBuild();
  b.specs[0].id = 1;
  await seed(page, b);
  await page.getByRole("button", { name: "剑术大师", exact: true }).hover();
  const card = page.getByRole("dialog", { name: "剑术大师", exact: true });
  await expect(card.locator(".game-tooltip-mode")).toHaveText("PvE");
  await expect(card.locator('[data-effect="personal-fury"]')).toContainText(
    "个人激怒：8 秒",
  );
  await expect(card.locator('[data-effect="personal-fury"]')).toContainText(
    "仅自身",
  );
  await expect(card.locator('[data-effect="allied-fury"]')).toContainText(
    "盟友激怒：4 秒",
  );
  await expect(card.locator('[data-effect="allied-fury"]')).toContainText(
    "附近至多 4 名队友（不含自身）",
  );
  await expect(card).toContainText("暴击率 +25%");
  await expect(card).toContainText("内置冷却：8 秒");
  await expect(card).not.toContainText("4 秒 / 8 秒");
  await expect(card.locator(".game-tooltip-unresolved")).toHaveCount(0);
  await expect(card).not.toContainText(/待核对|语义未核对|规则核对/);
  await expect(
    card.getByRole("link", { name: "在中文维基查看 ↗" }),
  ).toBeVisible();
  await card.screenshot({ path: "test-results/master-fencer-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card).toBeVisible();
  const bounds = await card.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(12);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(379);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(833);
  await card.screenshot({ path: "test-results/master-fencer-mobile.png" });
});

test("API混杂数值不会覆盖PvE特性，浮层不显示核对记录", async ({ page }) => {
  const b = createBuild("Guardian");
  b.specs[0].id = 49;
  await page.route("**/catalog.json", async (route) => {
    const response = await route.fetch();
    const catalog = await response.json();
    const trait = catalog.traits.find((t: any) => t.id === 557);
    trait.description = "获得增益效果。中文描述来自星岬岛。";
    trait.descriptionSource = "wishingstarmoye";
    trait.facts = [
      { type: "AttributeAdjust", target: "BoonDuration", value: 60 },
      { type: "AttributeAdjust", target: "BoonDuration", value: 9999 },
    ];
    await route.fulfill({ response, json: catalog });
  });
  await seed(page, b);
  await page.getByRole("button", { name: "荣耀法杖", exact: true }).hover();
  const card = page.getByRole("dialog", { name: "荣耀法杖", exact: true });
  await expect(card).toContainText("增益效果：+120");
  await expect(card).toContainText("中文描述来自星岬岛");
  await expect(card.locator(".game-tooltip-mode")).toHaveText("PvE");
  await expect(card).not.toContainText(/待核对|语义未完整核对|9999|：\+60/);
  await expect(card.locator("details")).toHaveCount(0);
});

test("幻术特性使用Wiki补齐基础效果并保留中文说明和来源入口", async ({
  page,
}) => {
  const b = createBuild();
  b.specs[0].id = 1;
  await seed(page, b);
  await page.getByRole("button", { name: "决斗戒律", exact: true }).hover();
  const card = page.getByRole("dialog", { name: "决斗戒律", exact: true });
  await expect(card).toContainText("打断敌人时，缩短手枪技能的冷却时间");
  await expect(card.locator(".game-tooltip-facts")).toHaveCount(1);
  await expect(card).toContainText("25%");
  await expect(card).toContainText("3 秒");
  await expect(
    card.getByRole("link", { name: "Wiki PvE 来源 ↗" }),
  ).toHaveAttribute("href", /wiki\.wishingstar\.top\/wiki\/Duelist/);
  await expect(card).not.toContainText(/待核对|语义未完整核对|暂无效果资料/);
  await expect(
    card.getByRole("link", { name: "在中文维基查看 ↗" }),
  ).toBeVisible();
});

test("敏捷浮层保留超载不同脉冲的触发阶段", async ({ page }) => {
  const b = createBuild("Elementalist");
  b.specs[0].id = 48;
  await seed(page, b);
  await page.getByRole("button", { name: "清澈奇点", exact: true }).hover();
  const card = page.getByRole("dialog", { name: "清澈奇点", exact: true });
  const rows = card.locator(".game-tooltip-facts li");
  await expect(rows.filter({ hasText: "敏捷：1 秒" })).toContainText(
    "超载脉冲",
  );
  await expect(rows.filter({ hasText: "敏捷：4.5 秒" })).toContainText(
    "超载最后一次脉冲",
  );
});

test("键盘聚焦显示次要特性详情，F1进入浮层，Esc恢复焦点", async ({ page }) => {
  const b = createBuild();
  b.specs[0].id = 45;
  await seed(page, b);
  const icon = page.getByRole("button", { name: "混沌执念", exact: true });
  await icon.focus();
  const card = page.getByRole("dialog", { name: "混沌执念", exact: true });
  await expect(card).toBeVisible();
  await expect(card).toContainText("增益效果：+250");
  await expect(card).toContainText("症状效果：+100");
  await icon.press("F1");
  await expect(card).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(icon).toBeFocused();
});

test("已选技能使用同一详情浮层，点击仍能打开技能选择器", async ({ page }) => {
  const b = createBuild();
  b.skills[1] = 10232;
  await seed(page, b);
  const icon = page.getByRole("button", {
    name: "选择通用一技能",
    exact: true,
  });
  await icon.hover();
  await expect(
    page.getByRole("dialog", { name: "支配纹章", exact: true }),
  ).toContainText("症状伤害提高");
  await icon.click();
  await expect(page.locator(".game-tooltip")).toHaveCount(0);
  await expect(page.locator(".picker")).toBeVisible();
  await expect(page.locator(".picker-heading")).toContainText("通用一技能");
});

test("只读分享可悬停和点击详情，特性选择不变", async ({ page }) => {
  const b = fireBuild();
  await page.goto("/#build=" + encodeShare(b));
  const icon = page.getByRole("button", { name: "燃烧精准", exact: true });
  await icon.click();
  await expect(
    page.getByRole("dialog", { name: "燃烧精准", exact: true }),
  ).toBeVisible();
  await expect(icon).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
});

test("触屏长按查看详情不会选中特性，卡片不超出屏幕", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await seed(page, fireBuild());
  const icon = page.getByRole("button", { name: "燃烧精准", exact: true });
  await icon.scrollIntoViewIfNeeded();
  await icon.dispatchEvent("pointerdown", {
    pointerType: "touch",
    pointerId: 1,
  });
  const card = page.getByRole("dialog", { name: "燃烧精准", exact: true });
  await expect(card).toBeVisible();
  await icon.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 1 });
  await icon.dispatchEvent("click");
  await expect(icon).toHaveAttribute("aria-pressed", "false");
  const bounds = await card.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(12);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(379);
  expect(bounds!.y).toBeGreaterThanOrEqual(12);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(833);
  await page.screenshot({ path: "test-results/trait-tooltip-mobile.png" });
  await card.getByRole("button", { name: "关闭技能与特性详情" }).tap();
  await expect(card).toHaveCount(0);
  await icon.tap();
  await expect(icon).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
