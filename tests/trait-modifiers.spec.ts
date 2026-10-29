import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  createBuild,
  encodeShare,
  type Catalog,
  type Build,
} from "../src/domain";
import { loadBuild, downloadBuild } from "./build-fixtures";
const catalog: Catalog = JSON.parse(
  readFileSync("public/catalog.json", "utf8"),
);
const cases = [
  {
    profession: "Engineer",
    trait: 1679,
    skill: 21659,
    slot: 0,
    base: "自动除颤：5 秒",
    changed: "自动除颤：8 秒",
  },
  {
    profession: "Ranger",
    trait: 1075,
    skill: 12489,
    slot: 0,
    base: "再生：3 秒",
    changed: "再生：5 秒",
  },
  {
    profession: "Thief",
    trait: 1949,
    skill: 30568,
    slot: 1,
    base: "冷却时间：1 秒",
    changed: "耐力获取：15",
  },
  {
    profession: "Elementalist",
    trait: 340,
    skill: 30662,
    slot: 1,
    elite: 48,
    base: "火焰光环：4 秒",
    changed: "火焰光环：5.32 秒",
  },
  {
    profession: "Necromancer",
    trait: 2220,
    skill: 62655,
    slot: 4,
    base: "冷却时间：60 秒",
    changed: "盟友增益目标：4",
  },
  {
    profession: "Revenant",
    trait: 2259,
    skill: 62757,
    base: "冷却时间：20 秒",
    changed: "冷却时间：10 秒",
  },
] as const;
for (const item of cases)
  test(`${item.profession} 特性点选取消及只读分享刷新使用同一数值投影`, async ({
    page,
    context,
  }) => {
    const b = createBuild(item.profession as Build["profession"]);
    const trait = catalog.traits.find((t) => t.id === item.trait)!;
    const spec = catalog.specs.find((s) => s.id === trait.specialization)!;
    b.specs[spec.elite ? 2 : 0].id = spec.id;
    if ("elite" in item) b.specs[2].id = item.elite;
    if ("slot" in item) b.skills[item.slot] = item.skill;
    const upstream: string[] = [];
    page.on("request", (r) => {
      if (
        /wiki\.(guildwars2\.com|wishingstar\.top)|api\.guildwars2\.com/.test(
          r.url(),
        )
      )
        upstream.push(r.url());
    });
    await loadBuild(page, b);
    const icon = page
      .locator(`[data-game-detail="skill-${item.skill}"]`)
      .first();
    const card = page.locator(".game-tooltip");
    const open = async () => {
      await icon.focus();
      await icon.press("F1");
      await expect(card).toBeVisible();
    };
    await open();
    await expect(card).toContainText(item.base);
    const baseModified = await card.locator(".fact-modified").count();
    await page.keyboard.press("Escape");
    const pick = page.getByRole("button", { name: trait.name, exact: true });
    await pick.click();
    await open();
    await expect(card).toContainText(item.changed);
    await expect(card.locator(".fact-modified").first()).toBeVisible();
    await expect(card).not.toContainText(/效果记录待核对|总伤害系数未推算/);
    await page.keyboard.press("Escape");
    await pick.click();
    await open();
    await expect(card).toContainText(item.base);
    await expect(card.locator(".fact-modified")).toHaveCount(baseModified);
    await page.keyboard.press("Escape");
    await pick.click();
    const saved = await downloadBuild(page);
    expect(saved.specs[spec.elite ? 2 : 0].traits[trait.tier - 1]).toBe(
      trait.id,
    );
    expect(Object.keys(saved)).not.toContain("traitDurationBonuses");
    const shared = await context.newPage();
    await shared.setViewportSize({ width: 390, height: 844 });
    const hash = "#build=" + encodeShare(saved);
    await shared.goto("/" + hash);
    await expect(shared.locator(".trait-lines")).toBeVisible();
    const sharedIcon = shared
      .locator(`[data-game-detail="skill-${item.skill}"]`)
      .first();
    for (let i = 0; i < 2; i++) {
      await sharedIcon.focus();
      await sharedIcon.press("F1");
      await expect(shared.locator(".game-tooltip")).toContainText(item.changed);
      expect(
        await shared.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(new URL(shared.url()).hash).toBe(hash);
      await shared.keyboard.press("Escape");
      if (i === 0) {
        await shared.reload();
        await expect(shared.locator(".trait-lines")).toBeVisible();
      }
    }
    expect(upstream).toEqual([]);
    await shared.close();
  });
