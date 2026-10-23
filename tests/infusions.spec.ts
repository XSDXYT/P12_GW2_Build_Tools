import { test, expect } from "@playwright/test";
import { createBuild, decodeShare } from "../src/domain";
import { loadBuild, downloadBuild, reloadBuild } from "./build-fixtures";

for (const width of [1440, 390]) {
  test(`${width}px按类型和数量配置灌注，+30和18枚上限生效，两组独立并可保存分享`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const build = createBuild();
    build.name = "集中灌注验收";
    build.equipment.weapon1.weapon = "Staff";
    build.equipment.weapon1.infusions = [null, null];
    build.equipment.offhand1.infusions = [];
    build.equipment.weapon2.weapon = "Sword";
    await loadBuild(page, build);
    const editor = page.getByLabel("灌注配置", { exact: true });
    const add = editor.getByRole("button", { name: "添加灌注", exact: true });
    async function choose(id: number) {
      await add.click();
      const picker = page.getByRole("dialog", {
        name: "添加灌注",
        exact: true,
      });
      await expect(picker.getByRole("option")).toHaveCount(40);
      await picker.getByRole("searchbox").fill(String(id));
      await picker.getByRole("searchbox").press("Enter");
    }
    await choose(37131);
    await page
      .getByRole("spinbutton", { name: "灌注 1 单枚属性", exact: true })
      .fill("30");
    await page
      .getByRole("spinbutton", { name: "灌注 1 数量", exact: true })
      .fill("12");
    await choose(43250);
    await page
      .getByRole("spinbutton", { name: "灌注 2 数量", exact: true })
      .fill("6");
    await expect(editor).toContainText("18 / 18 枚");
    await expect(editor.locator(".infusion-editor-summary")).toContainText(
      "+108",
    );
    await expect(add).toBeDisabled();
    await expect(page.locator('[data-value="Power"]')).toHaveText("1,360");
    await expect(page.locator('[data-value="Healing"]')).toHaveText("30");
    const amount = page.getByRole("spinbutton", {
      name: "灌注 1 单枚属性",
      exact: true,
    });
    await amount.fill("31");
    await expect(page.getByRole("alert")).toHaveText("请输入 1–30 的整数");
    await amount.blur();
    await expect(amount).toHaveValue("30");
    await expect(page.getByRole("status")).toContainText("1–30");
    const count = page.getByRole("spinbutton", {
      name: "灌注 1 数量",
      exact: true,
    });
    await count.fill("13");
    await count.blur();
    await expect(count).toHaveValue("12");
    const sets = page.getByLabel("灌注汇总武器组");
    await sets.getByRole("button").last().click();
    await expect(editor).toContainText("0 / 18 枚");
    await expect(page.locator('[data-value="Power"]')).toHaveText("1,000");
    await choose(49432);
    await page
      .getByRole("spinbutton", { name: "灌注 1 数量", exact: true })
      .fill("18");
    await expect(editor.locator(".infusion-editor-summary")).toContainText(
      "+162",
    );
    await expect(
      page.getByRole("spinbutton", { name: /单枚属性/ }),
    ).toHaveCount(0);
    await sets.getByRole("button").first().click();
    await expect(amount).toHaveValue("30");
    await expect(count).toHaveValue("12");
    const saved = await downloadBuild(page);
    expect(saved.infusionLoadouts).toEqual({
      "1": [
        { id: 37131, count: 12, attributeValue: 30 },
        { id: 43250, count: 6 },
      ],
      "2": [{ id: 49432, count: 18 }],
    });
    expect(saved.equipment).toEqual(build.equipment);
    await reloadBuild(page);
    await expect(amount).toHaveValue("30");
    await page.getByRole("button", { name: "分享配装 ↗", exact: true }).click();
    const link = await page.locator(".share input").inputValue();
    expect(decodeShare(link.split("#build=")[1]).infusionLoadouts).toEqual(
      saved.infusionLoadouts,
    );
    const viewer = await context.newPage();
    await viewer.setViewportSize({ width, height: 1000 });
    await viewer.goto(link);
    await expect(
      viewer.getByRole("spinbutton", { name: "灌注 1 单枚属性", exact: true }),
    ).toHaveAttribute("readonly", "");
    await expect(
      viewer.getByRole("button", { name: "添加灌注", exact: true }),
    ).toHaveCount(0);
    await viewer.getByRole("button", { name: /^灌注 1：/ }).click();
    const inspection = viewer.getByRole("dialog", {
      name: "灌注 1",
      exact: true,
    });
    await expect(inspection).toContainText("+30");
    await expect(inspection).toContainText("痛苦抗性 +9");
    await viewer.close();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await editor.screenshot({
      path: `test-results/infusion-editor-${width}.png`,
    });
  });
}

test("旧灌注不因打开或预览被改写，清空组后不复活旧值，删除后可撤销且焦点可恢复", async ({
  page,
}) => {
  const build = createBuild();
  build.equipment.head.infusions = [37127];
  await loadBuild(page, build);
  const editor = page.getByLabel("灌注配置", { exact: true });
  await expect(editor).toContainText("威力 +5 · 痛苦 +7");
  expect((await downloadBuild(page)).infusionLoadouts).toBeUndefined();
  const remove = editor.getByRole("button", {
    name: "移除灌注 1",
    exact: true,
  });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(
    editor.getByRole("button", { name: "添加灌注", exact: true }),
  ).toBeFocused();
  await expect(page.locator('[data-value="Power"]')).toHaveText("1,000");
  const cleared = await downloadBuild(page);
  expect(cleared.infusionLoadouts).toEqual({ "1": [] });
  expect(cleared.equipment.head.infusions).toEqual([37127]);
  await page.getByRole("button", { name: /撤销移除灌注/ }).click();
  await expect(page.locator('[data-value="Power"]')).toHaveText("1,005");
});
