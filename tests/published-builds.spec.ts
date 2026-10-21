import { test, expect } from "@playwright/test";
import { createBuild } from "../src/domain";
const build = {
  ...createBuild(),
  name: "公开幻术BD",
  description: "# 公开讲解\n参考 [幻象回复](gw2:trait/1866)。",
};
const file = `bd-${"b".repeat(64)}.json`;
const manifest = {
  schema: 1,
  builds: [
    { id: build.id, name: build.name, profession: build.profession, file },
  ],
};

test("公开BD库读取文件、直达及刷新正常，在线可以下载、缓存和复制编辑", async ({
  page,
}) => {
  await page.route("**/bd/index.json", (route) =>
    route.fulfill({ json: manifest }),
  );
  await page.route(`**/bd/${file}`, (route) => route.fulfill({ json: build }));
  await page.goto("/");
  await page.getByRole("button", { name: "公开 BD 库", exact: true }).click();
  await page
    .getByRole("dialog", { name: "公开BD库", exact: true })
    .getByRole("button", { name: /公开幻术BD/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "公开讲解", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  expect(new URL(page.url()).hash).toBe("#bd=" + encodeURIComponent(build.id));
  await page.getByRole("button", { name: "存到浏览器", exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("p12.builds.v1")!)[0].description,
    ),
  ).toBe(build.description);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe("公开幻术BD.json");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "公开讲解", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "复制编辑", exact: true }).click();
  await expect(page.getByLabel("BD描述Markdown", { exact: true })).toHaveValue(
    build.description,
  );
  await expect(
    page.getByLabel("配装名称", { exact: true }),
  ).not.toHaveAttribute("readonly", "");
});

test("公开目录失败或存在非法文件路径时不读取外部地址且保留当前配装", async ({
  page,
}) => {
  await page.route("**/bd/index.json", (route) =>
    route.fulfill({
      json: {
        ...manifest,
        builds: [{ ...manifest.builds[0], file: "../../private.json" }],
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("配装名称", { exact: true }).fill("保留中的草稿");
  await page.getByRole("button", { name: "公开 BD 库", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("展示目录读取失败");
  await page.getByRole("button", { name: "关闭公开BD库", exact: true }).click();
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
    "保留中的草稿",
  );
});

test("异步读取公开BD期间编辑新草稿，迟到响应不会覆盖本地修改", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/bd/index.json", (route) =>
    route.fulfill({ json: manifest }),
  );
  await page.route(`**/bd/${file}`, async (route) => {
    started();
    await gate;
    await route.fulfill({ json: build });
  });
  await page.goto("/#bd=" + encodeURIComponent(build.id));
  await pending;
  await page.getByLabel("配装名称", { exact: true }).fill("刚编辑的新草稿");
  await expect(page.locator(".build-caption")).toContainText("尚未保存");
  const received = page.waitForResponse((response) =>
    response.url().endsWith(`/bd/${file}`),
  );
  release();
  await (await received).finished();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
  );
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
    "刚编辑的新草稿",
  );
  await expect(
    page.getByLabel("配装名称", { exact: true }),
  ).not.toHaveAttribute("readonly", "");
});
