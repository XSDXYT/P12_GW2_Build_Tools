import { test, expect, type Page } from "@playwright/test";
import { createBuild, type Build } from "../src/domain";

function fixtures() {
  return [
    {
      ...createBuild(),
      name: "治疗幻术",
      tags: ["治疗", "开荒"],
      encounters: [
        { instance: "副本甲", boss: "首领甲", mode: "normal" },
        { instance: "副本乙", boss: "首领乙", mode: "challenge" },
      ],
      description: "旧说明",
    },
    {
      ...createBuild("Guardian"),
      name: "输出守护",
      tags: ["输出"],
      encounters: [{ instance: "副本乙", boss: "首领甲", mode: "legendary" }],
    },
    { ...createBuild("Warrior"), name: "未分类战士" },
  ] as Build[];
}

async function prepare(
  page: Page,
  builds = fixtures(),
  extra: Record<string, string> = {},
) {
  await page.goto("/");
  await expect(page.locator(".trait-lines")).toBeVisible();
  await page.evaluate(
    ({ builds, extra }) => {
      const state = {
        files: {
          ...Object.fromEntries(
            builds.map((b, i) => [`original-${i}.json`, JSON.stringify(b)]),
          ),
          ...extra,
        } as Record<string, string>,
        fail: false,
        cancel: false,
        hold: false,
        readStarted: false,
        release: null as (() => void) | null,
        writes: 0,
      };
      (window as any).__localFolder = state;
      const handle = (name: string) => ({
        kind: "file" as const,
        name,
        getFile: async () => new File([state.files[name]], name),
        createWritable: async () => {
          let pending = "";
          return {
            write: async (value: string) => {
              pending = value;
            },
            close: async () => {
              state.files[name] = pending;
            },
            abort: async () => {},
          };
        },
      });
      window.showDirectoryPicker = async () => {
        if (state.cancel) throw new DOMException("cancel", "AbortError");
        return {
          kind: "directory",
          name: "我的本地BD",
          async *values() {
            if (state.fail) throw new DOMException("denied", "NotAllowedError");
            for (const name of Object.keys(state.files)) yield handle(name);
            yield { kind: "directory", name: "不递归读取" };
          },
          getFileHandle: async (
            name: string,
            options?: { create: boolean },
          ) => {
            state.readStarted = true;
            if (state.hold)
              await new Promise<void>((resolve) => {
                state.release = resolve;
              });
            if (!(name in state.files) && !options?.create)
              throw new DOMException("missing", "NotFoundError");
            if (!(name in state.files)) state.files[name] = "";
            return handle(name);
          },
        };
      };
      Storage.prototype.setItem = () => {
        state.writes++;
        throw Error("No browser saves");
      };
    },
    { builds, extra },
  );
  return builds;
}

test("本地库授权后复用卡片/分组和组合检索，跳过坏文件；实时载入并原位保存，不读公开库或写浏览器", async ({
  page,
}) => {
  const builds = fixtures();
  await prepare(page, builds, {
    "bad.json": "broken",
    "duplicate.json": JSON.stringify(builds[0]),
  });
  let publicRequests = 0;
  page.on("request", (request) => {
    if (/\/bd\//.test(request.url())) publicRequests++;
  });
  await page.getByRole("button", { name: "本地 BD 库", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "本地BD库", exact: true });
  await expect(dialog.locator(".library-count")).toContainText("3 / 3");
  await expect(dialog.locator(".archive-intro")).toContainText("跳过 2 个");
  await expect(
    dialog.getByRole("region", { name: "未分类", exact: true }),
  ).toContainText("未分类战士");
  await expect(dialog.locator(".archive-card")).toHaveCount(4);
  await dialog
    .getByLabel("本地BD筛选副本", { exact: true })
    .selectOption("副本乙");
  await dialog
    .getByLabel("本地BD筛选BOSS", { exact: true })
    .selectOption("首领乙");
  await dialog
    .getByLabel("本地BD筛选模式", { exact: true })
    .selectOption("challenge");
  await dialog
    .getByLabel("筛选本地BD标签", { exact: true })
    .selectOption("治疗");
  await dialog.getByLabel("搜索本地BD名称", { exact: true }).fill("开荒 幻术");
  await expect(dialog.locator(".archive-card")).toHaveCount(1);
  await dialog.getByRole("button", { name: "清除筛选", exact: true }).click();
  await dialog
    .getByLabel("BD列表分组", { exact: true })
    .selectOption("profession");
  await expect(dialog.locator(".build-list-group")).toHaveCount(3);
  await dialog
    .getByLabel("筛选本地BD职业", { exact: true })
    .selectOption("Mesmer");
  await page.evaluate(() => {
    const state = (window as any).__localFolder;
    const b = JSON.parse(state.files["original-0.json"]);
    b.description = "磁盘中刚修改的说明";
    state.files["original-0.json"] = JSON.stringify(b);
  });
  await dialog.getByRole("button", { name: /治疗幻术/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("BD描述Markdown", { exact: true })).toHaveValue(
    "磁盘中刚修改的说明",
  );
  expect(new URL(page.url()).hash).toBe("");
  await page.getByLabel("配装名称", { exact: true }).fill("更新后的标题");
  await page
    .getByRole("button", { name: "保存到 BD 文件夹", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("original-0.json");
  const snapshot = await page.evaluate(() => (window as any).__localFolder);
  expect(JSON.parse(snapshot.files["original-0.json"]).id).toBe(builds[0].id);
  expect(JSON.parse(snapshot.files["original-0.json"]).name).toBe(
    "更新后的标题",
  );
  expect(Object.keys(snapshot.files)).toHaveLength(5);
  expect(snapshot.writes).toBe(0);
  expect(publicRequests).toBe(0);
  await page.getByRole("button", { name: "本地 BD 库", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: /更新后的标题/ }),
  ).toHaveCount(2);
});

test("刷新读取外部新增删除，失败保留列表和草稿，身份被替换时拒绝打开", async ({
  page,
}) => {
  await prepare(page);
  await page.getByLabel("配装名称", { exact: true }).fill("保留的草稿");
  await page.getByRole("button", { name: "本地 BD 库", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "本地BD库", exact: true });
  await page.evaluate(
    (b) => {
      const state = (window as any).__localFolder;
      delete state.files["original-1.json"];
      state.files["new.json"] = JSON.stringify(b);
    },
    { ...createBuild("Ranger"), name: "新增游侠" },
  );
  await dialog.getByRole("button", { name: "刷新文件夹", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /输出守护/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /新增游侠/ })).toHaveCount(1);
  await page.evaluate(() => {
    (window as any).__localFolder.fail = true;
  });
  await dialog.getByRole("button", { name: "刷新文件夹", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("保留上次读取");
  await expect(dialog.getByRole("button", { name: /新增游侠/ })).toHaveCount(1);
  await page.evaluate(
    (b) => {
      const state = (window as any).__localFolder;
      state.fail = false;
      state.files["new.json"] = JSON.stringify(b);
    },
    { ...createBuild("Ranger"), name: "同文件换了身份" },
  );
  await dialog.getByRole("button", { name: /新增游侠/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("内容已变化");
  page.once("dialog", (prompt) => prompt.dismiss());
  await dialog.getByRole("button", { name: /未分类战士/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("当前草稿保留");
  await dialog
    .getByRole("button", { name: "关闭本地BD库", exact: true })
    .click();
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
    "保留的草稿",
  );
});

test("取消目录选择和不支持目录的浏览器保留草稿；空目录可浏览", async ({
  page,
}) => {
  await prepare(page, []);
  await page.getByLabel("BD描述Markdown", { exact: true }).fill("保留说明");
  await page.evaluate(() => {
    (window as any).__localFolder.cancel = true;
  });
  await page.getByRole("button", { name: "本地 BD 库", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "本地BD库", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__localFolder.cancel = false;
  });
  await page.getByRole("button", { name: "本地 BD 库", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "本地BD库", exact: true });
  await expect(dialog).toContainText("文件夹中还没有可用的 BD");
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    window.showDirectoryPicker = undefined;
  });
  await page
    .getByRole("button", { name: "更换 BD 文件夹", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("不支持直接连接文件夹");
  await expect(page.getByLabel("BD描述Markdown", { exact: true })).toHaveValue(
    "保留说明",
  );
});

test("关闭本地库取消迟到的文件载入，不能覆盖随后编辑", async ({ page }) => {
  await prepare(page);
  await page.getByRole("button", { name: "本地 BD 库", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "本地BD库", exact: true });
  await page.evaluate(() => {
    (window as any).__localFolder.hold = true;
  });
  await dialog.getByRole("button", { name: /未分类战士/ }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__localFolder.readStarted))
    .toBe(true);
  await page.keyboard.press("Escape");
  await page.getByLabel("配装名称", { exact: true }).fill("新的编辑");
  await page.evaluate(() => {
    (window as any).__localFolder.release();
  });
  await expect(
    page.getByRole("button", { name: "本地 BD 库", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
    "新的编辑",
  );
});

test("390px本地长列表可筛选和滚动，关闭后恢复背景；新页面不自动连接", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const builds = Array.from({ length: 80 }, (_, i) => ({
    ...createBuild(),
    name: `本地构筑 ${i}`,
    tags: ["治疗"],
  }));
  await prepare(page, builds);
  await page.evaluate(() => {
    document.body.style.overflow = "auto";
  });
  await page.getByRole("button", { name: "本地 BD 库", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "本地BD库", exact: true });
  await expect(dialog.locator(".archive-card")).toHaveCount(80);
  const last = dialog.getByRole("button", { name: /本地构筑 79/ });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  expect(
    await dialog.evaluate(
      (e) => getComputedStyle(e, "::backdrop").backdropFilter,
    ),
  ).toBe("none");
  await dialog
    .getByLabel("搜索本地BD名称", { exact: true })
    .fill("本地构筑 79");
  await expect(dialog.locator(".archive-card")).toHaveCount(1);
  await dialog.screenshot({ path: "test-results/local-library-mobile.png" });
  await dialog
    .getByRole("button", { name: "关闭本地BD库", exact: true })
    .click();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("auto");
  const fresh = await context.newPage();
  await fresh.goto("/");
  await expect(
    fresh.getByRole("button", { name: "连接 BD 文件夹", exact: true }),
  ).toBeVisible();
  expect(
    await fresh.evaluate(() => localStorage.getItem("p12.builds.v1")),
  ).toBeNull();
});
