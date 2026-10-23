import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { armorSlots, encodeShare, type Build } from "../src/domain";
import { loadBuild, downloadBuild } from "./build-fixtures";

const original: Build = JSON.parse(
  readFileSync("BD/bd-73228fe6-3dad-47d1-87c1-0c3a77061b9f.json", "utf8"),
);

test("符文汇总、逐件修改与灌注预览切换保持真实配置，折叠状态不进入下载", async ({
  page,
}) => {
  const build = structuredClone(original);
  for (const key of armorSlots) build.equipment[key].runeId = 24687;
  await loadBuild(page, build);
  const summary = page.getByLabel("护甲符文汇总", { exact: true });
  await expect(summary).toContainText("×6");
  await expect(page.getByRole("button", { name: /^头部符文：/ })).toHaveCount(
    0,
  );
  const toggle = page.getByRole("button", { name: /^逐件符文/ });
  await toggle.focus();
  await page.keyboard.press("Enter");
  const field = page.getByRole("button", { name: /^头部符文：/ });
  await field.click();
  await page.getByRole("searchbox").fill("24688");
  await page.getByRole("searchbox").press("Enter");
  await expect(summary).toContainText("×5");
  await expect(summary).toContainText("×1");
  await page.getByRole("button", { name: /^收起逐件符文/ }).click();
  await page.getByLabel("灌注汇总武器组").getByRole("button").last().click();
  const saved = await downloadBuild(page);
  const expected = structuredClone(build);
  expected.equipment.head.runeId = 24688;
  expect(saved).toEqual(expected);
});

for (const width of [320, 390, 720, 1101, 1440, 1920]) {
  test(`${width}px装备总览与展开配置无横向溢出，只读详情保持可用`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const populated = structuredClone(original);
    populated.infusionLoadouts = {
      "1": [
        { id: 37131, count: 12, attributeValue: 30 },
        { id: 43250, count: 6 },
      ],
    };
    await page.goto("/#build=" + encodeShare(populated));
    const gear = page.locator(".gear-panel");
    await expect(gear).toBeVisible();
    if (width <= 720) {
      const layout = await gear.locator(".upgrades-card").evaluate((node) => ({
        columns: getComputedStyle(node).gridTemplateColumns.split(" ").length,
        controlHeight: node.querySelector("button")!.getBoundingClientRect()
          .height,
      }));
      expect(layout.columns).toBe(1);
      expect(layout.controlHeight).toBeGreaterThanOrEqual(44);
    }
    await expect(gear.locator('[data-slot="offhand1"]')).toHaveCount(0);
    await expect(gear.locator(".weapon-grip")).toBeVisible();
    for (const expanded of [false, true]) {
      if (expanded)
        await page.getByRole("button", { name: /^逐件符文/ }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const overflow = await gear
        .locator(
          ".equipment-row, .weapon-row, .upgrades-card, .infusion-group-row",
        )
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.scrollWidth > node.clientWidth + 1)
            .map((node) => node.className),
        );
      expect(overflow).toEqual([]);
    }
    const infusion = gear.getByRole("button", { name: /^灌注 1：/ });
    await infusion.click();
    await expect(
      page.getByRole("dialog", { name: "灌注 1", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(infusion).toBeFocused();
    await page.getByRole("button", { name: /^收起逐件符文/ }).click();
    await gear.screenshot({ path: `test-results/gear-overview-${width}.png` });
    expect(errors).toEqual([]);
  });
}
