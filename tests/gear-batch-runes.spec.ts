import { loadBuild, downloadBuild, reloadBuild } from "./build-fixtures";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  armorSlots,
  accessorySlots,
  createBuild,
  decodeShare,
  labels,
  type Catalog,
} from "../src/domain";
import { itemOptions } from "../src/editor";

const catalog: Catalog = JSON.parse(
  readFileSync("public/catalog.json", "utf8"),
);
const runes = itemOptions(catalog, "Rune");
const first = runes.find((rune) => rune.id === 24687)!;
const second = runes.find((rune) => rune.id !== first.id)!;

for (const width of [1440, 390]) {
  test(`${width}px整套符文覆盖六槽，支持检索、取消、清空和撤销，逐件修改及保存分享兼容`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const original = createBuild("Mesmer");
    original.name = "整套符文验收";
    original.description = "保留我的配装说明";
    for (const key of [...armorSlots, ...accessorySlots])
      original.equipment[key].statId = 161;
    armorSlots.forEach(
      (key, index) =>
        (original.equipment[key].runeId = [first.id, second.id, null][
          index % 3
        ]),
    );
    original.equipment.head.infusions[0] = itemOptions(
      catalog,
      "Infusion",
    )[0].id;
    Object.assign(original.equipment.weapon1, {
      weapon: "Staff",
      statId: 161,
      infusions: [null, null],
      sigils: [itemOptions(catalog, "Sigil")[0].id, null],
    });
    original.equipment.offhand1.infusions = [];
    await loadBuild(page, original);
    await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
      original.name,
    );
    const batch = page.getByRole("button", { name: "整套符文 ⌄", exact: true });
    const runeField = (key: (typeof armorSlots)[number]) =>
      page
        .locator(`.armor-row[data-slot="${key}"]`)
        .getByRole("button", { name: new RegExp(`^${labels[key]}符文：`) });
    async function assertRunes(ids: (number | null)[]) {
      const toggle = page.getByRole("button", {
        name: "逐件符文",
        exact: true,
      });
      if (await toggle.count()) await toggle.click();
      for (const [index, key] of armorSlots.entries())
        await expect(runeField(key)).toContainText(
          runes.find((rune) => rune.id === ids[index])?.name || "未选择",
        );
    }
    const initial = armorSlots.map((key) => original.equipment[key].runeId);
    await batch.click();
    const picker = page.getByRole("dialog", {
      name: "整套护甲符文",
      exact: true,
    });
    await expect(picker).toBeVisible();
    await page.getByRole("searchbox").fill(String(second.id));
    await expect(picker.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(batch).toBeFocused();
    await assertRunes(initial);
    const apply = async () => {
      await batch.click();
      await page.getByRole("searchbox").fill(String(second.id));
      await page.getByRole("searchbox").press("Enter");
      await assertRunes(armorSlots.map(() => second.id));
    };
    await apply();
    await expect(page.getByRole("status")).toContainText("6 件护甲");
    await page.getByRole("button", { name: /撤销整套符文设置/ }).click();
    await assertRunes(initial);
    await apply();
    await batch.click();
    await page.getByRole("searchbox").fill(String(second.id));
    await expect(picker.getByRole("option")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await picker
      .getByRole("button", { name: "清空六件护甲符文", exact: true })
      .click();
    await assertRunes(armorSlots.map(() => null));
    await page.getByRole("button", { name: /撤销整套符文设置/ }).click();
    await assertRunes(armorSlots.map(() => second.id));
    await runeField("head").click();
    await page.getByRole("searchbox").fill(String(first.id));
    await page.getByRole("searchbox").press("Enter");
    const expected = structuredClone(original.equipment);
    for (const key of armorSlots) expected[key].runeId = second.id;
    expected.head.runeId = first.id;
    await downloadBuild(page);
    await reloadBuild(page);
    await assertRunes(armorSlots.map((key) => expected[key].runeId));
    const saved = await downloadBuild(page);
    expect(saved.equipment).toEqual(expected);
    expect(saved.description).toBe(original.description);
    expect(saved.version).toBe(1);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载 BD", exact: true }).click();
    const exported = JSON.parse(
      readFileSync((await (await downloading).path())!, "utf8"),
    );
    expect(exported.equipment).toEqual(expected);
    await page.getByRole("button", { name: "分享配装 ↗", exact: true }).click();
    const link = await page.locator(".share input").inputValue();
    expect(decodeShare(link.split("#build=")[1]).equipment).toEqual(expected);
    const viewer = await context.newPage();
    await viewer.goto(link);
    await expect(viewer.getByRole("button", { name: /整套符文/ })).toHaveCount(
      0,
    );
    await viewer.getByRole("button", { name: "逐件符文", exact: true }).click();
    await expect(viewer.locator('.armor-row[data-slot="head"]')).toContainText(
      first.name,
    );
    await viewer.close();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".gear-panel > .panel-heading")
      .screenshot({ path: `test-results/batch-runes-${width}.png` });
    expect(errors).toEqual([]);
  });
}
