import { loadBuild, downloadBuild, reloadBuild } from "./build-fixtures";
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
function completeSignetBuild(
  profession: Build["profession"],
  utilities: number[],
  traitId: number,
) {
  const b = createBuild(profession);
  b.name = `${profession}纹章验收`;
  for (const key of [...armorSlots, ...accessorySlots])
    b.equipment[key].statId = 161;
  Object.assign(b.equipment.weapon1, {
    weapon: "Staff",
    statId: 161,
    infusions: [null, null],
  });
  b.equipment.offhand1.infusions = [];
  const trait = catalog.traits.find((t: any) => t.id === traitId);
  const specs = [
    trait.specialization,
    ...catalog.specs
      .filter(
        (s: any) =>
          s.profession === profession &&
          !s.elite &&
          s.id !== trait.specialization,
      )
      .slice(0, 2)
      .map((s: any) => s.id),
  ];
  b.specs = specs.map((id) => ({
    id,
    traits: [1, 2, 3].map((tier) =>
      id === trait.specialization && tier === trait.tier
        ? traitId
        : catalog.traits.find(
            (t: any) =>
              t.specialization === id && t.tier === tier && t.slot === "Major",
          ).id,
    ),
  }));
  const skill = (type: string) =>
    catalog.skills.find(
      (s: any) =>
        s.professions?.includes(profession) &&
        s.type === type &&
        !s.specialization,
    ).id;
  b.skills = [skill("Heal"), ...utilities, skill("Elite")];
  return b;
}
async function seed(page: Page, b: Build) {
  await loadBuild(page, b);
  await expect(page.locator('[data-value="Power"]')).toBeVisible();
}
const row = (page: Page, key: string) => page.locator(`[data-value="${key}"]`);
const number = async (page: Page, key: string) =>
  Number((await row(page, key).innerText()).replaceAll(",", ""));

for (const entry of [
  {
    profession: "Ranger",
    trait: 1021,
    utilities: [12500, 12491, 12542],
    effects: [
      { key: "Toughness", name: "磐石纹章" },
      { key: "CritDamage", name: "野性纹章" },
    ],
  },
  {
    profession: "Thief",
    trait: 1267,
    utilities: [13046, 13062, 13060],
    effects: [
      { key: "Power", name: "刺客纹章" },
      { key: "Precision", name: "敏捷纹章" },
    ],
  },
  {
    profession: "Necromancer",
    trait: 909,
    utilities: [10622, 10612, 10611],
    effects: [{ key: "Power", name: "怨恨纹章" }],
  },
] as const) {
  test(`${entry.profession}纹章独立冷却、来源及版本1保存导出分享隔离`, async ({
    page,
    context,
  }) => {
    const b = completeSignetBuild(
      entry.profession,
      [...entry.utilities],
      entry.trait,
    );
    await seed(page, b);
    const original = new Map(
      await Promise.all(
        entry.effects.map(
          async (e) => [e.key, await number(page, e.key)] as const,
        ),
      ),
    );
    await page.locator(".attribute-effects summary").click();
    for (const effect of entry.effects) {
      await page
        .getByLabel(`预览${effect.name}正在冷却`, { exact: true })
        .check();
      await expect(row(page, effect.key)).toHaveText(
        (original.get(effect.key)! - 180).toLocaleString("en-US"),
      );
      await page
        .getByRole("button", {
          name: `查看${effect.key === "Power" ? "威力" : effect.key === "Precision" ? "精准" : effect.key === "Toughness" ? "坚韧" : "暴击效果"}来源`,
          exact: true,
        })
        .click();
      await expect(page.locator(".attribute-breakdown")).not.toContainText(
        `${effect.name} · 被动`,
      );
      await page
        .getByLabel(`预览${effect.name}正在冷却`, { exact: true })
        .uncheck();
      await expect(row(page, effect.key)).toHaveText(
        original.get(effect.key)!.toLocaleString("en-US"),
      );
      await expect(page.locator(".attribute-breakdown")).toContainText(
        `${effect.name} · 被动`,
      );
    }
    for (const e of entry.effects)
      await page.getByLabel(`预览${e.name}正在冷却`, { exact: true }).check();

    expect(await downloadBuild(page)).toEqual(b);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载 BD", exact: true }).click();
    expect(
      JSON.parse(readFileSync((await (await downloading).path())!, "utf8")),
    ).toEqual(b);
    await page.getByRole("button", { name: "分享配装 ↗" }).click();
    const link = await page.locator(".share input").inputValue();
    expect(decodeShare(link.split("#build=")[1])).toEqual(b);
    const viewer = await context.newPage();
    await viewer.goto(link);
    await viewer.locator(".attribute-effects summary").click();
    for (const e of entry.effects) {
      await expect(row(viewer, e.key)).toHaveText(
        original.get(e.key)!.toLocaleString("en-US"),
      );
      await viewer.getByLabel(`预览${e.name}正在冷却`, { exact: true }).check();
      await expect(row(viewer, e.key)).toHaveText(
        (original.get(e.key)! - 180).toLocaleString("en-US"),
      );
    }
    await reloadBuild(page);
    await page.locator(".attribute-effects summary").click();
    for (const e of entry.effects)
      await expect(
        page.getByLabel(`预览${e.name}正在冷却`, { exact: true }),
      ).not.toBeChecked();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("唤灵师帷幕使怨恨纹章失效，灾厄不提供帷幕开关", async ({ page }) => {
  for (const elite of [null, 34, 64, 76, 60]) {
    const b = createBuild("Necromancer");
    b.skills[1] = 10622;
    b.specs[2].id = elite;
    await page.goto("/#build=" + encodeShare(b));
    await reloadBuild(page);
    await expect(row(page, "Power")).toHaveText("1,180");
    await page.locator(".attribute-effects summary").click();
    const shroud = page.getByLabel("预览处于帷幕状态", { exact: true });
    if (elite === 60) await expect(shroud).toHaveCount(0);
    else {
      await shroud.check();
      await expect(row(page, "Power")).toHaveText("1,000");
      await page
        .getByRole("button", { name: "清除预览条件", exact: true })
        .click();
      await expect(row(page, "Power")).toHaveText("1,180");
    }
  }
});

test("玉偃师超导纹章及翠玉驱动器不误加属性，窄屏保持两个面板", async ({
  page,
}) => {
  const b = createBuild("Engineer");
  b.specs[2] = { id: 70, traits: [null, null, 2298] };
  b.food = 97592;
  b.skills = [63049, 63113, 63253, 63111, 63095];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#build=" + encodeShare(b));
  await expect(row(page, "ConditionDamage")).toHaveText("100");
  await expect(row(page, "Power")).toHaveText("1,000");
  await expect(row(page, "Healing")).toHaveText("0");
  await expect(
    page.locator(".attribute-warnings li").filter({
      hasText: "超导纹章的被动属性尚未计入",
    }),
  ).toHaveCount(0);
  await page.locator(".attribute-effects summary").click();
  await expect(page.getByLabel(/预览.*纹章正在冷却/)).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator("section.panel")).toHaveCount(2);
});
