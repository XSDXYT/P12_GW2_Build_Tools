import { loadBuild, downloadBuild, reloadBuild } from "./build-fixtures";
import { test, expect, type Page } from "@playwright/test";
import {
  createBuild,
  encodeShare,
  decodeShare,
  type Build,
} from "../src/domain";
import { readFileSync } from "node:fs";
const catalog = JSON.parse(readFileSync("public/catalog.json", "utf8"));
const name = (id: number) => catalog.items.find((i: any) => i.id === id).name;
const value = (page: Page, key: string) =>
  page.locator(`[data-value="${key}"]`);
function fixture() {
  const b = createBuild();
  b.name = "食物扳手回归";
  b.food = 91690;
  b.utility = 99842;
  b.specs[0].id = 45;
  b.description = `[营养](gw2:item/91690) [保养油](gw2:item/99842)`;
  return b;
}
async function seed(page: Page, b: Build) {
  await loadBuild(page, b);
  await expect(value(page, "OutgoingHealing")).toHaveText("11.16%");
}

test("食物扳手选择显示补齐的效果并立即计算，保存导出保持版本1", async ({
  page,
}) => {
  const b = fixture();
  await seed(page, b);
  await page
    .getByRole("button", { name: `扳手：${name(99842)}`, exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "搜索选项", exact: true })
    .fill("迷雾灌注磨刀石");
  const stone = page.getByRole("option", { name: /迷雾灌注磨刀石/ });
  await expect(stone).toContainText("3%");
  await expect(stone).toContainText("6%");
  await stone.click();
  await expect(value(page, "Power")).toHaveText("1,030");
  await expect(value(page, "OutgoingHealing")).toHaveText("10.00%");
  await page
    .getByRole("button", { name: `食物：${name(91690)}`, exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "搜索选项", exact: true })
    .fill("91842");
  const eggs = page.getByRole("option", { name: new RegExp(name(91842)) });
  await expect(eggs).toContainText("100");
  await expect(eggs).toContainText("增益效果");
  await eggs.click();
  await expect(value(page, "BoonDuration")).toHaveText("100");
  await expect(value(page, "ConditionDuration")).toHaveText("70");
  await expect(value(page, "OutgoingHealing")).toHaveText("0.00%");

  const saved = await downloadBuild(page);
  expect(saved.food).toBe(91842);
  expect(saved.utility).toBe(99845);
  expect(saved.version).toBe(1);
  expect(saved).not.toHaveProperty("consumableHealingBonus");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 BD", exact: true }).click();
  expect(
    JSON.parse(readFileSync((await (await downloading).path())!, "utf8")),
  ).toEqual(saved);
});

test("390px只读分享展示营养详情，盟友治疗来源随条件变化且不写入分享", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const b = fixture();
  const upstream: string[] = [];
  page.on("request", (r) => {
    if (
      /wiki\.(wishingstar\.top|guildwars2\.com)|api\.guildwars2\.com/.test(
        r.url(),
      )
    )
      upstream.push(r.url());
  });
  await page.goto("/#build=" + encodeShare(b));
  await expect(value(page, "OutgoingHealing")).toHaveText("11.16%");
  await page
    .getByRole("button", { name: "查看对盟友治疗加成来源", exact: true })
    .click();
  await expect(page.locator(".attribute-breakdown")).toContainText("0.006%");
  await expect(page.locator(".attribute-breakdown")).toContainText(name(99842));
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览拥有再生").check();
  await expect(value(page, "OutgoingHealing")).toHaveText("13.16%");
  await expect(value(page, "Healing")).toHaveText("100");
  const preview = page.getByRole("region", { name: "BD描述预览" });
  await preview.getByRole("button", { name: "营养", exact: true }).click();
  const card = page.getByRole("dialog", { name: name(91690), exact: true });
  await expect(card).toContainText("+100 治疗效果");
  await expect(card).toContainText("3600 秒");
  await expect(
    card.getByRole("link", { name: /在 Wiki 查看/ }),
  ).toHaveAttribute("href", /oldid=/);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "查看对盟友治疗加成来源", exact: true })
    .scrollIntoViewIfNeeded();
  await page
    .locator(".attribute-panel")
    .screenshot({ path: "test-results/consumables-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(upstream).toEqual([]);
  expect(decodeShare(new URL(page.url()).hash.split("#build=")[1])).toEqual(b);
  await reloadBuild(page);
  await expect(value(page, "OutgoingHealing")).toHaveText("11.16%");
});

test("地图限定食物可查看真实效果而不重复增加常规属性", async ({ page }) => {
  const b = createBuild();
  b.food = 80272;
  b.description = "[仙桃](gw2:item/80272)";
  await page.goto("/#build=" + encodeShare(b));
  await expect(value(page, "Power")).toHaveText("1,000");
  await page.locator(".attribute-warnings summary").click();
  await expect(page.locator(".attribute-warnings")).toContainText(
    "多里克湖限定",
  );
  await page
    .getByRole("region", { name: "BD描述预览" })
    .getByRole("button", { name: "仙桃", exact: true })
    .click();
  const card = page.getByRole("dialog", { name: name(80272), exact: true });
  await expect(card).toContainText("+100 威力");
  await expect(card).toContainText("离开地图后消失");
});
