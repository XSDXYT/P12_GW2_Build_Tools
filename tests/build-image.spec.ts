import { test, expect, type Page } from "@playwright/test";
import { readFileSync, copyFileSync, mkdirSync } from "node:fs";
import {
  createBuild,
  encodeShare,
  type Catalog,
  type Build,
} from "../src/domain";
import { loadBuild, downloadBuild } from "./build-fixtures";
import { pngFilename } from "../src/build-image";
import { unzipSync } from "fflate";
const catalog: Catalog = JSON.parse(
  readFileSync("public/catalog.json", "utf8"),
);
function fixture() {
  const b = createBuild("Mesmer");
  b.name = "长图：幻术 / 开荒";
  b.tags = ["治疗", "开荒"];
  b.encounters = [{ instance: "灵魂山谷", boss: "山谷守护者", mode: "normal" }];
  b.equipment.weapon1.weapon = "Rifle";
  b.equipment.weapon1.sigils = [24639, null];
  b.equipment.weapon2.weapon = "Staff";
  b.skills[0] = 21750;
  b.skills[1] = 10232;
  const spec = catalog.specs.find(
    (s) => s.profession === "Mesmer" && !s.elite,
  )!;
  b.specs[0] = {
    id: spec.id,
    traits: [
      catalog.traits.find(
        (t) =>
          t.specialization === spec.id && t.slot === "Major" && t.tier === 1,
      )!.id,
      null,
      null,
    ],
  };
  b.description =
    "# 长图讲解验收\n使用[幻象回复](gw2:trait/1866)。\n\n|阶段|操作|\n|---|---|\n|开场|**治疗与增益**|\n\n" +
    Array.from(
      { length: 8 },
      (_, i) => `- 第${i + 1}步：注意站位、武器切换和技能衔接。`,
    ).join("\n") +
    "\n\n末尾讲解完整保留。";
  return b;
}
async function icons(page: Page) {
  await page.goto("/");
  const pixel = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const x = c.getContext("2d")!;
    x.fillStyle = "#d4b477";
    x.fillRect(0, 0, 16, 16);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.route("https://render.guildwars2.com/**", (r) =>
    r.fulfill({
      body: Buffer.from(pixel, "base64"),
      contentType: "image/png",
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
}
async function generate(page: Page) {
  await page.getByRole("button", { name: "截图分享", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "截图分享", exact: true });
  await modal.getByRole("button", { name: "生成长图", exact: true }).click();
  await expect(modal.getByRole("img", { name: "BD长图预览" })).toBeVisible({
    timeout: 30000,
  });
  return modal;
}
test("高清PNG包含完整双武器与MD讲解，下载文件真实可解码，导出不修改BD或编辑状态", async ({
  page,
}) => {
  await icons(page);
  const b = fixture();
  b.descriptionStyle = {
    name: "清纸攻略",
    css: readFileSync("public/markdown-styles/clear-guide.css", "utf8"),
  };
  await loadBuild(page, b);
  const caption = await page.locator(".build-caption").innerText();
  const modal = await generate(page);
  await expect(page.locator(".png-sheet h1").first()).toHaveText(b.name);
  await expect(page.locator(".png-description")).toContainText(
    "末尾讲解完整保留。",
  );
  await expect(page.locator(".png-sheet")).toContainText("武器组 Ⅱ");
  await expect(page.locator(".png-sheet")).toContainText("昏迷与晕眩时长加成");
  await expect(page.locator(".png-sheet")).toContainText("留空");
  const waiting = page.waitForEvent("download");
  await modal.getByRole("button", { name: "下载 PNG", exact: true }).click();
  const d = await waiting;
  expect(d.suggestedFilename()).toBe(pngFilename(b.name));
  const bytes = readFileSync((await d.path())!);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBe(2000);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(2500);
  const painted = await page.evaluate(async () => {
    const img = document.querySelector(
      ".image-share-preview img",
    ) as HTMLImageElement;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext("2d")!;
    x.drawImage(img, 0, 0);
    const pixels = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < pixels.length; i += 4 * 80)
      if (pixels[i] !== 16 || pixels[i + 1] !== 27 || pixels[i + 2] !== 35) n++;
    return n;
  });
  expect(painted).toBeGreaterThan(1000);
  const background = await page.evaluate(async () => {
    const sheet = document.querySelector(".png-sheet")!.getBoundingClientRect();
    const content = document
      .querySelector(".png-markdown")!
      .getBoundingClientRect();
    const img = document.querySelector(
      ".image-share-preview img",
    ) as HTMLImageElement;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext("2d")!;
    x.drawImage(img, 0, 0);
    const rgba = Array.from(
      x.getImageData(
        Math.round((content.left - sheet.left + 10) * 2),
        Math.round((content.top - sheet.top + 10) * 2),
        1,
        1,
      ).data,
    );
    c.width = 0;
    return rgba;
  });
  expect(background).toEqual([244, 248, 252, 255]);
  mkdirSync("test-results", { recursive: true });
  copyFileSync((await d.path())!, "test-results/build-image-hd.png");
  await modal.getByRole("button", { name: "关闭截图分享" }).click();
  await expect(page.locator(".build-caption")).toHaveText(caption);
  expect(await downloadBuild(page)).toEqual(b);
});
test("390px只读分享可导出标准PNG，不附带讲解，关闭恢复焦点且不写浏览器缓存", async ({
  page,
}) => {
  await icons(page);
  const b = fixture();
  await page.setViewportSize({ width: 390, height: 844 });
  const hash = "#build=" + encodeShare(b);
  await page.goto("/" + hash);
  await page.getByRole("button", { name: "截图分享", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "截图分享", exact: true });
  await modal.getByLabel("长图清晰度").selectOption("1");
  await modal.getByLabel("附带 BD 描述与讲解").uncheck();
  await modal.getByRole("button", { name: "生成长图", exact: true }).click();
  await expect(modal.getByRole("img", { name: "BD长图预览" })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".png-description")).toHaveCount(0);
  const waiting = page.waitForEvent("download");
  await modal.getByRole("button", { name: "下载 PNG", exact: true }).click();
  const bytes = readFileSync((await (await waiting).path())!);
  expect(bytes.readUInt32BE(16)).toBe(1000);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await modal.screenshot({ path: "test-results/build-image-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "截图分享", exact: true }),
  ).toBeFocused();
  expect(new URL(page.url()).hash).toBe(hash);
  expect(
    await page.evaluate(() => localStorage.getItem("p12.builds.v1")),
  ).toBeNull();
});
test("属性资料失败可重试，外部图片跨域失败保留文字，长文自动高清分图并完整打包下载", async ({
  page,
}) => {
  await icons(page);
  const b = fixture();
  b.description = "![测试示意图](https://example.invalid/image.png)";
  await loadBuild(page, b);
  await page.route("**/attribute-data.json", (r) =>
    r.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.route("https://example.invalid/**", (r) => r.abort());
  await page.getByRole("button", { name: "截图分享", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "截图分享", exact: true });
  await modal.getByRole("button", { name: "生成长图", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("属性资料暂不可用");
  await page.unroute("**/attribute-data.json");
  await modal.getByRole("button", { name: "生成长图", exact: true }).click();
  await expect(modal.getByRole("img", { name: "BD长图预览" })).toBeVisible({
    timeout: 30000,
  });
  await expect(modal.getByRole("status")).toContainText("图片未能载入");
  await expect(
    page.locator('.png-description img[alt="测试示意图"]'),
  ).toHaveAttribute("src", "https://example.invalid/image.png");
  await page.keyboard.press("Escape");
  const description =
    "很长的一段说明。\n\n".repeat(100) + "完整讲解的最后一句。";
  await page.getByLabel("BD描述Markdown").fill(description);
  await page.getByRole("button", { name: "截图分享", exact: true }).click();
  await modal.getByRole("button", { name: "生成长图", exact: true }).click();
  await expect(modal.getByRole("img", { name: "BD长图预览" })).toBeVisible({
    timeout: 30000,
  });
  await expect(modal.getByRole("status")).toContainText("已自动分成");
  await expect(
    modal.getByRole("button", { name: "上一张", exact: true }),
  ).toBeDisabled();
  const firstUrl = await modal.getByRole("img").getAttribute("src");
  await modal.getByRole("button", { name: "下一张", exact: true }).click();
  await expect(modal.getByRole("img")).not.toHaveAttribute("src", firstUrl!);
  const download = page.waitForEvent("download");
  await modal
    .getByRole("button", { name: "下载当前 PNG", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("长图：幻术 _ 开荒-02.png");
  const zipDownload = page.waitForEvent("download");
  await modal
    .getByRole("button", { name: "打包下载全部 PNG", exact: true })
    .click();
  const zipFile = await zipDownload;
  expect(zipFile.suggestedFilename()).toBe("长图：幻术 _ 开荒.zip");
  const entries = unzipSync(readFileSync((await zipFile.path())!));
  const keys = Object.keys(entries);
  expect(keys.length).toBeGreaterThan(1);
  let totalHeight = 0;
  for (const key of keys) {
    const png = Buffer.from(entries[key]);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(2000);
    const h = png.readUInt32BE(20);
    expect(h).toBeLessThanOrEqual(8000);
    totalHeight += h;
  }
  const fullHeight = await page
    .locator(".png-sheet")
    .evaluate((node) => Math.ceil(node.getBoundingClientRect().height) * 2);
  expect(totalHeight - (keys.length - 1) * 64).toBe(fullHeight);
  // The second page must be a continuation, not another copy of page one.
  const overlapMatches = await page.evaluate(
    async ({ first, second }) => {
      const read = async (url: string) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return { canvas, ctx };
      };
      const a = await read(first),
        b = await read(second);
      const tail = a.ctx.getImageData(
        0,
        a.canvas.height - 64,
        a.canvas.width,
        64,
      ).data;
      const head = b.ctx.getImageData(0, 0, b.canvas.width, 64).data;
      let differences = 0;
      for (let i = 0; i < tail.length; i++)
        if (tail[i] !== head[i]) differences++;
      a.canvas.width = b.canvas.width = 0;
      return differences / tail.length;
    },
    {
      first: firstUrl!,
      second: (await modal.getByRole("img").getAttribute("src"))!,
    },
  );
  expect(overlapMatches).toBeLessThan(0.02);
  await expect(page.locator(".png-description")).toContainText(
    "完整讲解的最后一句。",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("BD描述Markdown")).toHaveValue(description);
});

test("极长内容超过20张仍明确保护，不截断也不改动讲解", async ({ page }) => {
  await icons(page);
  const b = fixture();
  await loadBuild(page, b);
  await page.addStyleTag({
    content: ".png-sheet { min-height: 100000px !important; }",
  });
  await page.getByRole("button", { name: "截图分享", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "截图分享", exact: true });
  await modal.getByRole("button", { name: "生成长图", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("分图数量超过20张");
  await expect(
    modal.getByRole("button", { name: "下载 PNG", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  expect(await downloadBuild(page)).toEqual(b);
});

test("生成途中可取消，清理临时节点；重新生成后可将PNG交给系统分享", async ({
  page,
}) => {
  await icons(page);
  const b = fixture();
  b.description = "![等待图片](https://images.example.invalid/pending.png)";
  await loadBuild(page, b);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    pending = new Promise<void>((r) => (started = r));
  await page.route("https://images.example.invalid/**", async (route) => {
    if (route.request().resourceType() === "fetch") {
      started();
      await gate;
    }
    await route.abort().catch(() => {});
  });
  await page.getByRole("button", { name: "截图分享", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "截图分享", exact: true });
  await modal.getByRole("button", { name: "生成长图", exact: true }).click();
  await pending;
  await page.keyboard.press("Escape");
  release();
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".image-export-stage")).toHaveCount(0);
  await page.getByLabel("BD描述Markdown").fill("取消后继续编辑。");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        const file = data.files![0];
        (
          window as unknown as {
            __pngShared: { name: string; size: number; type: string };
          }
        ).__pngShared = { name: file.name, size: file.size, type: file.type };
      },
    });
  });
  await generate(page);
  await modal.getByRole("button", { name: "系统分享", exact: true }).click();
  const shared = await page.evaluate(
    () =>
      (
        window as unknown as {
          __pngShared: { name: string; size: number; type: string };
        }
      ).__pngShared,
  );
  expect(shared.name).toBe(pngFilename(b.name));
  expect(shared.type).toBe("image/png");
  expect(shared.size).toBeGreaterThan(1000);
  await expect(modal.getByRole("status")).toContainText("已完成系统分享");
  await page.keyboard.press("Escape");
  expect((await downloadBuild(page)).description).toBe("取消后继续编辑。");
});
