import { loadBuild, downloadBuild, reloadBuild } from "./build-fixtures";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { createBuild } from "../src/domain";
const catalog = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
test("选择、保存刷新、分享、只读与复制编辑", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "装备 GEAR" })).toBeVisible();
  await page.getByLabel("配装名称", { exact: true }).fill("浏览器验收 BD");
  await page
    .locator(".gear-column")
    .first()
    .getByRole("button", { name: /属性/ })
    .first()
    .click();
  await page.locator(".option:not(.clear)").first().click();

  const roundtrip = await downloadBuild(page);
  await page.reload();
  await page.locator('input[type="file"]').setInputFiles({
    name: "roundtrip.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(roundtrip)),
  });
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
    "浏览器验收 BD",
  );
  await page.getByLabel("主手 Ⅰ武器类型").selectOption("Staff");
  await expect(page.getByText("由双手武器占用").first()).toBeVisible();
  // 构建受支持核心配置，验证整条分享与解码链路。
  const raw = createBuild();
  const c = catalog;
  raw.name = "完整分享验收";
  const stat = c.statChoices.equipment[0];
  for (const s of Object.values(raw.equipment) as any[]) s.statId = stat;
  raw.equipment.weapon1.weapon = "Staff";
  raw.equipment.weapon1.infusions = [null, null];
  raw.equipment.weapon2 = {
    statId: null,
    runeId: null,
    sigils: [null, null],
    infusions: [null],
    weapon: "",
  };
  raw.equipment.offhand1 = {
    statId: null,
    runeId: null,
    sigils: [null, null],
    infusions: [],
    weapon: "",
  };
  raw.equipment.offhand2 = {
    statId: null,
    runeId: null,
    sigils: [null, null],
    infusions: [null],
    weapon: "",
  };
  raw.specs = c.specs
    .filter((s: any) => s.profession === "Mesmer" && !s.elite)
    .slice(0, 3)
    .map((s: any) => ({
      id: s.id,
      traits: [1, 2, 3].map(
        (t) =>
          c.traits.find(
            (x: any) =>
              x.specialization === s.id && x.slot === "Major" && x.tier === t,
          ).id,
      ),
    }));
  raw.skills = ["Heal", "Utility", "Utility", "Utility", "Elite"].map(
    (kind, i) =>
      c.skills.filter(
        (s: any) =>
          s.professions?.includes("Mesmer") &&
          s.type === kind &&
          !s.specialization,
      )[kind === "Utility" ? i - 1 : 0].id,
  );
  await downloadBuild(page);
  await loadBuild(page, raw);
  await page.getByRole("button", { name: "分享配装 ↗" }).click();
  const link = await page.locator(".share input").inputValue();
  expect(link).toContain("#build=");
  const viewer = await context.newPage();
  await viewer.goto(link);
  await expect(viewer.getByLabel("配装名称", { exact: true })).toHaveValue(
    "完整分享验收",
  );
  await expect(viewer.getByLabel("配装名称", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await viewer.getByRole("button", { name: "复制编辑", exact: true }).click();
  await expect(
    viewer.getByLabel("配装名称", { exact: true }),
  ).not.toHaveAttribute("readonly", "");
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});
test("窄屏没有页面横向溢出，两个面板可见", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".gear-grid")).toBeVisible();
  await expect(page.locator("section.panel")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
test("损坏链接保留可操作界面", async ({ page }) => {
  await page.goto("/#build=invalid");
  await expect(page.getByRole("status")).toContainText("无法打开分享");
  await expect(page.getByRole("heading", { name: "装备 GEAR" })).toBeVisible();
});

test("食物、扳手、逐槽灌注选择并保存恢复，JSON 导出内容一致", async ({
  page,
}) => {
  await page.goto("/");
  const food = catalog.items.find((i: any) => i.details?.type === "Food");
  const utility = catalog.items.find((i: any) => i.details?.type === "Utility");
  const infusion = catalog.items.find((i: any) =>
    i.details?.infusion_upgrade_flags?.includes("Infusion"),
  );
  for (const [label, item] of [
    ["食物", food],
    ["扳手", utility],
  ] as const) {
    await page
      .locator(".upgrades-card")
      .getByRole("button", { name: new RegExp("^" + label) })
      .click();
    await page.locator(".search").fill(String(item.id));
    await page.locator(".option:not(.clear)").click();
  }
  const head = page
    .locator(".gear-column")
    .first()
    .locator(".equipment-row")
    .first();
  await head.locator("summary").click();
  await head.getByRole("button", { name: /头部灌注槽 1/ }).click();
  await page.locator(".search").fill(String(infusion.id));
  await page.locator(".option:not(.clear)").click();
  await downloadBuild(page);
  await reloadBuild(page);
  await expect(
    page.locator(".upgrades-card").getByRole("button", { name: /^食物/ }),
  ).toContainText(food.name);
  await expect(
    page.locator(".upgrades-card").getByRole("button", { name: /^扳手/ }),
  ).toContainText(utility.name);
  await expect(page.locator(".infusion-total")).toContainText(infusion.name);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 BD", exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(
    fs.readFileSync((await download.path())!, "utf8"),
  );
  expect(exported.food).toBe(food.id);
  expect(exported.utility).toBe(utility.id);
  expect(exported.equipment.head.infusions[0]).toBe(infusion.id);
});

test("下载失败保留草稿和未保存提醒", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".gear-grid")).toBeVisible();
  await page.getByLabel("配装名称", { exact: true }).fill("必须保留的草稿");
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw new Error("download failed");
    };
  });

  await page.getByRole("button", { name: "下载 BD", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("下载失败");
  await expect(page.locator(".build-caption")).toContainText("尚未保存");
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
    "必须保留的草稿",
  );
});

test("属性列表只展示去重词条名称，食物扳手使用核对后的中文", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".gear-column")
    .first()
    .getByRole("button", { name: /属性/ })
    .first()
    .click();
  await expect(page.locator(".option:not(.clear)")).toHaveCount(39);
  await expect(page.locator(".picker .option small")).toHaveCount(0);
  await expect(page.locator(".picker .item-id")).toHaveCount(0);
  await expect(
    page.locator(".picker .option").filter({ hasText: /^威能$|^精准$|^体力$/ }),
  ).toHaveCount(0);
  await page.locator(".search").fill("毒蛇");
  await expect(page.locator(".option:not(.clear)")).toHaveCount(1);
  await page.locator(".option:not(.clear)").click();
  await expect(
    page.locator(".gear-column").first().locator(".equipment-row").first(),
  ).toContainText("毒蛇");
  await page
    .locator(".upgrades-card")
    .getByRole("button", { name: /^扳手/ })
    .click();
  await page.locator(".search").fill("48917");
  await expect(page.locator(".option:not(.clear)")).toContainText(
    "剧毒聚能水晶",
  );
  await page.locator(".option:not(.clear)").click();
  await page
    .locator(".upgrades-card")
    .getByRole("button", { name: /^食物/ })
    .click();
  await page.locator(".search").fill("72575");
  await expect(page.locator(".option:not(.clear)")).toContainText(
    "碗装咖喱淡菜汤",
  );
  await page.screenshot({ path: "test-results/localized-food.png" });
});

test("整套词条设置可撤销，逐件调整后仍可保存", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /整套词条/ }).click();
  await page.getByRole("option", { name: "毒蛇", exact: true }).click();
  await expect(
    page
      .locator(".equipment-row")
      .first()
      .getByRole("button", { name: /属性/ }),
  ).toContainText("毒蛇");
  await expect(page.getByRole("status")).toContainText("12 个装备槽位");
  await page.getByRole("button", { name: /撤销整套词条设置/ }).click();
  await expect(
    page
      .locator(".equipment-row")
      .first()
      .getByRole("button", { name: /属性/ }),
  ).toContainText("未选择");
  await page.getByRole("button", { name: /整套词条/ }).click();
  await page.getByRole("option", { name: "天界", exact: true }).click();
  await downloadBuild(page);
  await reloadBuild(page);
  await expect(
    page
      .locator(".equipment-row")
      .first()
      .getByRole("button", { name: /属性/ }),
  ).toContainText("天界");
  await expect(page.getByLabel("主手 Ⅰ武器类型")).toHaveValue("");
});

test("靠近槽位的选择器支持键盘、无结果提示和焦点恢复", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "头部属性：未选择",
    exact: true,
  });
  await trigger.click();
  const menu = page.locator(".picker-popover");
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  const anchor = await trigger.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(12);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1280);
  expect(bounds!.y).toBeGreaterThanOrEqual(12);
  expect(Math.abs(bounds!.x - anchor!.x)).toBeLessThanOrEqual(12);
  await page.getByRole("searchbox").fill("不存在的词条000");
  await expect(menu.getByRole("status")).toContainText("没有匹配");
  await page.getByRole("searchbox").fill("毒蛇");
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("option", { name: "毒蛇", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "头部属性：毒蛇", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "头部属性：毒蛇", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".picker")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "头部属性：毒蛇", exact: true }),
  ).toBeFocused();
});

test("直接切换另一槽位不会保留上个选择器的查询与状态", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "头部属性：未选择", exact: true })
    .click();
  await page.getByRole("searchbox").fill("毒蛇");
  await page
    .getByRole("button", { name: "肩部属性：未选择", exact: true })
    .click();
  await expect(page.locator(".picker-heading")).toContainText("肩部");
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.locator(".picker").getByRole("option")).toHaveCount(39);
});

test("触屏选择器使用底部面板，打开时不聚焦搜索", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5173/");
  await page
    .getByRole("button", { name: "头部属性：未选择", exact: true })
    .tap();
  await expect(page.locator(".picker-sheet")).toBeVisible();
  await expect(page.getByRole("searchbox")).not.toBeFocused();
  const bounds = await page.locator(".picker-sheet").boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.getByRole("searchbox").tap();
  await page.getByRole("searchbox").fill("狂战士");
  await page.getByRole("option", { name: "狂战士", exact: true }).tap();
  await expect(
    page.getByRole("button", { name: "头部属性：狂战士", exact: true }),
  ).toBeVisible();
  await context.close();
});
