import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createBuild } from "../src/domain";
import { createLibraryBackup } from "../src/library";
import { downloadBuild } from "./build-fixtures";

test("浏览器存储不可写时仍可编辑下载和导入；刷新不自动恢复BD", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw Error("forbidden browser write");
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /^(保存|保存修改|存到浏览器|我的配装)$/ }),
  ).toHaveCount(0);
  await page.getByLabel("配装名称", { exact: true }).fill("只用文件保存");
  await page.getByLabel("BD描述Markdown", { exact: true }).fill("# 文件说明");
  const downloaded = await downloadBuild(page);
  expect(downloaded.description).toBe("# 文件说明");
  await expect(page.locator(".build-caption")).toContainText("已发起下载");
  await page.reload();
  await expect(page.getByLabel("配装名称", { exact: true })).not.toHaveValue(
    downloaded.name,
  );
  await page.getByLabel("导入BD或旧备份JSON", { exact: true }).setInputFiles({
    name: "BD.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(downloaded)),
  });
  await expect(page.getByLabel("BD描述Markdown", { exact: true })).toHaveValue(
    downloaded.description!,
  );
  const imported = await downloadBuild(page);
  expect(imported.id).not.toBe(downloaded.id);
  expect(imported.name).toBe(downloaded.name);
  expect(
    await page.evaluate(() => localStorage.getItem("p12.builds.v1")),
  ).toBeNull();
});

for (const width of [1440, 390]) {
  test(`${width}px旧浏览器配装只读迁移可下载和载入，原始记录不变`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const b = { ...createBuild(), name: "旧版治疗幻术", description: "旧说明" };
    const metadata = { [b.id]: { favorite: true, tags: ["开荒"] } };
    await page.addInitScript(
      ({ build, metadata }) => {
        localStorage.setItem("p12.builds.v1", JSON.stringify([build]));
        localStorage.setItem(
          "p12.library-metadata.v1",
          JSON.stringify({ version: 1, entries: metadata }),
        );
        Storage.prototype.setItem = () => {
          throw Error("forbidden browser write");
        };
        Storage.prototype.removeItem = () => {
          throw Error("forbidden browser deletion");
        };
      },
      { build: b, metadata },
    );
    await page.goto("/");
    await expect(page.getByLabel("配装名称", { exact: true })).not.toHaveValue(
      b.name,
    );
    await page
      .getByRole("button", { name: "迁移旧浏览器配装", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "旧配装迁移",
      exact: true,
    });
    const waiting = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: `下载${b.name}`, exact: true })
      .click();
    expect(
      JSON.parse(readFileSync((await (await waiting).path())!, "utf8")),
    ).toEqual(b);
    const backupDownload = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "下载旧整库备份", exact: true })
      .click();
    const backup = JSON.parse(
      readFileSync((await (await backupDownload).path())!, "utf8"),
    );
    expect(backup.metadata).toEqual(metadata);
    expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    await dialog
      .getByRole("button", { name: `载入${b.name}`, exact: true })
      .click();
    await expect(
      page.getByLabel("BD描述Markdown", { exact: true }),
    ).toHaveValue(b.description);
    expect((await downloadBuild(page)).id).not.toBe(b.id);
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("p12.builds.v1")!),
      ),
    ).toEqual([b]);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("p12.library-metadata.v1")!).entries,
      ),
    ).toEqual(metadata);
  });
}

test("旧整库备份读取到会话用于下载，坏备份保留当前草稿", async ({ page }) => {
  const b = { ...createBuild(), name: "备份内的BD" };
  const backup = createLibraryBackup([b, createBuild("Guardian")], {});
  await page.goto("/");
  await page.getByLabel("配装名称", { exact: true }).fill("原草稿");
  await page.getByLabel("导入BD或旧备份JSON", { exact: true }).setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  const dialog = page.getByRole("dialog", { name: "旧配装迁移", exact: true });
  await expect(dialog.locator(".library-card")).toHaveCount(2);
  const downloading = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: `下载${b.name}`, exact: true })
    .click();
  expect(
    JSON.parse(readFileSync((await (await downloading).path())!, "utf8")),
  ).toEqual(b);
  await dialog
    .getByRole("button", { name: "关闭旧配装迁移", exact: true })
    .click();
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
    "原草稿",
  );
  await page.getByLabel("导入BD或旧备份JSON", { exact: true }).setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...backup, version: 9 })),
  });
  await expect(page.getByRole("status")).toContainText("导入失败");
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
    "原草稿",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("p12.builds.v1")),
  ).toBeNull();
});
