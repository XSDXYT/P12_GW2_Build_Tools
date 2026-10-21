import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const prefix = "/P12_GW2_Build_Tools/";
const types = {
  ".html": "text/html",
  ".json": "application/json",
  ".js": "text/javascript",
  ".css": "text/css",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith(prefix) || pathname.includes("..")) {
      res.writeHead(404).end();
      return;
    }
    const relative = pathname.slice(prefix.length) || "index.html";
    const data = await readFile(
      new URL("../dist/" + relative, import.meta.url),
    );
    const extension = relative.slice(relative.lastIndexOf("."));
    res
      .writeHead(200, {
        "Content-Type": types[extension] || "application/octet-stream",
      })
      .end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.platform === "win32" ? "msedge" : undefined,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}${prefix}`;
  await page.goto(base);
  await page.getByRole("heading", { name: "装备 GEAR" }).waitFor();
  await page.locator('[data-value="Power"]').waitFor();
  assert.equal(
    await page.locator('[data-value="Power"]').textContent(),
    "1,000",
  );
  assert.equal(await page.locator("section.panel").count(), 2);
  const collectionResponse = await page.request.get(base + "bd/index.json");
  assert.equal(collectionResponse.status(), 200);
  const collection = await collectionResponse.json();
  assert.equal(collection.schema, 1);
  assert.ok(Array.isArray(collection.builds));
  assert.deepEqual(errors, []);
  console.log(
    "生产构建仓库子路径验证通过：HTML、脚本、样式、资料与两个面板均正常。",
  );
  const catalog = JSON.parse(
    await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
  );
  const traitIds = new Set(catalog.traits.map((t) => t.id));
  assert.equal(
    catalog.specs
      .flatMap((s) => [...s.minor_traits, ...s.major_traits])
      .filter((id) => !traitIds.has(id)).length,
    0,
  );
  console.log("特性目录引用完整性验证通过。");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
