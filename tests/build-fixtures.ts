import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseBuild, type Build } from "../src/domain";

const fixtures = new WeakMap<Page, Build>();

// Use the supported file-folder workflow, never browser persistence, to seed an editor.
export async function loadBuild(page: Page, build: Build) {
  fixtures.set(page, build);
  await page.goto("/");
  await page.evaluate((value) => {
    const entry = {
      kind: "file" as const,
      name: "fixture.json",
      getFile: async () => new File([JSON.stringify(value)], "fixture.json"),
    };
    window.showDirectoryPicker = async () => ({
      kind: "directory",
      name: "fixtures",
      async *values() {
        yield entry;
      },
      getFileHandle: async () => ({
        ...entry,
        createWritable: async () => {
          throw Error("Read-only test fixture");
        },
      }),
    });
  }, build);
  await page
    .getByRole("button", { name: "连接 BD 文件夹", exact: true })
    .click();
  await page
    .getByLabel("载入文件夹中的BD", { exact: true })
    .selectOption(build.id);
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
    build.name,
  );
  await expect(page.locator(".trait-lines")).toBeVisible();
  await page.keyboard.press("Tab");
}

export async function downloadBuild(page: Page) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 BD", exact: true }).click();
  const build = parseBuild(
    readFileSync((await (await waiting).path())!, "utf8"),
  );
  fixtures.set(page, build);
  return build;
}

// Reload then explicitly restore a file; the app itself must not restore browser state.
export async function reloadBuild(page: Page) {
  if (new URL(page.url()).hash || !fixtures.has(page)) return page.reload();
  return loadBuild(page, fixtures.get(page)!);
}
