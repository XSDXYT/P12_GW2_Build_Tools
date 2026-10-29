import { test, expect } from "@playwright/test";
import { createBuild, encodeShare } from "../src/domain";
import { loadBuild, downloadBuild } from "./build-fixtures";

test("网格选择及居中对齐插入光标位置，表头选中可直接填，预览/保存/分享保留GFM表格", async ({
  page,
  context,
}) => {
  const b = createBuild("Mesmer");
  b.description = "前文\n\n后文";
  await loadBuild(page, b);
  const editor = page.getByLabel("BD描述Markdown", { exact: true });
  await expect(editor).toHaveValue(b.description);
  await editor.focus();
  await editor.evaluate((e: HTMLTextAreaElement) => e.setSelectionRange(2, 2));
  await page.getByRole("button", { name: "表格", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "插入Markdown表格",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "3列、2行数据", exact: true })
    .click();
  await expect(dialog.getByLabel("列数", { exact: true })).toHaveValue("3");
  await expect(
    dialog.getByLabel("数据行数（不含表头）", { exact: true }),
  ).toHaveValue("2");
  await dialog.getByLabel("文字对齐", { exact: true }).selectOption("center");
  await dialog.screenshot({ path: "test-results/markdown-table-desktop.png" });
  await dialog.getByRole("button", { name: "插入表格", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(editor).toBeFocused();
  expect(
    await editor.evaluate((e: HTMLTextAreaElement) =>
      e.value.slice(e.selectionStart, e.selectionEnd),
    ),
  ).toBe("表头1");
  await page.keyboard.insertText("阶段");
  const source = await editor.inputValue();
  expect(source).toMatch(/^前文\n\n\| 阶段 \| 表头2 \| 表头3 \|/);
  expect(source).toContain("| :---: | :---: | :---: |");
  expect(source).toMatch(/\n\n后文$/);
  await page.getByRole("tab", { name: "预览", exact: true }).click();
  const preview = page.getByRole("region", { name: "BD描述预览" });
  await expect(preview.locator("th")).toHaveCount(3);
  await expect(preview.locator("tbody tr")).toHaveCount(2);
  await expect(preview.getByRole("columnheader", { name: "阶段" })).toHaveCSS(
    "text-align",
    "center",
  );
  const saved = await downloadBuild(page);
  expect(saved.description).toBe(source);
  const viewer = await context.newPage();
  await viewer.goto("/#build=" + encodeShare(saved));
  await expect(
    viewer.getByRole("region", { name: "BD描述预览" }).locator("table"),
  ).toBeVisible();
  await expect(
    viewer.getByRole("button", { name: "表格", exact: true }),
  ).toHaveCount(0);
  await viewer.close();
});

test("390px放大编辑中表格支持键盘网格、精确尺寸及取消，Esc只关闭表格，选中文字保留", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const b = createBuild();
  b.description = "保留选中文字";
  await loadBuild(page, b);
  await expect(page.getByLabel("BD描述Markdown", { exact: true })).toHaveValue(
    b.description,
  );
  await page.getByRole("button", { name: "放大编辑", exact: true }).click();
  const parent = page.getByRole("dialog", {
    name: "放大编辑 BD 描述",
    exact: true,
  });
  const editor = parent.getByLabel("BD描述Markdown", { exact: true });
  await editor.evaluate((e: HTMLTextAreaElement) =>
    e.setSelectionRange(0, e.value.length),
  );
  const trigger = parent.getByRole("button", { name: "表格", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "插入Markdown表格",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "1列、1行数据", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByLabel("列数", { exact: true })).toHaveValue("2");
  await expect(
    dialog.getByLabel("数据行数（不含表头）", { exact: true }),
  ).toHaveValue("2");
  await dialog.getByLabel("列数", { exact: true }).fill("12");
  await dialog.getByLabel("数据行数（不含表头）", { exact: true }).fill("20");
  await expect(dialog).toContainText("预览前3行，实际插入20行数据");
  expect(
    await dialog.evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
  ).toBe(true);
  await dialog.screenshot({ path: "test-results/markdown-table-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(parent).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(editor).toHaveValue(b.description);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  await trigger.click();
  await dialog
    .getByRole("button", { name: "2列、1行数据", exact: true })
    .click();
  await dialog.getByRole("button", { name: "插入表格", exact: true }).click();
  await expect(editor).toHaveValue(/^保留选中文字\n\n\| 表头1/);
  await parent.getByRole("button", { name: "收起窗口", exact: true }).click();
});

test("行列数校验和60000字符保护，失败与取消不改正文或保存状态", async ({
  page,
}) => {
  const b = createBuild();
  b.description = "字".repeat(59990);
  await loadBuild(page, b);
  await expect(page.getByLabel("BD描述Markdown", { exact: true })).toHaveValue(
    b.description,
  );
  const before = await page.locator(".build-caption").innerText();
  await page.getByRole("button", { name: "表格", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "插入Markdown表格",
    exact: true,
  });
  await dialog.getByLabel("列数", { exact: true }).fill("0");
  await expect(
    dialog.getByRole("button", { name: "插入表格", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("列数", { exact: true }).fill("2");
  await dialog.getByRole("button", { name: "插入表格", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("60,000字符");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByLabel("BD描述Markdown", { exact: true })).toHaveValue(
    b.description,
  );
  await expect(page.locator(".build-caption")).toHaveText(before);
});
