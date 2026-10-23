import { loadBuild, downloadBuild, reloadBuild } from "./build-fixtures";
import { test, expect, type Page } from "@playwright/test";
import { createBuild, encodeShare, type Build } from "../src/domain";

function fixture(): Build {
  const b = createBuild("Mesmer");
  b.specs[0] = { id: 23, traits: [null, null, 1866] };
  b.equipment.head.statId = 161;
  Object.assign(b.equipment.weapon1, {
    weapon: "Staff",
    statId: 156,
    infusions: [39340, null],
  });
  Object.assign(b.equipment.weapon2, {
    weapon: "Staff",
    statId: 161,
    infusions: [null, null],
  });
  return b;
}
async function seed(page: Page, b = fixture()) {
  await loadBuild(page, b);
  await expect(page.locator('[data-value="Healing"]')).toBeVisible();
}
async function checkHealing(page: Page) {
  const healing = Number(
    (await page.locator('[data-value="Healing"]').innerText()).replaceAll(
      ",",
      "",
    ),
  );
  const icon = page.getByRole("button", { name: "幻象回复", exact: true });
  await icon.focus();
  await icon.press("F1");
  const card = page.getByRole("dialog", { name: "幻象回复", exact: true });
  await expect(
    card
      .locator("li")
      .filter({ hasText: "219 + 0.77 × 治疗效果" })
      .locator("strong"),
  ).toHaveText(Math.round(219 + 0.77 * healing).toLocaleString("en-US"));
  await expect(card).toContainText(
    `当前治疗效果 ${healing.toLocaleString("en-US")}`,
  );
  return { card, healing };
}

test("治疗随词条、灌注与武器组变化，已打开详情也使用当前属性", async ({
  page,
}) => {
  let upstream = 0;
  page.on("request", (r) => {
    if (/wiki\.(wishingstar\.top|guildwars2\.com)/.test(r.url())) upstream++;
  });
  await seed(page);
  const first = await checkHealing(page);
  expect(first.healing).toBeGreaterThan(0);
  // selectOption dispatches change without outside-pointer dismissal.
  await page.getByLabel("属性预览武器组").selectOption("2");
  await expect(
    first.card
      .locator("li")
      .filter({ hasText: "219 + 0.77 × 治疗效果" })
      .locator("strong"),
  ).toHaveText("219");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /整套词条/ }).click();
  await page.getByRole("option", { name: "天界", exact: true }).click();
  const changed = await checkHealing(page);
  expect(changed.healing).toBeGreaterThan(0);
  await changed.card.screenshot({
    path: "test-results/healing-details-desktop.png",
  });
  expect(upstream).toBe(0);
});

test("390px只读治疗详情保持版本1分享与预览隔离，刷新重新计算", async ({
  page,
}) => {
  const b = fixture();
  const hash = "#build=" + encodeShare(b);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/" + hash);
  await expect(page.locator('[data-value="Healing"]')).toBeVisible();
  const before = await page.evaluate(() =>
    localStorage.getItem("p12.builds.v1"),
  );
  const first = await checkHealing(page);
  await first.card.screenshot({
    path: "test-results/healing-details-mobile.png",
  });
  await page.keyboard.press("Escape");
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览威能层数").fill("25");
  await page.getByLabel("预览激怒", { exact: true }).check();
  expect((await checkHealing(page)).healing).toBe(first.healing);
  expect(new URL(page.url()).hash).toBe(hash);
  expect(await page.evaluate(() => localStorage.getItem("p12.builds.v1"))).toBe(
    before,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await reloadBuild(page);
  await expect(page.locator('[data-value="Healing"]')).toBeVisible();
  expect((await checkHealing(page)).healing).toBe(first.healing);
});

test("属性资料失败时保留Wiki公式，重试成功后显示配装治疗", async ({ page }) => {
  await page.route("**/attribute-data.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await loadBuild(page, fixture());
  await expect(
    page.getByRole("button", { name: "重新加载属性资料" }),
  ).toBeVisible();
  const icon = page.getByRole("button", { name: "幻象回复", exact: true });
  await icon.focus();
  await icon.press("F1");
  const card = page.getByRole("dialog", { name: "幻象回复", exact: true });
  await expect(card.locator("strong").first()).toHaveText(
    "219 + 0.77 × 治疗效果",
  );
  await expect(card).not.toContainText("当前治疗效果");
  await page.keyboard.press("Escape");
  await page.unroute("**/attribute-data.json");
  await page.getByRole("button", { name: "重新加载属性资料" }).click();
  await expect(page.locator('[data-value="Healing"]')).toBeVisible();
  await checkHealing(page);
});

test("幻象纹章先应用模糊铭文主动增强，再按配装计算，被动不受增强", async ({
  page,
}) => {
  const b = fixture();
  b.skills[0] = 21750;
  b.specs[0].traits = [null, null, 752];
  await seed(page, b);
  const healing = Number(
    (await page.locator('[data-value="Healing"]').innerText()).replaceAll(
      ",",
      "",
    ),
  );
  const icon = page.getByRole("button", { name: "选择治疗技能", exact: true });
  const check = async (base: number) => {
    await icon.focus();
    await icon.press("F1");
    const card = page.locator(".game-tooltip");
    const active = card
      .locator("li")
      .filter({ hasText: `${base} + 0.85 × 治疗效果` });
    await expect(active.locator("strong")).toHaveText(
      Math.round(base + 0.85 * healing).toLocaleString("en-US"),
    );
    await expect(
      card
        .locator("li")
        .filter({ hasText: "350 + 0.06 × 治疗效果" })
        .locator("strong"),
    ).toHaveText(Math.round(350 + 0.06 * healing).toLocaleString("en-US"));
    return active;
  };
  await expect((await check(6600)).locator("em")).toHaveText("特性修正");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "幻象回复", exact: true }).click();
  await expect((await check(5560)).locator("em")).toHaveCount(0);
});
