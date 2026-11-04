import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createBuild, encodeShare, type Catalog } from "../src/domain";
import { loadBuild, downloadBuild } from "./build-fixtures";

const catalog: Catalog = JSON.parse(
  readFileSync("public/catalog.json", "utf8"),
);
function build(id: number) {
  const t = catalog.traits.find((t) => t.id === id)!,
    s = catalog.specs.find((s) => s.id === t.specialization)!;
  const b = createBuild(s.profession);
  b.name = `属性联动验收${id}`;
  const line = s.elite ? 2 : 0;
  b.specs[line].id = s.id;
  if (t.slot === "Major") b.specs[line].traits[t.tier - 1] = id;
  return b;
}
test("急速属性只在当前预览生效，下载与手机只读分享不携带条件", async ({
  page,
  context,
}) => {
  const b = build(2148);
  await loadBuild(page, b);
  await expect(page.locator('[data-value="Vitality"]')).toHaveText("1,000");
  await page.locator(".attribute-effects > summary").click();
  await page
    .getByRole("checkbox", { name: "预览拥有急速", exact: true })
    .check();
  await expect(page.locator('[data-value="Vitality"]')).toHaveText("1,250");
  await expect(page.locator('[data-value="Healing"]')).toHaveText("250");
  const saved = await downloadBuild(page);
  expect(saved).toEqual(b);
  const readonly = await context.newPage();
  await readonly.setViewportSize({ width: 390, height: 844 });
  await readonly.goto("/#build=" + encodeShare(saved));
  await expect(readonly.locator('[data-value="Vitality"]')).toHaveText("1,000");
  await readonly.locator(".attribute-effects > summary").click();
  await readonly
    .getByRole("checkbox", { name: "预览拥有急速", exact: true })
    .check();
  await expect(readonly.locator('[data-value="Vitality"]')).toHaveText("1,250");
  await readonly.reload();
  await expect(readonly.locator('[data-value="Vitality"]')).toHaveText("1,000");
  await readonly.close();
});
test("狂暴沿用职业机制开关，切换状态同步特性转换且不写入下载", async ({
  page,
}) => {
  const b = build(2011);
  b.equipment.weapon1.weapon = "Axe";
  await loadBuild(page, b);
  await expect(page.locator('[data-value="Power"]')).toHaveText("1,000");
  await expect(page.locator('[data-value="CritDamage"]')).toHaveText("120");
  await page
    .getByRole("checkbox", { name: "狂暴状态预览", exact: true })
    .check();
  await expect(page.locator('[data-value="Power"]')).toHaveText("1,300");
  await expect(page.locator('[data-value="CritDamage"]')).toHaveText("240");
  expect(await downloadBuild(page)).toEqual(b);
  await page
    .getByRole("checkbox", { name: "狂暴状态预览", exact: true })
    .uncheck();
  await expect(page.locator('[data-value="Power"]')).toHaveText("1,000");
});
test("诅咒萦绕点选取消切换第三武器技能，Wiki基础时长与属性共同进入详情", async ({
  page,
}) => {
  const b = build(801);
  b.equipment.weapon1.weapon = "Scepter";
  await loadBuild(page, b);
  const icon = page
    .locator('.weapon-skill-list [data-game-detail="skill-51647"]')
    .first();
  await expect(icon).toBeVisible();
  await icon.focus();
  await icon.press("F1");
  await expect(page.locator(".game-tooltip")).toContainText(
    "每种症状折磨：6 秒",
  );
  await page.keyboard.press("Escape");
  const name = catalog.traits.find((t) => t.id === 801)!.name;
  await page.getByRole("button", { name, exact: true }).click();
  await expect(
    page.locator('.weapon-skill-list [data-game-detail="skill-10709"]'),
  ).toBeVisible();
  await page.getByRole("button", { name, exact: true }).click();
  await expect(icon).toBeVisible();
});

test("续补：暴击伤害倍率来源、目标条件与390px只读分享隔离", async ({
  page,
  context,
}) => {
  const b = build(692),
    danger = catalog.traits.find((t) => t.id === 2009)!;
  b.name = "暴击倍率续补验收";
  b.specs[2] = { id: danger.specialization, traits: [null, null, null] };
  b.specs[2].traits[danger.tier - 1] = 2009;
  await loadBuild(page, b);
  await expect(page.locator('[data-value="CriticalDamage"]')).toHaveText(
    "172.50%",
  );
  await page.locator(".attribute-effects > summary").click();
  await page
    .getByRole("checkbox", { name: "预览目标被控制", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "预览危机时刻效果生效中", exact: true })
    .check();
  await expect(page.locator('[data-value="CriticalDamage"]')).toHaveText(
    "196.88%",
  );
  await expect(page.locator('[data-value="CritDamage"]')).toHaveText("0");
  await page
    .getByRole("checkbox", { name: "预览目标生命低于 50%", exact: true })
    .check();
  await expect(page.locator('[data-value="CriticalDamage"]')).toHaveText(
    "196.88%",
  );
  await page
    .getByRole("button", { name: "查看暴击伤害来源", exact: true })
    .click();
  await expect(page.locator(".attribute-breakdown")).toContainText("优越自尊");
  const saved = await downloadBuild(page);
  expect(saved).toEqual(b);
  const readonly = await context.newPage();
  await readonly.setViewportSize({ width: 390, height: 844 });
  await readonly.goto("/#build=" + encodeShare(saved));
  await expect(readonly.locator('[data-value="CriticalDamage"]')).toHaveText(
    "172.50%",
  );
  await readonly.locator(".attribute-effects > summary").click();
  await readonly
    .getByRole("checkbox", { name: "预览危机时刻效果生效中", exact: true })
    .check();
  await expect(readonly.locator('[data-value="CriticalDamage"]')).toHaveText(
    "181.13%",
  );
  await readonly.reload();
  await expect(readonly.locator('[data-value="CriticalDamage"]')).toHaveText(
    "172.50%",
  );
  await readonly.close();
});

test("续补：意志之力体力与盟友治疗来源，取消特性立即恢复", async ({ page }) => {
  const b = build(1682);
  b.name = "意志之力续补验收";
  b.food = 91690;
  b.utility = 99842;
  await loadBuild(page, b);
  await expect(page.locator('[data-value="Vitality"]')).toHaveText("1,300");
  await expect(page.locator('[data-value="OutgoingHealing"]')).toHaveText(
    "24.16%",
  );
  await page
    .getByRole("button", { name: "查看对盟友治疗加成来源", exact: true })
    .click();
  await expect(page.locator(".attribute-breakdown")).toContainText("意志之力");
  await page
    .getByRole("button", {
      name: catalog.traits.find((t) => t.id === 1682)!.name,
      exact: true,
    })
    .click();
  await expect(page.locator('[data-value="Vitality"]')).toHaveText("1,000");
  await expect(page.locator('[data-value="OutgoingHealing"]')).toHaveText(
    "11.16%",
  );
});

test("续补：节奏爆发乐器数量联动九属性，威能与纹章不被放大且下载不携带预览", async ({
  page,
}) => {
  const b = build(2353);
  b.name = "节奏爆发续补验收";
  b.skills[1] = 10232;
  b.utility = 48916;
  await loadBuild(page, b);
  await page.locator(".attribute-effects > summary").click();
  await page
    .getByRole("spinbutton", { name: "预览演奏中乐器数量", exact: true })
    .fill("4");
  await expect(page.locator('[data-value="Power"]')).toHaveText("1,160");
  await expect(page.locator('[data-value="Precision"]')).toHaveText("1,160");
  await expect(page.locator('[data-value="ConditionDamage"]')).toHaveText(
    "180",
  );
  await expect(page.locator('[data-value="BoonDuration"]')).toHaveText("30");
  await page
    .getByRole("spinbutton", { name: "预览威能层数", exact: true })
    .fill("25");
  await expect(page.locator('[data-value="Power"]')).toHaveText("1,910");
  await expect(page.locator('[data-value="ConditionDamage"]')).toHaveText(
    "930",
  );
  expect(await downloadBuild(page)).toEqual(b);
});

test("敏锐观察面板：常驻10%与高生命隐藏5%分开，血线不误改暴击率", async ({
  page,
  context,
}) => {
  const b = build(1268);
  b.name = "敏锐观察游戏面板验收";
  b.description = "[敏锐观察](gw2:trait/1281)";
  await loadBuild(page, b);
  await expect(page.locator('[data-value="CriticalChance"]')).toHaveText(
    "15.00%",
  );
  await expect(page.locator('[data-value="CriticalDamage"]')).toHaveText(
    "160.50%",
  );
  await page.locator(".attribute-effects > summary").click();
  await page
    .getByRole("checkbox", { name: "预览生命低于 50%", exact: true })
    .check();
  await expect(page.locator('[data-value="CriticalChance"]')).toHaveText(
    "15.00%",
  );
  await expect(page.locator('[data-value="CriticalDamage"]')).toHaveText(
    "157.50%",
  );
  await page
    .getByRole("button", { name: "查看暴击率来源", exact: true })
    .click();
  await expect(page.locator(".attribute-breakdown")).toContainText("敏锐观察");
  await expect(page.locator(".attribute-breakdown")).toContainText("+10.00%");
  await page.getByRole("tab", { name: "预览", exact: true }).click();
  const link = page.locator('.build-reference[data-game-detail="trait-1281"]');
  await link.focus();
  await link.press("F1");
  await expect(page.locator(".game-tooltip")).toContainText(
    "高生命值时暴击率增加：5%",
  );
  await expect(page.locator(".game-tooltip")).toContainText("暴击率提升：10%");
  await page.keyboard.press("Escape");
  const saved = await downloadBuild(page);
  expect(saved).toEqual(b);
  const readonly = await context.newPage();
  await readonly.goto("/#build=" + encodeShare(saved));
  await expect(readonly.locator('[data-value="CriticalChance"]')).toHaveText(
    "15.00%",
  );
  await readonly.reload();
  await expect(readonly.locator('[data-value="CriticalChance"]')).toHaveText(
    "15.00%",
  );
  await readonly.close();
});
