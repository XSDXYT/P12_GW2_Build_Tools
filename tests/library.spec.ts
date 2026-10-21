import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createBuild } from "../src/domain";
const entries = [
  { ...createBuild("Mesmer"), name: "碎层直伤幻术" },
  { ...createBuild("Guardian"), name: "碎层治疗守护" },
  { ...createBuild("Mesmer"), name: "野外练习" },
];
async function seed(page: Page) {
  await page.addInitScript((builds) => {
    if (!sessionStorage.getItem("library-seeded")) {
      localStorage.setItem("p12.builds.v1", JSON.stringify(builds));
      sessionStorage.setItem("library-seeded", "1");
    }
  }, entries);
  await page.goto("/");
  await page.getByRole("button", { name: /我的配装/ }).click();
}

test("职业、名称、标签和收藏组合筛选，保存分类不改配装并在刷新后保留", async ({
  page,
}) => {
  await seed(page);
  const before = await page.evaluate(() =>
    localStorage.getItem("p12.builds.v1"),
  );
  await expect(page.locator(".library-row")).toHaveCount(3);
  await page
    .getByRole("button", { name: "编辑标签碎层直伤幻术", exact: true })
    .click();
  await page
    .getByLabel("碎层直伤幻术的标签", { exact: true })
    .fill("碎层，直伤，碎层");
  await page.getByRole("button", { name: "保存标签", exact: true }).click();
  await page
    .getByRole("button", { name: "收藏碎层直伤幻术", exact: true })
    .click();
  await page.getByLabel("筛选配装职业").selectOption("Mesmer");
  await expect(page.locator(".library-row")).toHaveCount(2);
  await page.getByLabel("搜索配装名称").fill("碎层");
  await page.getByLabel("筛选配装标签").selectOption("直伤");
  await page.getByLabel("仅看收藏").check();
  await expect(page.locator(".library-row")).toHaveCount(1);
  await expect(page.locator(".library-row")).toContainText("碎层直伤幻术");
  expect(await page.evaluate(() => localStorage.getItem("p12.builds.v1"))).toBe(
    before,
  );
  await page.reload();
  await page.getByRole("button", { name: /我的配装/ }).click();
  await expect(
    page.getByRole("button", { name: "取消收藏碎层直伤幻术", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("筛选配装职业").selectOption("Guardian");
  await page.getByLabel("仅看收藏").check();
  await expect(page.locator(".empty-library")).toContainText("没有匹配");
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(page.locator(".library-row")).toHaveCount(3);
});

test("390px标签编辑与收藏无横向溢出，备份包含分类，整库导入保留原有配装", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page
    .getByRole("button", { name: "编辑标签碎层治疗守护", exact: true })
    .click();
  await page
    .getByLabel("碎层治疗守护的标签", { exact: true })
    .fill("治疗，碎层");
  await page.getByRole("button", { name: "保存标签", exact: true }).click();
  await page
    .getByRole("button", { name: "收藏碎层治疗守护", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const dialog = page.getByRole("dialog", { name: "我的配装", exact: true });
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  await dialog.screenshot({ path: "test-results/library-mobile.png" });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "备份配装库", exact: true }).click();
  const downloaded = await download;
  const backup = JSON.parse(readFileSync((await downloaded.path())!, "utf8"));
  expect(backup.builds).toHaveLength(3);
  expect(backup.metadata[entries[1].id]).toEqual({
    favorite: true,
    tags: ["治疗", "碎层"],
  });
  await page
    .getByRole("dialog", { name: "我的配装", exact: true })
    .getByRole("button", { name: "导入 JSON", exact: true })
    .click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole("status")).toContainText("已导入 3 个配装及分类");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("p12.builds.v1")!),
  );
  expect(saved).toHaveLength(6);
  expect(new Set(saved.map((b: { id: string }) => b.id)).size).toBe(6);
  for (const entry of entries) expect(saved).toContainEqual(entry);
});

test("分类写入失败保留输入和旧值，损坏备份不改变配装库", async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw Error("quota");
    };
  });
  await page
    .getByRole("button", { name: "编辑标签野外练习", exact: true })
    .click();
  await page.getByLabel("野外练习的标签", { exact: true }).fill("我的标签");
  await page.getByRole("button", { name: "保存标签", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("标签保存失败");
  await expect(page.getByLabel("野外练习的标签", { exact: true })).toHaveValue(
    "我的标签",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("p12.library-metadata.v1")),
  ).toBeNull();
  const before = await page.evaluate(() =>
    localStorage.getItem("p12.builds.v1"),
  );
  await page
    .getByRole("dialog", { name: "我的配装", exact: true })
    .getByRole("button", { name: "导入 JSON", exact: true })
    .click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ type: "p12-library", version: 9, builds: [] }),
    ),
  });
  await expect(page.getByRole("status")).toContainText("导入失败");
  expect(await page.evaluate(() => localStorage.getItem("p12.builds.v1"))).toBe(
    before,
  );
});
