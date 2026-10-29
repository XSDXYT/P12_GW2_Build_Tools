import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createBuild, encodeShare } from "../src/domain";
import { loadBuild, downloadBuild } from "./build-fixtures";
const text =
  "# 幻术开荒讲解\n\n## 开场与增益\n先保证**关键增益覆盖**，参考[幻象回复](gw2:trait/1866)。\n\n> 保留一个解控技能，应对下一次机制。\n\n|阶段|要点|\n|---|---|\n|开场|提前准备增益|\n|转阶段|保留机动技能|\n\n```text\n治疗 → 增益 → 武器切换\n```";
async function seed(page: Page) {
  const build = createBuild("Mesmer");
  build.name = "样式验收";
  build.description = text;
  await loadBuild(page, build);
  const toggle = page.getByRole("button", { name: "CSS 样式", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("CSS 样式", { exact: true })).toBeHidden();
  await toggle.click();
  return build;
}
async function workshop(page: Page) {
  const panel = page.getByLabel("CSS 样式", { exact: true });
  await panel.locator("summary").click();
  return panel;
}

test("三套模板切换、经典恢复、JSON/分享样式还原及引用浮层保持正确", async ({
  page,
  context,
}) => {
  await seed(page);
  const picker = page.getByLabel("CSS 样式", { exact: true });
  const before = (await page.locator(".app-header").count())
    ? await page
        .locator(".app-header")
        .evaluate((n) => getComputedStyle(n).color)
    : "";
  for (const name of ["迷雾金笺", "星界札记", "清纸攻略"]) {
    await picker.getByRole("button", { name: new RegExp(name) }).click();
    await expect(picker).toContainText(`当前：${name}`);
    await page.getByRole("tab", { name: "预览", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "BD描述预览" }),
    ).toHaveAttribute("data-md-style", /s/);
  }
  const preview = page.getByRole("region", { name: "BD描述预览" });
  await expect(preview).toHaveCSS("background-color", "rgb(244, 248, 252)");
  if (before)
    expect(
      await page
        .locator(".app-header")
        .evaluate((n) => getComputedStyle(n).color),
    ).toBe(before);
  await preview.getByRole("button", { name: "幻象回复", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "幻象回复", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const saved = await downloadBuild(page);
  expect(saved.description).toBe(text);
  expect(saved.descriptionStyle?.name).toBe("清纸攻略");
  const reader = await context.newPage();
  await reader.goto("/#build=" + encodeShare(saved));
  await expect(reader.getByRole("region", { name: "BD描述预览" })).toHaveCSS(
    "background-color",
    "rgb(244, 248, 252)",
  );
  await expect(
    reader.getByRole("button", { name: "CSS 样式", exact: true }),
  ).toBeVisible();
  await expect(reader.getByLabel("CSS 样式", { exact: true })).toBeHidden();
  await reader.close();
  await picker.getByRole("button", { name: /经典样式/ }).click();
  expect((await downloadBuild(page)).descriptionStyle).toBeUndefined();
  await page.getByRole("button", { name: "CSS 样式", exact: true }).click();
  await page
    .locator(".build-description")
    .screenshot({ path: "test-results/markdown-styles-collapsed-desktop.png" });
});

test("导入CSS、修改预览与下载、无效CSS保护和放大编辑保留未应用样式草稿", async ({
  page,
}) => {
  await seed(page);
  const panel = await workshop(page);
  const css =
    ".md-content{background:#f0f4ff;color:#223344;padding:22px}h2{color:#225588}";
  await panel.getByLabel("导入CSS文件").setInputFiles({
    name: "我的蓝色.css",
    mimeType: "text/css",
    buffer: Buffer.from(css),
  });
  await expect(panel).toContainText("当前：我的蓝色");
  expect((await downloadBuild(page)).descriptionStyle?.css).toBe(css);
  await panel
    .getByLabel("CSS源代码")
    .fill(css + "\nblockquote{border-left:4px solid #777}");
  await expect(page.getByRole("region", { name: "CSS样式示例" })).toHaveCSS(
    "background-color",
    "rgb(240, 244, 255)",
  );
  // Resizing the Markdown editor must preserve unapplied CSS and imported entries.
  const draft = await panel.getByLabel("CSS源代码").inputValue();
  const toggle = page.getByRole("button", { name: "CSS 样式", exact: true });
  const beforeToggle = await downloadBuild(page);
  await toggle.click();
  await expect(panel).toBeHidden();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("CSS源代码")).toHaveValue(draft);
  expect(await downloadBuild(page)).toEqual(beforeToggle);
  await page.getByRole("button", { name: "放大编辑", exact: true }).click();
  const expanded = page.getByRole("dialog", { name: "放大编辑 BD 描述" });
  await expanded.locator(".md-style-workshop summary").click();
  await expect(expanded.getByLabel("CSS源代码")).toHaveValue(draft);
  await expanded.getByRole("button", { name: "应用CSS", exact: true }).click();
  await expanded.getByRole("button", { name: "收起窗口", exact: true }).click();
  await panel.locator("summary").click();
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "下载CSS", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("我的蓝色.css");
  expect(readFileSync((await file.path())!, "utf8")).toBe(draft);
  await panel
    .getByLabel("CSS源代码")
    .fill("body{background:url(https://example.invalid/track.png)}");
  await expect(panel.getByRole("alert")).toContainText("外部资源");
  await expect(
    panel.getByRole("button", { name: "应用CSS", exact: true }),
  ).toBeDisabled();
  expect((await downloadBuild(page)).descriptionStyle?.css).toBe(draft);
  await panel.getByRole("button", { name: "移除模板", exact: true }).click();
  await panel.getByRole("button", { name: "取消删除", exact: true }).click();
  await panel.getByRole("button", { name: "移除模板", exact: true }).click();
  await panel.getByRole("button", { name: "确认删除", exact: true }).click();
  expect((await downloadBuild(page)).descriptionStyle?.css).toBe(draft);
});

test("授权模板文件夹扫描、修改保存、外部修改拦截、刷新和明确删除；不写浏览器缓存", async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(() => {
    const files: Record<string, string> = {
      "团队.css": "h2{color:#224466}",
      "bad.css": "@import 'bad';",
      "secret.txt": "untouched",
    };
    const handle = (name: string) => ({
      kind: "file" as const,
      name,
      getFile: async () => new File([files[name]], name),
      createWritable: async () => ({
        write: async (data: string) => {
          files[name] = data;
        },
        close: async () => {},
        abort: async () => {},
      }),
    });
    (window as any).__styleFiles = files;
    window.showDirectoryPicker = async () => ({
      kind: "directory",
      name: "我的CSS",
      async *values() {
        for (const name of Object.keys(files)) yield handle(name);
      },
      getFileHandle: async (name: string, options?: { create: boolean }) => {
        if (!(name in files)) {
          if (!options?.create)
            throw new DOMException("missing", "NotFoundError");
          files[name] = "";
        }
        return handle(name);
      },
      removeEntry: async (name: string) => {
        delete files[name];
      },
    });
  });
  const panel = await workshop(page);
  await panel
    .getByRole("button", { name: "连接模板文件夹", exact: true })
    .click();
  await expect(panel).toContainText("跳过1个无效文件");
  await page.getByRole("button", { name: "CSS 样式", exact: true }).click();
  await page.getByRole("button", { name: "CSS 样式", exact: true }).click();
  await expect(panel).toContainText("我的CSS");
  await panel
    .getByLabel("自定义模板", { exact: true })
    .selectOption("file:团队.css");
  await panel.getByLabel("CSS源代码").fill("h2{color:#113355}");
  await panel
    .getByRole("button", { name: "更新原CSS文件", exact: true })
    .click();
  await expect(panel).toContainText("已更新“团队.css”");
  expect(
    await page.evaluate(() => (window as any).__styleFiles["团队.css"]),
  ).toBe("h2{color:#113355}");
  await panel.getByRole("button", { name: "应用CSS", exact: true }).click();
  await page.evaluate(() => {
    (window as any).__styleFiles["团队.css"] = "h2{color:#445566}";
  });
  await panel
    .getByRole("button", { name: "更新原CSS文件", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("外部修改");
  await panel.getByRole("button", { name: "刷新模板", exact: true }).click();
  await panel
    .getByLabel("自定义模板", { exact: true })
    .selectOption("file:团队.css");
  await expect(panel.getByLabel("CSS源代码")).toHaveValue("h2{color:#445566}");
  await panel
    .getByRole("button", { name: "另存到模板文件夹", exact: true })
    .click();
  await expect(panel).toContainText("团队 (2).css");
  await panel.getByRole("button", { name: "删除CSS文件", exact: true }).click();
  await panel.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(panel).toContainText("CSS文件已删除");
  expect(
    await page.evaluate(() => (window as any).__styleFiles["团队 (2).css"]),
  ).toBeUndefined();
  expect(
    await page.evaluate(() => (window as any).__styleFiles["secret.txt"]),
  ).toBe("untouched");
  expect((await downloadBuild(page)).descriptionStyle?.css).toBe(
    "h2{color:#113355}",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("p12.builds.v1")),
  ).toBeNull();
});

test("390px模板界面无横向溢出，模板加载失败可重试，不支持目录时可导入CSS", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page.route("**/markdown-styles/clear-guide.css", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  const picker = page.getByLabel("CSS 样式", { exact: true });
  await picker.getByRole("button", { name: /清纸攻略/ }).click();
  await expect(picker.getByRole("alert")).toContainText("暂不可用");
  expect((await downloadBuild(page)).descriptionStyle).toBeUndefined();
  await page.unroute("**/markdown-styles/clear-guide.css");
  await picker.getByRole("button", { name: /清纸攻略/ }).click();
  await expect(picker).toContainText("当前：清纸攻略");
  const panel = await workshop(page);
  await page.evaluate(() => {
    window.showDirectoryPicker = undefined;
  });
  await panel
    .getByRole("button", { name: "连接模板文件夹", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("不支持连接文件夹");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await picker.screenshot({ path: "test-results/markdown-styles-mobile.png" });
  await page.getByRole("button", { name: "CSS 样式", exact: true }).click();
  await expect(picker).toBeHidden();
  await page
    .locator(".build-description")
    .screenshot({ path: "test-results/markdown-styles-collapsed-mobile.png" });
});

test("默认CSS作用于未指定样式的BD，设置文件可恢复，显式经典和作者样式优先且不缓存BD", async ({
  page,
}) => {
  const originalStorage = await page
    .goto("/")
    .then(() => page.evaluate(() => JSON.stringify(localStorage)));
  await seed(page);
  let panel = page.getByLabel("CSS 样式", { exact: true });
  await panel.getByRole("button", { name: /清纸攻略/ }).click();
  await panel
    .getByRole("button", { name: "设为默认样式", exact: true })
    .click();
  await expect(panel).toContainText("默认：清纸攻略");
  const waiting = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "导出默认设置", exact: true })
    .click();
  const settingsBytes = readFileSync((await (await waiting).path())!);
  expect(JSON.parse(settingsBytes.toString()).kind).toBe("p12-css-default");
  const bare = createBuild("Guardian");
  bare.name = "继承默认样式";
  bare.description = "# 默认外观验证";
  await page.evaluate(
    (hash) => {
      location.hash = hash;
    },
    "#build=" + encodeShare(bare),
  );
  await expect(page.getByRole("region", { name: "BD描述预览" })).toHaveCSS(
    "background-color",
    "rgb(244, 248, 252)",
  );
  expect(await downloadBuild(page)).toEqual(bare);
  await page.getByRole("button", { name: "CSS 样式", exact: true }).click();
  panel = page.getByLabel("CSS 样式", { exact: true });
  await panel.getByRole("button", { name: /经典样式/ }).click();
  await expect(page.getByRole("region", { name: "BD描述预览" })).not.toHaveCSS(
    "background-color",
    "rgb(244, 248, 252)",
  );
  await panel
    .getByRole("button", { name: "设为默认样式", exact: true })
    .click();
  await expect(panel).toContainText("默认：经典样式");
  await panel.getByLabel("导入默认CSS设置", { exact: true }).setInputFiles({
    name: "默认.json",
    mimeType: "application/json",
    buffer: settingsBytes,
  });
  await expect(panel).toContainText("默认：清纸攻略");
  // A manual classic override still wins over a changed default.
  await expect(page.getByRole("region", { name: "BD描述预览" })).not.toHaveCSS(
    "background-color",
    "rgb(244, 248, 252)",
  );
  await panel
    .getByRole("button", { name: "恢复BD原样式", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "BD描述预览" })).toHaveCSS(
    "background-color",
    "rgb(244, 248, 252)",
  );
  expect(await downloadBuild(page)).toEqual(bare);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(
    originalStorage,
  );
});

test("公开BD只读加载CSS用于PNG，恢复作者样式，JSON与原链接不受查看外观影响", async ({
  page,
}) => {
  const b = createBuild("Mesmer");
  b.name = "公开CSS样式验收";
  b.description = "# 公开正文\n\n样式只影响查看和截图。";
  b.descriptionStyle = {
    name: "作者蓝",
    css: ".md-content{background:#223344;color:#ffffff;padding:20px}",
  };
  const file = `bd-${"a".repeat(64)}.json`;
  await page.route("**/bd/index.json", (route) =>
    route.fulfill({
      json: {
        schema: 1,
        builds: [{ id: b.id, name: b.name, profession: b.profession, file }],
      },
    }),
  );
  await page.route(`**/bd/${file}`, (route) => route.fulfill({ json: b }));
  await page.route("https://render.guildwars2.com/**", (route) =>
    route.abort(),
  );
  await page.goto("/#bd=" + b.id);
  const preview = page.getByRole("region", { name: "BD描述预览" });
  await expect(preview).toHaveCSS("background-color", "rgb(34, 51, 68)");
  const hash = new URL(page.url()).hash;
  await page.getByRole("button", { name: "CSS 样式", exact: true }).click();
  const panel = await workshop(page);
  await panel.getByLabel("导入CSS文件").setInputFiles({
    name: "查看蓝.css",
    mimeType: "text/css",
    buffer: Buffer.from(
      ".md-content{background:#123456;color:#eef2f4;padding:20px}",
    ),
  });
  await expect(preview).toHaveCSS("background-color", "rgb(18, 52, 86)");
  await page.getByRole("button", { name: "截图分享", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "截图分享", exact: true });
  await dialog.getByRole("button", { name: "生成长图", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "BD长图预览" })).toBeVisible({
    timeout: 30000,
  });
  const pixel = await page.evaluate(async () => {
    const sheet = document.querySelector(".png-sheet")!.getBoundingClientRect(),
      body = document.querySelector(".png-markdown")!.getBoundingClientRect();
    const img = document.querySelector(
      ".image-share-preview img",
    ) as HTMLImageElement;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext("2d")!;
    x.drawImage(img, 0, 0);
    const result = Array.from(
      x.getImageData(
        Math.round((body.left - sheet.left + 10) * 2),
        Math.round((body.top - sheet.top + 10) * 2),
        1,
        1,
      ).data,
    );
    c.width = 0;
    return result;
  });
  expect(pixel).toEqual([18, 52, 86, 255]);
  await page.keyboard.press("Escape");
  expect(await downloadBuild(page)).toEqual(b);
  expect(new URL(page.url()).hash).toBe(hash);
  await panel
    .getByRole("button", { name: "恢复BD原样式", exact: true })
    .click();
  await expect(preview).toHaveCSS("background-color", "rgb(34, 51, 68)");
});
