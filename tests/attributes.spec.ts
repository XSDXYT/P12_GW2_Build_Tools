import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  createBuild,
  armorSlots,
  accessorySlots,
  encodeShare,
  decodeShare,
  type Build,
} from "../src/domain";

const catalog = JSON.parse(readFileSync("public/catalog.json", "utf8"));
function fixture(complete = false): Build {
  const b = createBuild();
  b.name = "属性面板验收";
  for (const key of [...armorSlots, ...accessorySlots])
    b.equipment[key].statId = 161;
  Object.assign(b.equipment.weapon1, {
    weapon: "Staff",
    statId: 161,
    infusions: [null, null],
  });
  b.equipment.offhand1.infusions = [];
  Object.assign(b.equipment.weapon2, { weapon: "Sword", statId: 161 });
  Object.assign(b.equipment.offhand2, { weapon: "Sword", statId: 161 });
  if (complete) {
    b.specs = catalog.specs
      .filter((s: any) => s.profession === "Mesmer" && !s.elite)
      .slice(0, 3)
      .map((s: any) => ({
        id: s.id,
        traits: [1, 2, 3].map(
          (t) =>
            catalog.traits.find(
              (x: any) =>
                x.specialization === s.id && x.slot === "Major" && x.tier === t,
            ).id,
        ),
      }));
    b.skills = ["Heal", "Utility", "Utility", "Utility", "Elite"].map(
      (type, i) =>
        catalog.skills.filter(
          (s: any) =>
            s.professions?.includes("Mesmer") &&
            s.type === type &&
            !s.specialization,
        )[type === "Utility" ? i - 1 : 0].id,
    );
  }
  return b;
}
async function seed(page: Page, b: Build) {
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem("attribute-fixture")) {
      localStorage.setItem("p12.builds.v1", JSON.stringify([value]));
      sessionStorage.setItem("attribute-fixture", "1");
    }
  }, b);
  await page.goto("/");
  await expect(page.locator('[data-value="Power"]')).toBeVisible();
}
const power = (page: Page) => page.locator('[data-value="Power"]');

test("属性随词条与武器组更新，来源和症状详情可展开", async ({ page }) => {
  await seed(page, fixture());
  await expect(power(page)).toHaveText("2,382");
  await expect(page.locator('[data-value="CriticalChance"]')).toHaveText(
    "50.71%",
  );
  await page.getByLabel("属性预览武器组").selectOption("2");
  await expect(power(page)).toHaveText("2,381");
  await page.getByLabel("属性预览武器组").selectOption("1");
  await page.getByRole("button", { name: "查看威力来源", exact: true }).click();
  await expect(page.locator(".attribute-breakdown")).toContainText(
    "头部 · 狂战士",
  );
  await expect(page.locator(".attribute-breakdown")).toContainText("+63");
  await page.getByRole("button", { name: "关闭属性来源" }).click();
  await page.getByRole("button", { name: "详情", exact: true }).click();
  await expect(page.locator('[data-value="Poison"]')).toHaveText("0.00%");
  await page.getByRole("button", { name: /整套词条/ }).click();
  await page.getByRole("option", { name: "天界", exact: true }).click();
  await expect(power(page)).not.toHaveText("2,382");
  await expect(page.locator('[data-value="ConditionBonus"]')).not.toHaveText(
    "0.00%",
  );
});

test("威能激怒只改变预览，保存/导出/分享不带条件，刷新重置", async ({
  page,
  context,
}) => {
  const b = fixture(true);
  await seed(page, b);
  const original = Number((await power(page).innerText()).replaceAll(",", ""));
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览威能层数").fill("25");
  await page.getByLabel("预览激怒", { exact: true }).check();
  await expect(power(page)).toHaveText(
    (original + 750).toLocaleString("en-US"),
  );
  await expect(page.locator('[data-attribute="Power"] del')).toHaveText(
    original.toLocaleString("en-US"),
  );
  await expect(page.locator(".build-caption")).toContainText("已就绪");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("p12.builds.v1")!)[0],
  );
  expect(saved).toEqual(b);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON", exact: true }).click();
  const download = await downloading;
  expect(JSON.parse(readFileSync((await download.path())!, "utf8"))).toEqual(b);
  await page.getByRole("button", { name: "分享配装 ↗" }).click();
  const link = await page.locator(".share input").inputValue();
  expect(decodeShare(link.split("#build=")[1])).toEqual(b);
  const viewer = await context.newPage();
  await viewer.goto(link);
  await expect(power(viewer)).toHaveText(original.toLocaleString("en-US"));
  await viewer.locator(".attribute-effects summary").click();
  await viewer.getByLabel("预览威能层数").fill("25");
  await expect(power(viewer)).toHaveText(
    (original + 750).toLocaleString("en-US"),
  );
  await expect(viewer.getByLabel("配装名称", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await page.reload();
  await expect(power(page)).toHaveText(original.toLocaleString("en-US"));
  await page.locator(".attribute-effects summary").click();
  await expect(page.getByLabel("预览威能层数")).toHaveValue("0");
  await expect(page.getByLabel("预览激怒", { exact: true })).not.toBeChecked();
});

test("符文特定症状时长自动展示，与通用时长叠加并显示上限", async ({ page }) => {
  const b = fixture();
  for (const key of armorSlots) b.equipment[key].runeId = 24687;
  b.equipment.weapon1.sigils = [24612, null];
  await seed(page, b);
  await expect(page.locator('[data-value="ConditionBonus"]')).toHaveText(
    "10.00%",
  );
  await expect(page.locator('[data-value="Bleeding"]')).toHaveText("50.00%");
  await expect(page.locator('[data-value="Poison"]')).toHaveText("20.00%");
  await expect(page.locator('[data-value="Burning"]')).toHaveCount(0);
  await page.getByRole("button", { name: "查看流血持续时间来源" }).click();
  await expect(page.locator(".attribute-breakdown")).toContainText("+20.00%");
  // A crafted legal prefix loadout can exceed the condition cap before bonuses.
  const capped = fixture();
  for (const key of [...armorSlots, ...accessorySlots, "weapon1"] as const) {
    const group = accessorySlots.includes(key as never)
      ? "trinket"
      : "equipment";
    const stat = catalog.stats
      .filter((s: any) => catalog.statChoices[group].includes(s.id))
      .sort(
        (a: any, b: any) =>
          (b.attributes.find((x: any) => x.attribute === "ConditionDuration")
            ?.multiplier || 0) -
          (a.attributes.find((x: any) => x.attribute === "ConditionDuration")
            ?.multiplier || 0),
      )[0];
    capped.equipment[key].statId = stat.id;
  }
  capped.relic = 100849;
  await page.goto("/#build=" + encodeShare(capped));
  await page.reload();
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览贵族古物层数").fill("5");
  await expect(page.locator('[data-value="ConditionBonus"]')).toHaveText(
    "100.00%",
  );
  await expect(
    page.locator('[data-attribute="ConditionBonus"]'),
  ).toHaveAttribute("title", /未封顶数值/);
});

test("属性资料加载失败显示重试，装备编辑仍可用", async ({ page }) => {
  await page.route("**/attribute-data.json", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/");
  await expect(page.locator(".attribute-loading")).toContainText("加载失败");
  await expect(power(page)).toHaveCount(0);
  await page
    .getByRole("button", { name: "头部属性：未选择", exact: true })
    .click();
  await page.getByRole("option", { name: "狂战士", exact: true }).click();
  await page.unroute("**/attribute-data.json");
  await page
    .getByRole("button", { name: "重新加载属性资料", exact: true })
    .click();
  await expect(power(page)).toHaveText("1,063");
});

test("手机属性、条件预览和来源展开后仍无横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const b = fixture();
  b.specs[0].id = 45;
  b.food = 91690;
  await seed(page, b);
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览威能层数").fill("25");
  await page.getByLabel("预览激怒", { exact: true }).check();
  await page.getByLabel("预览拥有再生").check();
  await page
    .getByRole("button", { name: "查看增益持续时间来源", exact: true })
    .click();
  await expect(page.locator(".attribute-breakdown")).toContainText("混沌执念");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/attributes-mobile.png",
    fullPage: true,
  });
  await page
    .locator(".attribute-panel")
    .screenshot({ path: "test-results/attributes-mobile-panel.png" });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: "test-results/attributes-desktop.png",
    fullPage: true,
  });
  await expect(page.locator("section.panel")).toHaveCount(2);
});

test("守护者纹章冷却联动属性，保存导出分享隔离且刷新重置", async ({
  page,
  context,
}) => {
  const b = fixture();
  b.profession = "Guardian";
  b.skills = [9158, 9093, 9151, 9163, 30461];
  b.specs = [16, 42, 49].map((id) => ({
    id,
    traits: [1, 2, 3].map(
      (tier) =>
        catalog.traits.find(
          (t: any) =>
            t.specialization === id &&
            t.tier === tier &&
            t.slot === "Major" &&
            t.id !== 579,
        ).id,
    ),
  }));
  await seed(page, b);
  const original = Number((await power(page).innerText()).replaceAll(",", ""));
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览怨毒纹章正在冷却", { exact: true }).check();
  await expect(power(page)).toHaveText(
    (original - 180).toLocaleString("en-US"),
  );
  await page.getByRole("button", { name: "查看威力来源", exact: true }).click();
  await expect(page.locator(".attribute-breakdown")).not.toContainText(
    "怨毒纹章 · 被动",
  );
  await page.getByLabel("预览怨毒纹章正在冷却", { exact: true }).uncheck();
  await expect(page.locator(".attribute-breakdown")).toContainText(
    "怨毒纹章 · 被动",
  );
  await page.getByLabel("预览怨毒纹章正在冷却", { exact: true }).check();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("p12.builds.v1")!)[0],
    ),
  ).toEqual(b);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON", exact: true }).click();
  expect(
    JSON.parse(readFileSync((await (await downloading).path())!, "utf8")),
  ).toEqual(b);
  await page.getByRole("button", { name: "分享配装 ↗" }).click();
  const link = await page.locator(".share input").inputValue();
  expect(decodeShare(link.split("#build=")[1])).toEqual(b);
  const viewer = await context.newPage();
  await viewer.goto(link);
  await expect(power(viewer)).toHaveText(original.toLocaleString("en-US"));
  await viewer.locator(".attribute-effects summary").click();
  await viewer.getByLabel("预览怨毒纹章正在冷却", { exact: true }).check();
  await expect(power(viewer)).toHaveText(
    (original - 180).toLocaleString("en-US"),
  );
  await page.reload();
  await expect(power(page)).toHaveText(original.toLocaleString("en-US"));
  await page.locator(".attribute-effects summary").click();
  await expect(
    page.getByLabel("预览怨毒纹章正在冷却", { exact: true }),
  ).not.toBeChecked();
});

test("完美铭刻使三个被动增强且冷却时保留，手机条件控件不溢出", async ({
  page,
}) => {
  const b = createBuild("Guardian");
  b.skills = [9158, 9093, 9151, 9163, 30461];
  b.specs[0] = { id: 16, traits: [null, null, 579] };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#build=" + encodeShare(b));
  await expect(power(page)).toHaveText("1,216");
  await expect(page.locator('[data-value="ConditionDamage"]')).toHaveText(
    "216",
  );
  await expect(page.locator('[data-value="BoonDuration"]')).toHaveText("144");
  await page.locator(".attribute-effects summary").click();
  for (const name of ["怨毒纹章", "愤怒纹章", "仁慈纹章"])
    await page.getByLabel(`预览${name}正在冷却`, { exact: true }).check();
  await expect(power(page)).toHaveText("1,216");
  await expect(page.locator('[data-value="ConditionDamage"]')).toHaveText(
    "216",
  );
  await expect(page.locator('[data-value="BoonDuration"]')).toHaveText("144");
  await expect(page.locator('[data-value="BoonBonus"]')).toHaveText("9.60%");
  await expect(page.locator(".attribute-preview-controls")).toContainText(
    "完美铭刻：被动效果提高 20%，冷却期间仍生效",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "清除预览条件", exact: true }).click();
  await expect(
    page.getByLabel("预览怨毒纹章正在冷却", { exact: true }),
  ).not.toBeChecked();
  await expect(power(page)).toHaveText("1,216");
  await expect(page.locator("section.panel")).toHaveCount(2);
});

test("幻术纹章冷却逐项更新，模糊铭文不保留被动且保存分享不带预览", async ({
  page,
  context,
}) => {
  const b = fixture(true);
  b.skills = [21750, 10232, 10234, 10236, 29519];
  b.specs = [23, 45, 1].map((id) => ({
    id,
    traits: [1, 2, 3].map((tier) =>
      id === 23 && tier === 3
        ? 752
        : catalog.traits.find(
            (t: any) =>
              t.specialization === id && t.tier === tier && t.slot === "Major",
          ).id,
    ),
  }));
  await seed(page, b);
  const damage = page.locator('[data-value="ConditionDamage"]');
  const expertise = page.locator('[data-value="ConditionDuration"]');
  const duration = page.locator('[data-value="ConditionBonus"]');
  const originalDamage = Number((await damage.innerText()).replaceAll(",", ""));
  const originalExpertise = Number(
    (await expertise.innerText()).replaceAll(",", ""),
  );
  const originalDuration = parseFloat(await duration.innerText());
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览午夜纹章正在冷却", { exact: true }).check();
  await expect(expertise).toHaveText(
    (originalExpertise - 180).toLocaleString("en-US"),
  );
  await expect(duration).toHaveText((originalDuration - 12).toFixed(2) + "%");
  await expect(damage).toHaveText(originalDamage.toLocaleString("en-US"));
  await page
    .getByRole("button", { name: "查看症状效果来源", exact: true })
    .click();
  await expect(page.locator(".attribute-breakdown")).not.toContainText(
    "午夜纹章 · 被动",
  );
  await page.getByLabel("预览午夜纹章正在冷却", { exact: true }).uncheck();
  await expect(page.locator(".attribute-breakdown")).toContainText(
    "午夜纹章 · 被动",
  );
  await page.getByLabel("预览支配纹章正在冷却", { exact: true }).check();
  await expect(damage).toHaveText(
    (originalDamage - 180).toLocaleString("en-US"),
  );
  await expect(expertise).toHaveText(originalExpertise.toLocaleString("en-US"));
  await page.getByRole("button", { name: "保存", exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("p12.builds.v1")!)[0],
    ),
  ).toEqual(b);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON", exact: true }).click();
  expect(
    JSON.parse(readFileSync((await (await downloading).path())!, "utf8")),
  ).toEqual(b);
  await page.getByRole("button", { name: "分享配装 ↗" }).click();
  const link = await page.locator(".share input").inputValue();
  expect(decodeShare(link.split("#build=")[1])).toEqual(b);
  const viewer = await context.newPage();
  await viewer.goto(link);
  await expect(viewer.locator('[data-value="ConditionDamage"]')).toHaveText(
    originalDamage.toLocaleString("en-US"),
  );
  await viewer.locator(".attribute-effects summary").click();
  await viewer.getByLabel("预览午夜纹章正在冷却", { exact: true }).check();
  await expect(viewer.locator('[data-value="ConditionDuration"]')).toHaveText(
    (originalExpertise - 180).toLocaleString("en-US"),
  );
  await page.reload();
  await expect(damage).toHaveText(originalDamage.toLocaleString("en-US"));
  await page.locator(".attribute-effects summary").click();
  await expect(
    page.getByLabel("预览支配纹章正在冷却", { exact: true }),
  ).not.toBeChecked();
});

test("手机幻术午夜纹章可独立预览，清除条件恢复且无横向溢出", async ({
  page,
}) => {
  const b = createBuild("Mesmer");
  b.skills = [21750, 10232, 10234, 10236, 29519];
  b.specs[0] = { id: 23, traits: [null, null, 752] };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#build=" + encodeShare(b));
  await expect(page.locator('[data-value="ConditionDamage"]')).toHaveText(
    "180",
  );
  await expect(page.locator('[data-value="ConditionBonus"]')).toHaveText(
    "12.00%",
  );
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览午夜纹章正在冷却", { exact: true }).check();
  await expect(page.locator('[data-value="ConditionBonus"]')).toHaveText(
    "0.00%",
  );
  await page.getByLabel("预览支配纹章正在冷却", { exact: true }).check();
  await expect(page.locator('[data-value="ConditionDamage"]')).toHaveText("0");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "清除预览条件", exact: true }).click();
  await expect(page.locator('[data-value="ConditionBonus"]')).toHaveText(
    "12.00%",
  );
  await expect(page.locator('[data-value="ConditionDamage"]')).toHaveText(
    "180",
  );
  await expect(page.locator("section.panel")).toHaveCount(2);
});

test("火焰纹章随石刻纹章点选即时保留或失效，保存分享不携带冷却", async ({
  page,
  context,
}) => {
  const b = fixture();
  b.profession = "Elementalist";
  b.equipment.weapon2 = createBuild().equipment.weapon2;
  b.equipment.offhand2 = createBuild().equipment.offhand2;
  b.skills = [
    5503,
    5542,
    5571,
    5570,
    catalog.skills.find(
      (s: any) =>
        s.professions?.includes("Elementalist") &&
        s.type === "Elite" &&
        !s.specialization,
    ).id,
  ];
  b.specs = [26, 31, 41].map((id) => ({
    id,
    traits: [1, 2, 3].map(
      (tier) =>
        catalog.traits.find(
          (t: any) =>
            t.specialization === id &&
            t.tier === tier &&
            t.slot === "Major" &&
            t.id !== 287,
        ).id,
    ),
  }));
  const alternative = catalog.traits.find(
    (t: any) => t.id === b.specs[0].traits[2],
  );
  await seed(page, b);
  const precision = page.locator('[data-value="Precision"]');
  const original = Number((await precision.innerText()).replaceAll(",", ""));
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览火焰纹章正在冷却", { exact: true }).check();
  await expect(precision).toHaveText((original - 180).toLocaleString("en-US"));
  await page.getByRole("button", { name: "石刻纹章", exact: true }).click();
  await expect(precision).toHaveText(original.toLocaleString("en-US"));
  await expect(page.locator(".attribute-preview-controls")).toContainText(
    "石刻纹章：冷却期间仍生效",
  );
  await expect(page.locator(".attribute-preview-controls")).not.toContainText(
    "提高 0%",
  );
  await page.getByRole("button", { name: "查看精准来源", exact: true }).click();
  await expect(page.locator(".attribute-breakdown")).toContainText(
    "火焰纹章 · 被动（石刻纹章）",
  );
  await page
    .getByRole("button", { name: alternative.name, exact: true })
    .click();
  await expect(precision).toHaveText((original - 180).toLocaleString("en-US"));
  await page.getByRole("button", { name: "石刻纹章", exact: true }).click();
  b.specs[0].traits[2] = 287;
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("p12.builds.v1")!)[0],
    ),
  ).toEqual(b);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON", exact: true }).click();
  expect(
    JSON.parse(readFileSync((await (await downloading).path())!, "utf8")),
  ).toEqual(b);
  await page.getByRole("button", { name: "分享配装 ↗" }).click();
  const link = await page.locator(".share input").inputValue();
  expect(decodeShare(link.split("#build=")[1])).toEqual(b);
  const viewer = await context.newPage();
  await viewer.goto(link);
  await viewer.locator(".attribute-effects summary").click();
  await expect(
    viewer.getByLabel("预览火焰纹章正在冷却", { exact: true }),
  ).not.toBeChecked();
  await viewer.getByLabel("预览火焰纹章正在冷却", { exact: true }).check();
  await expect(viewer.locator('[data-value="Precision"]')).toHaveText(
    original.toLocaleString("en-US"),
  );
  await page.reload();
  await page.locator(".attribute-effects summary").click();
  await expect(
    page.getByLabel("预览火焰纹章正在冷却", { exact: true }),
  ).not.toBeChecked();
});

test("手机火焰纹章保留180精准，石刻纹章不添加旧版坚韧或虚假倍率", async ({
  page,
}) => {
  const b = createBuild("Elementalist");
  b.skills = [5503, 5542, 5571, 5570, null];
  b.specs[0] = { id: 26, traits: [null, null, 287] };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#build=" + encodeShare(b));
  await expect(page.locator('[data-value="Precision"]')).toHaveText("1,180");
  await expect(page.locator('[data-value="CriticalChance"]')).toHaveText(
    "13.57%",
  );
  await expect(page.locator('[data-value="Toughness"]')).toHaveText("1,000");
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览火焰纹章正在冷却", { exact: true }).check();
  await expect(page.locator('[data-value="Precision"]')).toHaveText("1,180");
  await expect(page.locator(".attribute-preview-controls")).toContainText(
    "石刻纹章：冷却期间仍生效",
  );
  await expect(page.locator(".attribute-preview-controls")).not.toContainText(
    "提高 0%",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "清除预览条件", exact: true }).click();
  await expect(
    page.getByLabel("预览火焰纹章正在冷却", { exact: true }),
  ).not.toBeChecked();
  await expect(page.locator("section.panel")).toHaveCount(2);
});

test("战士纹章被动与专精叠层独立，转换实时更新且保存导出分享隔离", async ({
  page,
  context,
}) => {
  const b = fixture();
  b.profession = "Warrior";
  b.skills = [14389, 14404, 14410, 14479, 14355];
  b.utility = 78305;
  b.specs = [36, 4, 22].map((id) => ({
    id,
    traits: [1, 2, 3].map((tier) =>
      id === 36 && tier === 1
        ? 1344
        : catalog.traits.find(
            (t: any) =>
              t.specialization === id && t.tier === tier && t.slot === "Major",
          ).id,
    ),
  }));
  await seed(page, b);
  const ferocity = page.locator('[data-value="CritDamage"]');
  const precision = page.locator('[data-value="Precision"]');
  const originalPower = Number(
    (await power(page).innerText()).replaceAll(",", ""),
  );
  const originalPrecision = Number(
    (await precision.innerText()).replaceAll(",", ""),
  );
  const originalFerocity = Number(
    (await ferocity.innerText()).replaceAll(",", ""),
  );
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览纹章专精层数", { exact: true }).fill("5");
  await expect(ferocity).toHaveText(
    (originalFerocity + 500).toLocaleString("en-US"),
  );
  await expect(power(page)).toHaveText(
    (originalPower + 30).toLocaleString("en-US"),
  );
  await page.getByLabel("预览威能纹章正在冷却", { exact: true }).check();
  await page.getByLabel("预览怒气纹章正在冷却", { exact: true }).check();
  await expect(power(page)).toHaveText(
    (originalPower + 30 - 180).toLocaleString("en-US"),
  );
  await expect(precision).toHaveText(
    (originalPrecision - 180).toLocaleString("en-US"),
  );
  await expect(ferocity).toHaveText(
    (originalFerocity + 500).toLocaleString("en-US"),
  );
  await page
    .getByRole("button", { name: "查看暴击效果来源", exact: true })
    .click();
  await expect(page.locator(".attribute-breakdown")).toContainText(
    "纹章专精 · 5 层",
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("p12.builds.v1")!)[0],
    ),
  ).toEqual(b);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON", exact: true }).click();
  expect(
    JSON.parse(readFileSync((await (await downloading).path())!, "utf8")),
  ).toEqual(b);
  await page.getByRole("button", { name: "分享配装 ↗" }).click();
  const link = await page.locator(".share input").inputValue();
  expect(decodeShare(link.split("#build=")[1])).toEqual(b);
  const viewer = await context.newPage();
  await viewer.goto(link);
  await expect(viewer.locator('[data-value="CritDamage"]')).toHaveText(
    originalFerocity.toLocaleString("en-US"),
  );
  await viewer.locator(".attribute-effects summary").click();
  await expect(
    viewer.getByLabel("预览纹章专精层数", { exact: true }),
  ).toHaveValue("0");
  await viewer.getByLabel("预览纹章专精层数", { exact: true }).fill("5");
  await expect(viewer.locator('[data-value="CritDamage"]')).toHaveText(
    (originalFerocity + 500).toLocaleString("en-US"),
  );
  await page.reload();
  await page.locator(".attribute-effects summary").click();
  await expect(
    page.getByLabel("预览纹章专精层数", { exact: true }),
  ).toHaveValue("0");
  await expect(
    page.getByLabel("预览怒气纹章正在冷却", { exact: true }),
  ).not.toBeChecked();
});

test("手机纹章专精无需装备纹章即可预览，层数封顶并随特性移除失效", async ({
  page,
}) => {
  const b = createBuild("Warrior");
  b.specs[0] = { id: 36, traits: [1344, null, null] };
  const alternative = catalog.traits.find(
    (t: any) =>
      t.specialization === 36 &&
      t.tier === 1 &&
      t.slot === "Major" &&
      t.id !== 1344,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, b);
  await page.locator(".attribute-effects summary").click();
  await page.getByLabel("预览纹章专精层数", { exact: true }).fill("99");
  await expect(
    page.getByLabel("预览纹章专精层数", { exact: true }),
  ).toHaveValue("5");
  await expect(page.locator('[data-value="CritDamage"]')).toHaveText("500");
  await expect(page.locator('[data-value="CriticalDamage"]')).toHaveText(
    "183.33%",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: alternative.name, exact: true })
    .click();
  await expect(
    page.getByLabel("预览纹章专精层数", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('[data-value="CritDamage"]')).toHaveText("0");
  await page.getByRole("button", { name: "纹章专精", exact: true }).click();
  await expect(page.locator('[data-value="CritDamage"]')).toHaveText("500");
  await page.getByRole("button", { name: "清除预览条件", exact: true }).click();
  await expect(
    page.getByLabel("预览纹章专精层数", { exact: true }),
  ).toHaveValue("0");
  await expect(page.locator('[data-value="CritDamage"]')).toHaveText("0");
  await expect(page.locator("section.panel")).toHaveCount(2);
});
