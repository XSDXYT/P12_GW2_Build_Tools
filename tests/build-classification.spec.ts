import { loadBuild, downloadBuild, reloadBuild } from "./build-fixtures";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createBuild, decodeShare } from "../src/domain";

test("构筑标题标签及多副本场景随保存、JSON和分享保留，只读展示不能修改属性", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const properties = page.getByRole("group", { name: "BD属性", exact: true });
  await expect(properties).toBeVisible();
  await page.getByLabel("配装名称", { exact: true }).fill("治疗幻术 · 开荒");
  await properties
    .getByLabel("新增构筑标签", { exact: true })
    .fill("治疗，开荒，治疗");
  await properties
    .getByRole("button", { name: "添加标签", exact: true })
    .click();
  await expect(properties.locator(".build-badge")).toHaveCount(2);
  async function add(instance: string, boss: string) {
    await properties.getByLabel("适用副本", { exact: true }).fill(instance);
    await properties.getByLabel("适用BOSS", { exact: true }).fill(boss);
    await properties
      .getByRole("button", { name: "添加适用场景", exact: true })
      .click();
  }
  await add("灵魂山谷", "山谷守护者");
  await add("赎罪堡垒", "");
  await add("灵魂山谷", "山谷守护者");
  await expect(properties.getByRole("alert")).toContainText("已添加");
  await expect(properties.locator(".build-encounters li")).toHaveCount(2);
  await properties.getByLabel("适用副本", { exact: true }).fill("");
  await properties.getByLabel("适用BOSS", { exact: true }).fill("");
  expect((await downloadBuild(page)).name).toBe("治疗幻术 · 开荒");
  await reloadBuild(page);
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
    "治疗幻术 · 开荒",
  );
  await expect(properties.locator(".build-badge")).toHaveCount(2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 BD", exact: true }).click();
  const exported = JSON.parse(
    readFileSync((await (await download).path())!, "utf8"),
  );
  expect(exported.tags).toEqual(["治疗", "开荒"]);
  expect(exported.encounters).toEqual([
    { instance: "灵魂山谷", boss: "山谷守护者", mode: "normal" },
    { instance: "赎罪堡垒", mode: "normal" },
  ]);
  await page.getByRole("button", { name: "分享配装 ↗", exact: true }).click();
  const link = await page.locator(".share input").inputValue();
  expect(decodeShare(link.split("#build=")[1])).toEqual(exported);
  const viewer = await context.newPage();
  await viewer.setViewportSize({ width: 390, height: 844 });
  await viewer.goto(link, { waitUntil: "domcontentloaded" });
  const readonly = viewer.getByRole("group", { name: "BD属性", exact: true });
  await expect(readonly).toContainText("赎罪堡垒 / 副本通用");
  await expect(readonly.locator("input, button")).toHaveCount(0);
  const cached = await downloadBuild(viewer);
  expect(cached.tags).toEqual(exported.tags);
  expect(cached.encounters).toEqual(exported.encounters);
  await viewer.getByRole("button", { name: "复制编辑", exact: true }).click();
  await readonly
    .getByRole("button", { name: "移除构筑标签开荒", exact: true })
    .click();
  await expect(readonly.locator(".build-badge")).toHaveCount(1);
  expect(
    await viewer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await readonly.screenshot({
    path: "test-results/build-properties-mobile.png",
  });
});

test("公开BD库按副本BOSS与职业分组，支持标签关键词组合筛选，旧BD显示未分类", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const builds = [
    {
      ...createBuild("Mesmer"),
      name: "跨副本幻术",
      tags: ["治疗", "开荒"],
      encounters: [
        { instance: "副本甲", boss: "首领甲" },
        { instance: "副本乙", boss: "首领乙" },
      ],
    },
    {
      ...createBuild("Guardian"),
      name: "同名首领守护",
      tags: ["输出"],
      encounters: [{ instance: "副本乙", boss: "首领甲" }],
    },
    {
      ...createBuild("Warrior"),
      name: "通用战士",
      encounters: [{ instance: "副本甲" }],
    },
    { ...createBuild("Mesmer"), name: "旧版通用构筑" },
  ];
  const entries = builds.map((build, i) => ({
    id: build.id,
    name: build.name,
    profession: build.profession,
    tags: build.tags,
    encounters: build.encounters,
    file: `bd-${"abcd"[i].repeat(64)}.json`,
  }));
  await page.route("**/bd/index.json", (route) =>
    route.fulfill({ json: { schema: 1, builds: entries } }),
  );
  for (let i = 0; i < entries.length; i++)
    await page.route(`**/bd/${entries[i].file}`, (route) =>
      route.fulfill({ json: builds[i] }),
    );
  await page.goto("/");
  await page.getByRole("button", { name: "公开 BD 库", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "公开BD库", exact: true });
  await expect(
    dialog.getByRole("region", { name: "未分类", exact: true }),
  ).toContainText("旧版通用构筑");
  await expect(dialog.getByRole("button", { name: /跨副本幻术/ })).toHaveCount(
    2,
  );
  await dialog.screenshot({
    path: "test-results/archive-populated-desktop.png",
  });
  await dialog
    .getByLabel("公开BD筛选副本", { exact: true })
    .selectOption("副本乙");
  await dialog
    .getByLabel("公开BD筛选BOSS", { exact: true })
    .selectOption("首领甲");
  await expect(dialog.locator(".library-row")).toHaveCount(1);
  await expect(dialog.locator(".library-row")).toContainText("同名首领守护");
  await dialog
    .getByLabel("公开BD筛选副本", { exact: true })
    .selectOption("副本甲");
  await expect(
    dialog.getByLabel("公开BD筛选BOSS", { exact: true }),
  ).toHaveValue("");
  await expect(dialog.getByRole("heading", { name: /副本通用/ })).toBeVisible();
  await dialog.getByRole("button", { name: "清除筛选", exact: true }).click();
  await dialog
    .getByLabel("BD列表分组", { exact: true })
    .selectOption("profession");
  await expect(dialog.locator(".build-list-group")).toHaveCount(3);
  await dialog
    .getByLabel("筛选公开BD职业", { exact: true })
    .selectOption("Mesmer");
  await dialog
    .getByLabel("筛选公开BD标签", { exact: true })
    .selectOption("开荒");
  await dialog
    .getByLabel("搜索公开BD名称", { exact: true })
    .fill("首领乙 治疗");
  await expect(dialog.locator(".library-row")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await dialog.screenshot({ path: "test-results/build-browse-mobile.png" });
  await dialog.getByRole("button", { name: /跨副本幻术/ }).click();
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
    "跨副本幻术",
  );
  await expect(
    page.getByRole("group", { name: "BD属性", exact: true }),
  ).toContainText("开荒");
});

test("内置副本BOSS支持名称别名检索、键盘及手机点击，三种模式独立添加并保存分享", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/api\.guildwars2\.com|wiki\.wishingstar\.top/.test(request.url()))
      requests.push(request.url());
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const properties = page.getByRole("group", { name: "BD属性", exact: true });
  const instance = properties.getByRole("combobox", {
    name: "适用副本",
    exact: true,
  });
  const boss = properties.getByRole("combobox", {
    name: "适用BOSS",
    exact: true,
  });
  await instance.fill("W1");
  await expect(
    properties.getByRole("listbox", { name: "副本检索结果", exact: true }),
  ).toBeVisible();
  await instance.press("ArrowDown");
  await instance.press("Enter");
  await expect(instance).toHaveValue("灵魂山谷");
  await instance.click();
  await expect(instance).toHaveAttribute("aria-expanded", "true");
  await instance.press("Escape");
  await boss.fill("VG");
  await boss.press("Enter");
  await expect(boss).toHaveValue("山谷守护者");
  await instance.fill("菲勃");
  await expect(boss).toHaveValue("");
  await properties.getByRole("option", { name: /菲勃神殿/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const mode of ["normal", "challenge", "legendary"]) {
    if (!(await instance.inputValue())) {
      await boss.fill("Cerus");
      await properties
        .getByRole("option", { name: /塞鲁斯.*菲勃神殿/ })
        .click();
    } else {
      await boss.fill("Cerus");
      await properties
        .getByRole("option", { name: /塞鲁斯.*菲勃神殿/ })
        .click();
    }
    await expect(instance).toHaveValue("菲勃神殿");
    await properties.getByLabel("适用模式", { exact: true }).selectOption(mode);
    await properties
      .getByRole("button", { name: "添加适用场景", exact: true })
      .click();
  }
  await expect(properties.locator(".build-encounters li")).toHaveCount(3);
  await instance.fill("自定义团队场景");
  await expect(
    properties.getByRole("listbox", { name: "副本检索结果" }),
  ).toContainText("没有匹配项");
  await instance.press("Escape");
  await expect(instance).toHaveValue("自定义团队场景");
  await expect(properties.getByRole("listbox")).toHaveCount(0);
  await boss.fill("自定义首领");
  await boss.press("Escape");
  await properties
    .getByRole("button", { name: "添加适用场景", exact: true })
    .click();

  await page.getByRole("button", { name: "分享配装 ↗", exact: true }).click();
  const decoded = decodeShare(
    (await page.locator(".share input").inputValue()).split("#build=")[1],
  );
  expect(decoded.encounters?.slice(0, 3).map((e) => e.mode)).toEqual([
    "normal",
    "challenge",
    "legendary",
  ]);
  const file = `bd-${"c".repeat(64)}.json`;
  await page.route("**/bd/index.json", (route) =>
    route.fulfill({
      json: {
        schema: 1,
        builds: [
          {
            id: decoded.id,
            name: decoded.name,
            profession: decoded.profession,
            tags: decoded.tags,
            encounters: decoded.encounters,
            file,
          },
        ],
      },
    }),
  );
  await page.route(`**/bd/${file}`, (route) =>
    route.fulfill({ json: decoded }),
  );
  await page.getByRole("button", { name: "公开 BD 库", exact: true }).click();
  const published = page.getByRole("dialog", { name: "公开BD库", exact: true });
  await published
    .getByLabel("公开BD筛选副本", { exact: true })
    .selectOption("菲勃神殿");
  await published
    .getByLabel("公开BD筛选模式", { exact: true })
    .selectOption("legendary");
  await expect(
    published.getByRole("heading", { name: /塞鲁斯 · 传奇挑战/ }),
  ).toBeVisible();
  await expect(published.locator(".library-row")).toHaveCount(1);
  await published
    .getByRole("button", { name: "关闭公开BD库", exact: true })
    .click();
  await instance.fill("W1");
  await page.locator(".build-description").screenshot({
    path: "test-results/encounter-search-mobile.png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(requests).toEqual([]);
});
