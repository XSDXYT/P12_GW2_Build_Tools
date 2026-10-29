import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, type Browser } from "@playwright/test";
import { createBuild, parseBuild } from "../src/domain.ts";
import { buildCollection } from "./build-collection.ts";
import type { BuildDirectoryHandle } from "../src/build-files.ts";

const project = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), "p12-workflow-"));
const dist = path.resolve(project, "dist");
const generated = path.resolve(temporary, "public", "bd");
const prefix = "/forked-build-tools/";
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url || "/", "http://localhost").pathname,
    );
    if (!pathname.startsWith(prefix)) {
      response.writeHead(404).end();
      return;
    }
    const relative = pathname.slice(prefix.length) || "index.html";
    const root = relative.startsWith("bd/") ? generated : dist;
    const file = path.resolve(
      root,
      relative.startsWith("bd/") ? relative.slice(3) : relative,
    );
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(404).end();
      return;
    }
    response
      .writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      })
      .end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await mkdir(path.join(temporary, "BD"));
await buildCollection(temporary);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser: Browser | undefined;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.platform === "win32" ? "msedge" : undefined,
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}${prefix}`;
  const fixture = {
    ...createBuild("Ranger"),
    name: "原生文件流程验收",
    description: "# 原始说明",
    descriptionStyle: {
      name: "清纸攻略",
      css: await readFile(
        path.join(project, "public/markdown-styles/clear-guide.css"),
        "utf8",
      ),
    },
    tags: ["治疗", "开荒"],
    jadeBotCore: 96613,
    mechanics: { pets: [5, 73] },
    encounters: [{ instance: "灵魂山谷", boss: "山谷守护者", mode: "normal" }],
  };
  fixture.specs[2] = { id: 55, traits: [null, null, null] };
  await page.goto(base);
  await page.getByLabel("BD描述Markdown", { exact: true }).waitFor();
  const native = await page.evaluate(async (build) => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle("p12-workflow-bd", {
      create: true,
    });
    const file = await directory.getFileHandle("existing.json", {
      create: true,
    });
    const writer = await file.createWritable();
    await writer.write(JSON.stringify(build));
    await writer.close();
    const target = window as unknown as {
      __workflowDirectory: FileSystemDirectoryHandle;
      showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
    };
    target.__workflowDirectory = directory;
    // Only the chooser is substituted. All directory/file/writable methods
    // below are genuine browser File System Access interfaces backed by OPFS.
    target.showDirectoryPicker = async () => directory;
    return Object.prototype.toString.call(directory);
  }, fixture);
  assert.equal(native, "[object FileSystemDirectoryHandle]");
  await page
    .getByRole("button", { name: "连接 BD 文件夹", exact: true })
    .click();
  await page.getByRole("button", { name: "本地 BD 库", exact: true }).click();
  await page
    .getByRole("dialog", { name: "本地BD库", exact: true })
    .getByRole("button", { name: /原生文件流程验收/ })
    .click();
  // A card reads asynchronously. Fill does not require pointer hit-testing and
  // can otherwise edit the inert background draft before the file arrives.
  await expect(
    page.getByRole("dialog", { name: "本地BD库", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("BD描述Markdown", { exact: true })).toHaveValue(
    fixture.description,
  );
  const markdown = "## 已写入真实浏览器文件\n使用 [幻象回复](gw2:trait/1866)。";
  await page.getByLabel("BD描述Markdown", { exact: true }).fill(markdown);
  await expect(page.locator(".build-caption")).toContainText("尚未保存");
  await page
    .getByRole("button", { name: "保存到 BD 文件夹", exact: true })
    .click();
  await page.getByRole("status").filter({ hasText: "existing.json" }).waitFor();
  const text = await page.evaluate(async () => {
    const directory = (
      window as unknown as { __workflowDirectory: BuildDirectoryHandle }
    ).__workflowDirectory;
    return (
      await (await directory.getFileHandle("existing.json")).getFile()
    ).text();
  });
  const saved = parseBuild(text);
  assert.equal(saved.description, markdown);
  assert.equal(saved.id, fixture.id);
  assert.deepEqual(saved.tags, fixture.tags);
  assert.deepEqual(saved.encounters, fixture.encounters);
  assert.equal(saved.jadeBotCore, fixture.jadeBotCore);
  assert.deepEqual(saved.mechanics, fixture.mechanics);
  assert.deepEqual(saved.descriptionStyle, fixture.descriptionStyle);
  await writeFile(path.join(temporary, "BD", "existing.json"), text);

  // Exercise template writes/removal with native OPFS methods as well.
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const cssDirectory = await root.getDirectoryHandle("p12-workflow-css", {
      create: true,
    });
    const file = await cssDirectory.getFileHandle("OPFS.css", { create: true });
    const writer = await file.createWritable();
    await writer.write("h2{color:#224466}");
    await writer.close();
    const target = window as unknown as {
      __workflowCss: FileSystemDirectoryHandle;
      __workflowDirectory: FileSystemDirectoryHandle;
      showDirectoryPicker: (options: {
        id: string;
      }) => Promise<FileSystemDirectoryHandle>;
    };
    target.__workflowCss = cssDirectory;
    target.showDirectoryPicker = async (options) =>
      options.id === "p12-markdown-styles"
        ? cssDirectory
        : target.__workflowDirectory;
  });
  const styles = page.getByLabel("CSS 样式", { exact: true });
  await page.getByRole("button", { name: "CSS 样式", exact: true }).click();
  await styles.locator("summary").click();
  await styles
    .getByRole("button", { name: "连接模板文件夹", exact: true })
    .click();
  await styles
    .getByLabel("自定义模板", { exact: true })
    .selectOption("file:OPFS.css");
  await styles.getByLabel("CSS源代码").fill("h2{color:#113355}");
  await styles
    .getByRole("button", { name: "更新原CSS文件", exact: true })
    .click();
  await expect(styles).toContainText("已更新“OPFS.css”");
  const originalCss = await page.evaluate(async () => {
    const dir = (
      window as unknown as { __workflowCss: FileSystemDirectoryHandle }
    ).__workflowCss;
    return (await (await dir.getFileHandle("OPFS.css")).getFile()).text();
  });
  assert.equal(originalCss, "h2{color:#113355}");
  await styles
    .getByRole("button", { name: "另存到模板文件夹", exact: true })
    .click();
  await expect(styles).toContainText("OPFS (2).css");
  await styles
    .getByRole("button", { name: "删除CSS文件", exact: true })
    .click();
  await styles.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(styles).toContainText("CSS文件已删除");
  assert.equal(
    await page.evaluate(async () => {
      const dir = (
        window as unknown as { __workflowCss: FileSystemDirectoryHandle }
      ).__workflowCss;
      try {
        await dir.getFileHandle("OPFS (2).css");
        return false;
      } catch (error) {
        return error instanceof DOMException && error.name === "NotFoundError";
      }
    }),
    true,
  );
  await styles.locator("summary").click();

  // Creating another build exercises native file creation as well as overwrite.
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await expect(page.getByLabel("BD描述Markdown", { exact: true })).toHaveValue(
    "",
  );
  await page.getByLabel("配装名称", { exact: true }).fill("新建文件验收");
  await page
    .getByLabel("BD描述Markdown", { exact: true })
    .fill("保留空装备与技能。");
  await page
    .getByRole("button", { name: "保存到 BD 文件夹", exact: true })
    .click();
  await page.getByRole("status").filter({ hasText: "已保存到" }).waitFor();
  const files = await page.evaluate(async () => {
    const directory = (
      window as unknown as { __workflowDirectory: BuildDirectoryHandle }
    ).__workflowDirectory;
    const rows: { name: string; text: string }[] = [];
    for await (const entry of directory.values())
      if (entry.kind === "file")
        rows.push({
          name: entry.name,
          text: await (await entry.getFile()).text(),
        });
    return rows;
  });
  assert.equal(files.length, 2);
  assert.ok(files.some((file) => file.name === "新建文件验收.json"));
  for (const file of files) {
    assert.equal(path.basename(file.name), file.name);
    await writeFile(path.join(temporary, "BD", file.name), file.text);
  }
  const collection = await buildCollection(temporary);
  assert.equal(collection.builds.length, 2);
  assert.deepEqual(
    collection.builds.find((b) => b.id === saved.id)?.encounters,
    fixture.encounters,
  );

  // A clean context proves published reads don't depend on the editing cache.
  const viewerContext = await browser.newContext({ acceptDownloads: true });
  const viewer = await viewerContext.newPage();
  viewer.on("pageerror", (error) => errors.push(error.message));
  await viewer.goto(base + "#bd=" + encodeURIComponent(saved.id));
  await viewer
    .getByRole("heading", { name: "已写入真实浏览器文件", exact: true })
    .waitFor();
  assert.equal(
    await viewer
      .getByLabel("配装名称", { exact: true })
      .getAttribute("readonly"),
    "",
  );
  await expect(viewer.getByRole("region", { name: "BD描述预览" })).toHaveCSS(
    "background-color",
    "rgb(244, 248, 252)",
  );
  await viewer
    .getByRole("region", { name: "BD描述预览" })
    .getByRole("button", { name: "幻象回复", exact: true })
    .click();
  await viewer.getByRole("dialog", { name: "幻象回复", exact: true }).waitFor();
  await viewer.keyboard.press("Escape");
  const downloading = viewer.waitForEvent("download");
  await viewer.getByRole("button", { name: "下载 BD", exact: true }).click();
  const download = await downloading;
  assert.deepEqual(
    parseBuild(await readFile((await download.path())!, "utf8")),
    saved,
  );
  assert.equal(
    await viewer
      .getByRole("button", { name: "存到浏览器", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await viewer.evaluate(() => localStorage.getItem("p12.builds.v1")),
    null,
  );
  await viewer.reload();
  await viewer
    .getByRole("heading", { name: "已写入真实浏览器文件", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  await mkdir(path.join(project, "test-results"), { recursive: true });
  await viewer.locator(".build-description").screenshot({
    path: path.join(project, "test-results", "native-file-workflow.png"),
  });
  console.log(
    "原生文件接口闭环通过：本地库扫描/卡片载入 → OPFS 实际创建/覆盖文件 → 磁盘 JSON → 生成公开库 → 任意仓库子路径只读查看/引用/下载/刷新，保留CSS快照；模板CSS原生更新/另存/删除通过。目录选择器由测试入口提供，未验证用户目录授权或真实设备。",
  );
} finally {
  try {
    await browser?.close();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
    assert.ok(path.basename(temporary).startsWith("p12-workflow-"));
    await rm(temporary, { recursive: true, force: true });
  }
}
