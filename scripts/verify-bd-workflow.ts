import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "@playwright/test";
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
    ...createBuild(),
    name: "原生文件流程验收",
    description: "# 原始说明",
    tags: ["治疗", "开荒"],
    encounters: [{ instance: "灵魂山谷", boss: "山谷守护者", mode: "normal" }],
  };
  fixture.specs[0] = { id: 23, traits: [null, null, 1866] };
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
  const markdown = "## 已写入真实浏览器文件\n使用 [幻象回复](gw2:trait/1866)。";
  await page.getByLabel("BD描述Markdown", { exact: true }).fill(markdown);
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
  await writeFile(path.join(temporary, "BD", "existing.json"), text);

  // Creating another build exercises native file creation as well as overwrite.
  await page.getByRole("button", { name: "新建", exact: true }).click();
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
    "原生文件接口闭环通过：本地库扫描/卡片载入 → OPFS 实际创建/覆盖文件 → 磁盘 JSON → 生成公开库 → 任意仓库子路径只读查看/引用/下载/刷新。目录选择器由测试入口提供，未验证用户目录授权或真实设备。",
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
