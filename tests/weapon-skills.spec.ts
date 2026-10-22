import { test, expect, type Page } from "@playwright/test";
import {
  createBuild,
  armorSlots,
  encodeShare,
  type Build,
} from "../src/domain";
import { readFileSync } from "node:fs";

async function seed(page: Page, b: Build, readonly = false) {
  if (!readonly)
    await page.addInitScript(
      (b) => localStorage.setItem("p12.builds.v1", JSON.stringify([b])),
      b,
    );
  await page.goto(readonly ? `/#build=${encodeShare(b)}` : "/");
  await expect(page.locator('[data-value="Power"]')).toBeVisible();
  await expect(
    page.locator(".weapon-skill-list [data-game-detail]"),
  ).not.toHaveCount(0);
}
async function open(page: Page, id: number) {
  const button = page.locator(
    `.weapon-skill-list [data-game-detail="skill-${id}"]`,
  );
  await button.focus();
  await button.press("F1");
  await expect(page.locator(".game-tooltip")).toBeVisible();
  return page.locator(".game-tooltip");
}

test("步枪后续段独立详情和Markdown引用随装备时长变化，保存仍是版本1", async ({
  page,
}) => {
  const b = createBuild();
  b.name = "连段与时长验收";
  b.equipment.weapon1.weapon = "Rifle";
  b.equipment.weapon1.sigils = [72339, 44950];
  b.equipment.weapon2.weapon = "Rifle";
  for (const s of armorSlots) b.equipment[s].runeId = 24714;
  b.description = "[成像分离](gw2:skill/72076)";
  let upstream = 0;
  page.on("request", (r) => {
    if (/wiki\.(guildwars2\.com|wishingstar\.top)/.test(r.url())) upstream++;
  });
  await seed(page, b);
  const slot = page.locator('[data-weapon-slot="3"]');
  const root = slot.locator('[data-game-detail="skill-72005"]');
  const child = slot.locator('[data-game-detail="skill-72076"]');
  expect((await child.boundingBox())!.y).toBeGreaterThan(
    (await root.boundingBox())!.y,
  );
  let card = await open(page, 72005);
  await expect(
    card
      .locator("li")
      .filter({ hasText: /威能：/ })
      .locator("strong"),
  ).toHaveText("14.4 秒 · 12 层");
  await expect(
    card
      .locator("li")
      .filter({ hasText: /激怒：/ })
      .locator("strong"),
  ).toHaveText("9.9 秒");
  await expect(page.locator('[data-value="Might"]')).toHaveText("60.00%");
  await page.getByLabel("技能预览武器组").selectOption("2");
  await expect(
    card
      .locator("li")
      .filter({ hasText: /威能：/ })
      .locator("strong"),
  ).toHaveText("13.5 秒 · 12 层");
  await page.getByLabel("技能预览武器组").selectOption("1");
  await expect(
    card
      .locator("li")
      .filter({ hasText: /威能：/ })
      .locator("strong"),
  ).toHaveText("14.4 秒 · 12 层");
  await page.screenshot({
    path: "test-results/weapon-rifle-desktop.png",
    fullPage: true,
  });
  await card.getByRole("button", { name: "关闭技能与特性详情" }).click();
  card = await open(page, 72076);
  await expect(
    card
      .locator("li")
      .filter({ hasText: /目盲：/ })
      .locator("strong"),
  ).toHaveText("5.5 秒");
  await expect(
    card
      .locator("li")
      .filter({ hasText: /引爆窗口：/ })
      .locator("strong"),
  ).toHaveText("2 秒");
  await card.getByRole("button", { name: "关闭技能与特性详情" }).click();
  await page.getByLabel("技能预览武器组").selectOption("2");
  card = await open(page, 72076);
  await expect(
    card
      .locator("li")
      .filter({ hasText: /目盲：/ })
      .locator("strong"),
  ).toHaveText("5 秒");
  await card.getByRole("button", { name: "关闭技能与特性详情" }).click();
  await page.getByRole("tab", { name: "预览", exact: true }).click();
  await page
    .locator('.build-reference[data-game-detail="skill-72076"]')
    .click();
  await expect(page.locator(".game-tooltip")).toContainText("成像分离");
  await page.getByRole("button", { name: "关闭技能与特性详情" }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("p12.builds.v1")!)[0],
  );
  expect(saved).toEqual(b);
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON", exact: true }).click();
  const downloaded = await waiting;
  expect(JSON.parse(readFileSync((await downloaded.path())!, "utf8"))).toEqual(
    b,
  );
  expect(upstream).toBe(0);
});

test("390px只读长矛完整连段和潜袭可点击，刷新与无横向溢出", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const b = createBuild("Thief");
  b.equipment.weapon1.weapon = "Spear";
  b.specs[2].id = 58;
  await seed(page, b, true);
  await expect(
    page.locator('[data-weapon-slot="2"] [data-game-detail]'),
  ).toHaveCount(3);
  await expect(
    page.locator('[data-weapon-slot="3"] [data-game-detail]'),
  ).toHaveCount(3);
  await expect(page.locator('[data-game-detail="skill-72924"]')).toHaveCount(1);
  const card = await open(page, 73076);
  await expect(
    card
      .locator("li")
      .filter({ hasText: /流血：/ })
      .locator("strong"),
  ).toHaveText("3.5 秒 · 1 层");
  await page.screenshot({
    path: "test-results/weapon-thief-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.locator('.weapon-skill-list [data-game-detail="skill-72904"]'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("p12.builds.v1")),
  ).toBeNull();
});

test("元素主副协调联动技能与属性，预览不进入保存，刷新重置", async ({
  page,
}) => {
  const b = createBuild("Elementalist");
  b.equipment.weapon1.weapon = "Dagger";
  b.equipment.offhand1.weapon = "Dagger";
  b.specs[2].id = 56;
  b.specs[0].id = 31; // fire specialization, its minor trait enables fire gate
  await seed(page, b);
  await page.getByLabel("技能主协调").selectOption("Water");
  await page.getByLabel("技能副协调").selectOption("Air");
  await expect(
    page.locator('[data-weapon-slot="3"] [data-game-detail="skill-46140"]'),
  ).toBeVisible();
  await open(page, 46140);
  await page.getByLabel("技能主协调").selectOption("Fire");
  await expect(page.locator(".game-tooltip")).toHaveCount(0);
  await expect(
    page.locator('[data-weapon-slot="1"] [data-game-detail="skill-15718"]'),
  ).toBeVisible();
  await page.locator(".attribute-effects summary").click();
  await expect(page.getByLabel("预览当前协调")).toHaveValue("Fire");
  await page.getByLabel("预览当前协调").selectOption("Earth");
  await expect(page.getByLabel("技能主协调")).toHaveValue("Earth");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("p12.builds.v1")!)[0],
    ),
  ).toEqual(b);
  await page.reload();
  await expect(page.getByLabel("技能主协调")).toHaveValue("Fire");
});

test("武器资料失败保留编辑和草稿，并能单独重试", async ({ page }) => {
  const b = createBuild();
  b.equipment.weapon1.weapon = "Rifle";
  b.description = "不能丢失的草稿";
  await page.route("**/weapon-skills.json", (route) =>
    route.fulfill({ status: 503, body: "temporarily unavailable" }),
  );
  await page.addInitScript(
    (b) => localStorage.setItem("p12.builds.v1", JSON.stringify([b])),
    b,
  );
  await page.goto("/");
  const retry = page.getByRole("button", { name: "重新加载武器技能" });
  await expect(retry).toBeVisible();
  await page.getByLabel("BD描述Markdown").fill("修改后的草稿");
  await page.unroute("**/weapon-skills.json");
  await retry.click();
  await expect(
    page.locator('.weapon-skill-list [data-game-detail="skill-72076"]'),
  ).toBeVisible();
  await expect(page.getByLabel("BD描述Markdown")).toHaveValue("修改后的草稿");
});

test("后续技能支持描述搜索；普通技能选择器不会混入替换技能", async ({
  page,
}) => {
  const b = createBuild();
  b.equipment.weapon1.weapon = "Rifle";
  await seed(page, b);
  await page.getByLabel("BD描述Markdown").fill("/成像分离");
  await expect(page.getByRole("option", { name: /成像分离/ })).toBeVisible();
  await page.getByRole("option", { name: /成像分离/ }).click();
  await expect(page.getByLabel("BD描述Markdown")).toHaveValue(
    "[成像分离](gw2:skill/72076)",
  );
  await page
    .getByRole("button", { name: "选择通用一技能", exact: true })
    .click();
  await expect(
    page.locator(".option").filter({ hasText: "成像分离" }),
  ).toHaveCount(0);
});
