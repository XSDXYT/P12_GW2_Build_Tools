import { loadBuild, downloadBuild, reloadBuild } from "./build-fixtures";
import { test, expect, type Page } from "@playwright/test";
import { createBuild, encodeShare, type Build } from "../src/domain";

const professionCases = [
  {
    profession: "Guardian",
    spec: 27,
    elite: true,
    skill: 30025,
    slot: 0,
    name: "净化陷阱",
    expected: "6480 + 1 × 治疗效果",
  },
  {
    profession: "Warrior",
    spec: 22,
    elite: false,
    name: "怒气恢复",
    expected: "2,992 · 15 秒 · 2 层",
  },
  {
    profession: "Engineer",
    spec: 57,
    elite: true,
    name: "太阳聚镜",
    expected: "光子熔炉过热：4 秒 · 6 层",
  },
  {
    profession: "Ranger",
    spec: 5,
    elite: true,
    skill: 31677,
    slot: 4,
    name: "群星雕文",
    expected: "非天界化身形态：移除区域内盟友的症状，并为其提供稳固",
  },
  {
    profession: "Thief",
    spec: 28,
    elite: false,
    skill: 13046,
    slot: 1,
    name: "刺客纹章",
    expected: "主动威力提高：5 秒 · 540 威力",
  },
  {
    profession: "Elementalist",
    spec: 56,
    elite: true,
    name: "迅速复仇",
    expected: "大地协调：25 耐力",
  },
  {
    profession: "Necromancer",
    spec: 19,
    elite: false,
    name: "吸血光环",
    expected: "帷幕中虹吸伤害：129 + 0.0666 × 威力",
  },
  {
    profession: "Revenant",
    spec: 79,
    elite: true,
    skill: 26557,
    slot: 1,
    name: "复仇之锤",
    expected: "能量维持消耗：-6",
  },
] as const;

for (const item of professionCases)
  test(`${item.profession} Wiki 详情在只读窄屏保留职业条件且不访问上游`, async ({
    page,
  }) => {
    const b = createBuild(item.profession);
    b.specs[item.elite ? 2 : 0] = { id: item.spec, traits: [null, null, null] };
    if ("skill" in item) b.skills[item.slot] = item.skill;
    const requests: string[] = [];
    page.on("request", (r) => {
      if (/wiki\.(wishingstar\.top|guildwars2\.com)/.test(r.url()))
        requests.push(r.url());
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#build=" + encodeShare(b));
    await expect(page.locator(".trait-lines")).toBeVisible();
    const button =
      "skill" in item
        ? page.getByRole("button", {
            name: [
              "选择治疗技能",
              "选择通用一技能",
              "选择通用二技能",
              "选择通用三技能",
              "选择精英技能",
            ][item.slot],
            exact: true,
          })
        : page.getByRole("button", { name: item.name, exact: true });
    await button.click();
    const card = page.getByRole("dialog", { name: item.name, exact: true });
    await expect(card).toContainText(item.expected);
    if (item.profession === "Warrior")
      await expect(card).toContainText("2992 + 0.6 × 治疗效果");
    await expect(card.locator(".game-tooltip-mode")).toHaveText("PvE");
    await expect(card).not.toContainText(/待核对|效果记录|核对日期/);
    const bounds = await card.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(12);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(379);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(833);
    await card.screenshot({
      path: `test-results/wiki-${item.profession.toLowerCase()}-mobile.png`,
    });
    await page.keyboard.press("Escape");
    await reloadBuild(page);
    await button.click();
    await expect(card).toContainText(item.expected);
    expect(requests).toEqual([]);
  });

function mesmer(elite?: number) {
  const b = createBuild("Mesmer");
  b.specs[0] = { id: 23, traits: [null, null, 1866] };
  if (elite) b.specs[2] = { id: elite, traits: [null, null, null] };
  b.skills[1] = 10232;
  return b;
}

test("幻术实际点选与取消特性更新潜行及主动效果，组合效果和只读分享保持一致", async ({
  page,
}) => {
  const b = createBuild("Mesmer");
  b.specs[0] = { id: 45, traits: [null, null, null] };
  b.specs[1] = { id: 23, traits: [null, null, null] };
  b.skills[1] = 10234;
  await seed(page, b);
  const icon = page.getByRole("button", {
    name: "选择通用一技能",
    exact: true,
  });
  const card = page.getByRole("dialog", { name: "午夜纹章", exact: true });
  await icon.hover();
  await expect(card).toContainText("潜行：2 秒");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "万华领悟", exact: true }).click();
  await icon.hover();
  await expect(card).toContainText("潜行：3 秒");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "模糊铭文", exact: true }).click();
  await icon.hover();
  await expect(card).toContainText("症状移除：5");
  await expect(card).toContainText("失真：1 秒");
  await expect(card).toContainText("潜行：3 秒");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "混乱塑造", exact: true }).click();
  await icon.hover();
  await expect(card).toContainText("潜行：2 秒");
  await expect(card).toContainText("症状移除：5");
  await page.keyboard.press("Escape");
  b.specs[0].traits[2] = 674;
  b.specs[1].traits[2] = 752;
  const hash = "#build=" + encodeShare(b);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/" + hash);
  await icon.click();
  await expect(card).toContainText("潜行：3 秒");
  await expect(card).toContainText("症状移除：5");
  await expect(card).not.toContainText(/待核对|效果记录|核对日期/);
  await card.screenshot({
    path: "test-results/wiki-mesmer-trait-modifiers.png",
  });
  expect(new URL(page.url()).hash).toBe(hash);
  await reloadBuild(page);
  await icon.click();
  await expect(card).toContainText("潜行：3 秒");
});
async function seed(page: Page, b: Build) {
  await loadBuild(page, b);
  await expect(page.locator(".trait-lines")).toBeVisible();
}

test("幻象回复展示 Wiki PvE 治疗公式、来源和触发说明，悬停不请求 Wiki 或修改 BD", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (/wiki\.wishingstar\.top|wiki\.guildwars2\.com/.test(r.url()))
      requests.push(r.url());
  });
  await seed(page, mesmer());
  const before = await page.evaluate(() =>
    localStorage.getItem("p12.builds.v1"),
  );
  await page.getByRole("button", { name: "幻象回复", exact: true }).hover();
  const card = page.getByRole("dialog", { name: "幻象回复", exact: true });
  await expect(card.locator(".game-tooltip-mode")).toHaveText("PvE");
  await expect(card).toContainText("219 + 0.77 × 治疗效果");
  await expect(card).toContainText("936 + 0.77 × 治疗效果");
  await expect(card).toContainText("症状移除：1");
  await expect(card).toContainText("无需等待分身实际粉碎");
  await expect(card).not.toContainText(/0\.46|0\.3 ×|待核对|核对日期/);
  await expect(
    card.getByRole("link", { name: "Wiki PvE 来源 ↗" }),
  ).toHaveAttribute("href", /Restorative_Illusions$/);
  await card.screenshot({ path: "test-results/wiki-restorative-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator(".build-caption")).toContainText("已就绪");
  expect(await page.evaluate(() => localStorage.getItem("p12.builds.v1"))).toBe(
    before,
  );
  expect(requests).toEqual([]);
});

for (const [elite, expected, absent] of [
  [66, "1128 + 0.77 × 治疗效果", "每件乐器渐强治疗"],
  [73, "330 + 0.25 × 治疗效果", "5 把灵刃治疗"],
] as const) {
  test(`只读分享中的幻象回复按特长 ${elite} 展示专属分支，390px 可完整阅读`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#build=" + encodeShare(mesmer(elite)));
    const icon = page.getByRole("button", { name: "幻象回复", exact: true });
    await icon.click();
    const card = page.getByRole("dialog", { name: "幻象回复", exact: true });
    await expect(card).toContainText(expected);
    await expect(card).not.toContainText(absent);
    await expect(icon).toHaveAttribute("aria-pressed", "true");
    const bounds = await card.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(12);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(379);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(833);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await card.screenshot({
      path: `test-results/wiki-restorative-${elite}-mobile.png`,
    });
    await page.keyboard.press("Escape");
    await reloadBuild(page);
    await icon.click();
    await expect(card).toContainText(expected);
  });
}

test("Wiki 支配纹章使用 PvE 昏迷与冷却，实际点选模糊铭文更新主动效果及联动说明", async ({
  page,
}) => {
  const b = mesmer();
  b.specs[0].traits = [null, null, null];
  await seed(page, b);
  const icon = page.getByRole("button", {
    name: "选择通用一技能",
    exact: true,
  });
  await icon.hover();
  const card = page.getByRole("dialog", { name: "支配纹章", exact: true });
  await expect(card).toContainText("冷却时间：25 秒");
  await expect(card).toContainText("昏迷：2 秒");
  await expect(card).toContainText("增益移除：3");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "模糊铭文", exact: true }).click();
  await icon.hover();
  await expect(card).toContainText("增益移除：5");
  await expect(card.locator(".fact-modified").first()).toContainText(
    "特性修正",
  );
  await expect(card).toContainText("已选特性联动");
  await expect(card).toContainText("模糊铭文");
  await card.screenshot({ path: "test-results/wiki-signet-desktop.png" });
});

for (const item of [
  {
    profession: "Ranger",
    spec: 5,
    slot: 1,
    skill: 31322,
    name: "结盟雕文",
    groups: ["非天界化身形态", "天界化身形态"],
    count: 2,
  },
  {
    profession: "Elementalist",
    slot: 1,
    skill: 5734,
    name: "风暴雕文",
    groups: ["火焰协调", "空气协调"],
    count: 4,
  },
  {
    profession: "Necromancer",
    slot: 0,
    skill: 10547,
    name: "召唤血魔",
    groups: ["召唤物指令"],
    count: 1,
  },
] as const) {
  test(`${item.profession} 关联技能在窄屏分组展开，来源独立且不改变分享或存储`, async ({
    page,
  }) => {
    const b = createBuild(item.profession);
    if ("spec" in item)
      b.specs[2] = { id: item.spec, traits: [null, null, null] };
    b.skills[item.slot] = item.skill;
    const hash = "#build=" + encodeShare(b);
    const requests: string[] = [];
    page.on("request", (r) => {
      if (
        /wiki\.(wishingstar\.top|guildwars2\.com)|api\.guildwars2\.com/.test(
          r.url(),
        )
      )
        requests.push(r.url());
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/" + hash);
    const stored = await page.evaluate(() =>
      localStorage.getItem("p12.builds.v1"),
    );
    const button = page.getByRole("button", {
      name: item.slot === 0 ? "选择治疗技能" : "选择通用一技能",
      exact: true,
    });
    await button.click();
    const card = page.getByRole("dialog", { name: item.name, exact: true });
    const branches = card.locator(".game-tooltip-branch");
    await expect(branches).toHaveCount(item.count);
    for (const group of item.groups) {
      const branch = branches
        .filter({
          has: page
            .locator("summary")
            .filter({ hasText: new RegExp("^" + group + " ·") }),
        })
        .first();
      await branch.locator("summary").click();
      await expect(branch).toHaveAttribute("open", "");
      await expect(branch.locator("li").first()).toBeVisible();
      await expect(
        branch.getByRole("link", { name: "分支 Wiki 来源 ↗" }),
      ).toHaveAttribute("href", /^https:\/\/wiki.wishingstar.top\/wiki\//);
    }
    await expect(card).not.toContainText(/待核对|效果记录|\[sic\]/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await card.screenshot({
      path: `test-results/wiki-branches-${item.profession.toLowerCase()}.png`,
    });
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(() => localStorage.getItem("p12.builds.v1")),
    ).toBe(stored);
    expect(new URL(page.url()).hash).toBe(hash);
    await reloadBuild(page);
    await button.click();
    await expect(card.locator(".game-tooltip-branch[open]")).toHaveCount(0);
    expect(requests).toEqual([]);
  });
}
