import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createBuild, decodeShare, type Build } from "../src/domain";
function fixture(): Build {
  const build = createBuild("Mesmer");
  build.name = "幻术讲解";
  build.specs[0] = { id: 23, traits: [null, null, 1866] };
  return build;
}
async function seed(page: Page, build = fixture()) {
  await page.addInitScript(
    (value) => localStorage.setItem("p12.builds.v1", JSON.stringify([value])),
    build,
  );
  await page.goto("/");
  await expect(page.locator(".trait-lines")).toBeVisible();
}

test("斜杠引用跨类型检索，Markdown预览悬浮复用技能特性与食物详情，保存导出保留描述", async ({
  page,
}) => {
  const upstream: string[] = [];
  page.on("request", (request) => {
    if (
      /wiki\.(wishingstar\.top|guildwars2\.com)|api\.guildwars2\.com/.test(
        request.url(),
      )
    )
      upstream.push(request.url());
  });
  await seed(page);
  const editor = page.getByLabel("BD描述Markdown", { exact: true });
  await editor.fill("## 治疗说明\n使用 /幻象回复");
  await expect(
    page.getByRole("listbox", { name: "引用搜索结果" }),
  ).toBeVisible();
  await page.getByRole("option", { name: /幻象回复.*特性/ }).click();
  await expect(editor).toHaveValue(/\[幻象回复\]\(gw2:trait\/1866\)/);
  await editor.press("End");
  await editor.pressSequentially("\n配合 /彩棱豆饼");
  await page.getByLabel("引用类型", { exact: true }).selectOption("食物");
  await page.getByRole("option", { name: /彩棱豆饼/ }).click();
  await expect(editor).toHaveValue(/gw2:item\/8496/);
  const description = await editor.inputValue();
  await page.getByRole("tab", { name: "预览", exact: true }).click();
  const preview = page.getByRole("region", { name: "BD描述预览" });
  await expect(
    preview.getByRole("heading", { name: "治疗说明" }),
  ).toBeVisible();
  await preview.getByRole("button", { name: "幻象回复", exact: true }).hover();
  const trait = page.getByRole("dialog", { name: "幻象回复", exact: true });
  await expect(trait).toContainText("219 + 0.77 × 治疗效果");
  await page.keyboard.press("Escape");
  await preview.getByRole("button", { name: "彩棱豆饼", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "彩棱豆饼", exact: true }),
  ).toContainText("600 秒");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON", exact: true }).click();
  expect(
    JSON.parse(readFileSync((await (await download).path())!, "utf8"))
      .description,
  ).toBe(description);
  expect(upstream).toEqual([]);
  await page.locator(".build-description").screenshot({
    path: "test-results/build-description-desktop.png",
  });
});

test("有意取消主特性后仍可保存和分享，390px只读描述、引用及独立浏览器缓存兼容", async ({
  page,
  context,
}) => {
  await seed(page);
  const text =
    "# 留空演示\n暂不选择宗师特性，参考 [幻象回复](gw2:trait/1866)。";
  await page.getByLabel("BD描述Markdown", { exact: true }).fill(text);
  await page
    .locator(".major-list")
    .getByRole("button", { name: "幻象回复", exact: true })
    .click();
  await expect(
    page
      .locator(".major-list")
      .getByRole("button", { name: "幻象回复", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".validation")).toHaveCount(0);
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await page.getByRole("button", { name: "分享配装 ↗", exact: true }).click();
  const link = await page.locator(".share input").inputValue();
  const build = decodeShare(link.split("#build=")[1]);
  expect(build.specs[0].traits).toEqual([null, null, null]);
  expect(build.description).toBe(text);
  expect(build.version).toBe(1);
  const viewer = await context.newPage();
  await viewer.setViewportSize({ width: 390, height: 844 });
  await viewer.goto(link);
  await expect(viewer.getByRole("heading", { name: "留空演示" })).toBeVisible();
  await expect(
    viewer.getByLabel("BD描述Markdown", { exact: true }),
  ).toHaveCount(0);
  await expect(
    viewer.getByRole("button", { name: "放大编辑", exact: true }),
  ).toHaveCount(0);
  await viewer
    .getByRole("region", { name: "BD描述预览" })
    .getByRole("button", { name: "幻象回复", exact: true })
    .click();
  await expect(
    viewer.getByRole("dialog", { name: "幻象回复", exact: true }),
  ).toBeVisible();
  await viewer.keyboard.press("Escape");
  await viewer.getByRole("button", { name: "存到浏览器", exact: true }).click();
  const cached = await viewer.evaluate(
    () => JSON.parse(localStorage.getItem("p12.builds.v1")!)[0],
  );
  expect(cached.description).toBe(text);
  expect(cached.id).not.toBe(build.id);
  expect(
    await viewer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await viewer.locator(".build-description").screenshot({
    path: "test-results/build-description-mobile.png",
  });
  await viewer.reload();
  await expect(viewer.getByRole("heading", { name: "留空演示" })).toBeVisible();
});

test("Markdown表格和代码正常显示，原始HTML、危险链接和失效引用不执行也不请求上游", async ({
  page,
}) => {
  await seed(page);
  await page
    .getByLabel("BD描述Markdown", { exact: true })
    .fill(
      '## 安全预览\n\n|阶段|说明|\n|---|---|\n|一|**开场**|\n\n```md\n[幻象回复](gw2:trait/1866)\n```\n\n<img src=x onerror="window.__markdownAttack=1">\n\n[危险](javascript:window.__markdownAttack=2)\n\n[失效](gw2:trait/999999999)',
    );
  await page.getByRole("tab", { name: "预览", exact: true }).click();
  const preview = page.getByRole("region", { name: "BD描述预览" });
  await expect(preview.locator("table")).toContainText("开场");
  await expect(preview.locator("pre code")).toContainText("gw2:trait/1866");
  await expect(preview.locator("img[src=x]")).toHaveCount(0);
  await expect(preview.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(preview.locator(".reference-missing")).toHaveText("失效");
  expect(
    await page.evaluate(() => (window as any).__markdownAttack),
  ).toBeUndefined();
});

test("引用检索支持方向键和Enter，URL与代码不触发菜单，Esc保留原文", async ({
  page,
}) => {
  await seed(page);
  const editor = page.getByLabel("BD描述Markdown", { exact: true });
  await editor.fill("/幻象回复");
  await editor.press("ArrowDown");
  await editor.press("ArrowUp");
  await editor.press("Enter");
  await expect(editor).toHaveValue(/gw2:trait\/1866/);
  for (const text of [
    "https://example.com/abc",
    "`/幻象回复",
    "```\n/幻象回复",
  ]) {
    await editor.fill(text);
    await expect(
      page.getByRole("listbox", { name: "引用搜索结果" }),
    ).toHaveCount(0);
  }
  await editor.fill("/幻象回复");
  await editor.press("Escape");
  await expect(editor).toHaveValue("/幻象回复");
  await expect(page.getByRole("listbox", { name: "引用搜索结果" })).toHaveCount(
    0,
  );
});

test("文件夹旧文件原位更新，新BD按标题命名并避免重名覆盖，Markdown与下载一致", async ({
  page,
}) => {
  const build = fixture();
  build.description = "文件中的原始说明";
  await page.addInitScript((value) => {
    const contents: Record<string, string> = {
      "custom-name.json": JSON.stringify(value),
    };
    const handle = (name: string) => ({
      kind: "file",
      name,
      getFile: async () => new File([contents[name]], name),
      createWritable: async () => {
        let pending = "";
        return {
          write: async (text: string) => {
            pending = text;
          },
          close: async () => {
            contents[name] = pending;
            (window as any).__bdFiles = { ...contents };
          },
          abort: async () => {},
        };
      },
    });
    (window as any).showDirectoryPicker = async () => ({
      kind: "directory",
      name: "BD",
      values: async function* () {
        for (const name of Object.keys(contents)) yield handle(name);
      },
      getFileHandle: async (name: string, options?: { create: boolean }) => {
        if (!(name in contents) && !options?.create)
          throw new DOMException("missing", "NotFoundError");
        if (!(name in contents)) contents[name] = "";
        return handle(name);
      },
    });
  }, build);
  await page.goto("/");
  await page
    .getByRole("button", { name: "连接 BD 文件夹", exact: true })
    .click();
  await page
    .getByLabel("载入文件夹中的BD", { exact: true })
    .selectOption(build.id);
  await expect(page.getByLabel("BD描述Markdown", { exact: true })).toHaveValue(
    "文件中的原始说明",
  );
  await page
    .getByLabel("BD描述Markdown", { exact: true })
    .fill("## 已保存\n[幻象回复](gw2:trait/1866)");
  await page
    .getByRole("button", { name: "保存到 BD 文件夹", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("custom-name.json");
  const saved = await page.evaluate(() =>
    JSON.parse((window as any).__bdFiles["custom-name.json"]),
  );
  expect(saved.id).toBe(build.id);
  expect(saved.description).toContain("## 已保存");
  await expect(page.locator(".build-caption")).toContainText("已就绪");
  for (const [index, filename] of [
    "治疗幻术_开荒.json",
    "治疗幻术_开荒 (2).json",
  ].entries()) {
    await page.getByRole("button", { name: "新建", exact: true }).click();
    await page.getByLabel("配装名称", { exact: true }).fill("治疗幻术/开荒");
    await page
      .getByLabel("BD描述Markdown", { exact: true })
      .fill(`第 ${index + 1} 份独立配装`);
    await page
      .getByRole("button", { name: "保存到 BD 文件夹", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(filename);
  }
  const files = await page.evaluate(() => (window as any).__bdFiles);
  expect(Object.keys(files).sort()).toEqual(
    ["custom-name.json", "治疗幻术_开荒.json", "治疗幻术_开荒 (2).json"].sort(),
  );
  expect(JSON.parse(files["治疗幻术_开荒.json"]).description).toBe(
    "第 1 份独立配装",
  );
  expect(JSON.parse(files["治疗幻术_开荒 (2).json"]).id).not.toBe(
    JSON.parse(files["治疗幻术_开荒.json"]).id,
  );
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON", exact: true }).click();
  expect((await downloading).suggestedFilename()).toBe("治疗幻术_开荒.json");
});

test("没有文件夹权限时保留草稿，不支持目录接口时仍可下载JSON", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).showDirectoryPicker = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await seed(page);
  await page.getByLabel("BD描述Markdown", { exact: true }).fill("仍保留的草稿");
  await page
    .getByRole("button", { name: "连接 BD 文件夹", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("连接文件夹失败");
  await expect(page.getByLabel("BD描述Markdown", { exact: true })).toHaveValue(
    "仍保留的草稿",
  );
  await page.evaluate(() => {
    (window as any).showDirectoryPicker = undefined;
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "保存到 BD 文件夹", exact: true })
    .click();
  expect(
    JSON.parse(readFileSync((await (await download).path())!, "utf8"))
      .description,
  ).toBe("仍保留的草稿");
});

for (const width of [1440, 390]) {
  test(`${width}px放大描述保留选区和滚动，引用预览详情及Esc层级可用，收起后仍可保存`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const build = fixture();
    build.description = "## 放大编辑\n" + "配装细节与循环说明。\n".repeat(45);
    await seed(page, build);
    const editor = page.getByLabel("BD描述Markdown", { exact: true });
    await editor.scrollIntoViewIfNeeded();
    const originalHeight = (await editor.boundingBox())!.height;
    await editor.evaluate((element: HTMLTextAreaElement) => {
      element.setSelectionRange(3, 7, "backward");
      element.scrollTop = 40;
    });
    const expand = page.getByRole("button", { name: "放大编辑", exact: true });
    await expand.click();
    const modal = page.getByRole("dialog", {
      name: "放大编辑 BD 描述",
      exact: true,
    });
    await expect(modal).toBeVisible();
    await expect(editor).toBeFocused();
    expect((await editor.boundingBox())!.height).toBeGreaterThan(
      originalHeight + 100,
    );
    expect(
      await editor.evaluate((element: HTMLTextAreaElement) => [
        element.selectionStart,
        element.selectionEnd,
        element.selectionDirection,
        element.scrollTop,
      ]),
    ).toEqual([3, 7, "backward", 40]);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(
      "hidden",
    );
    await editor.fill("## 新讲解\n开场参考 /幻象回复");
    await page.getByRole("option", { name: /幻象回复.*特性/ }).click();
    const text = await editor.inputValue();
    await modal.getByRole("tab", { name: "预览", exact: true }).click();
    await expect(
      modal.getByRole("heading", { name: "新讲解", exact: true }),
    ).toBeVisible();
    await modal.getByRole("button", { name: "幻象回复", exact: true }).click();
    const details = modal.getByRole("dialog", {
      name: "幻象回复",
      exact: true,
    });
    await expect(details).toBeVisible();
    await expect(details).toContainText("219 + 0.77 × 治疗效果");
    // A visible and clickable card must be in the modal's top layer.
    await expect(
      details.getByRole("link", { name: "Wiki PvE 来源 ↗", exact: true }),
    ).toBeVisible();
    await details.getByRole("button", { name: "关闭技能与特性详情" }).focus();
    await page.keyboard.press("Escape");
    await expect(details).toHaveCount(0);
    await expect(modal).toBeVisible();
    await modal.getByRole("tab", { name: "编辑", exact: true }).click();
    await expect(editor).toHaveValue(text);
    await editor.fill(text + "\n/幻象回复");
    await editor.press("Escape");
    await expect(
      page.getByRole("listbox", { name: "引用搜索结果" }),
    ).toHaveCount(0);
    await expect(modal).toBeVisible();
    await editor.fill(text);
    await editor.evaluate((element: HTMLTextAreaElement) =>
      element.setSelectionRange(3, 6),
    );
    await editor.press("Escape");
    await expect(modal).not.toBeVisible();
    await expect(expand).toBeFocused();
    await expect(editor).toHaveValue(text);
    expect(
      await editor.evaluate((element: HTMLTextAreaElement) => [
        element.selectionStart,
        element.selectionEnd,
      ]),
    ).toEqual([3, 6]);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    await expand.click();
    // Background controls stay inert; native Tab may visit browser chrome.
    for (let step = 0; step < 10; step++) {
      await page.keyboard.press("Shift+Tab");
      expect(
        await modal.evaluate(
          (element) =>
            element.contains(document.activeElement) ||
            document.activeElement === document.body,
        ),
      ).toBe(true);
    }
    expect(
      await modal.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await modal.screenshot({
      path: `test-results/description-expanded-${width}.png`,
    });
    await modal.getByRole("button", { name: "收起窗口", exact: true }).click();
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("p12.builds.v1")!)[0].description,
      ),
    ).toBe(text);
  });
}
