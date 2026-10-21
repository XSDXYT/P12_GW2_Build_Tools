import { test, expect } from "@playwright/test";
import { createBuild } from "../src/domain";
const dialogName = { name: "公开BD库", exact: true };
function fixture(count = 1) {
  const build = {
    ...createBuild(),
    name: `滚动构筑 ${String(count - 1).padStart(3, "0")}`,
  };
  const builds = Array.from({ length: count }, (_, i) => ({
    id: i === count - 1 ? build.id : `scroll-${i}`,
    name: `滚动构筑 ${String(i).padStart(3, "0")}`,
    profession: "Mesmer",
    tags: ["治疗"],
    encounters: [
      { instance: "测试副本", boss: "首领甲", mode: "normal" },
      { instance: "测试副本", boss: "首领乙", mode: "challenge" },
    ],
    file: `bd-${i.toString(16).padStart(64, "0")}.json`,
  }));
  Object.assign(build, {
    tags: builds[count - 1].tags,
    encounters: builds[count - 1].encounters,
  });
  return { build, manifest: { schema: 1, builds } };
}

test("手机公开库独立滚动，关闭按钮、返回及Esc均恢复底层样式与操作", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { manifest } = fixture(20);
  const touch =
    browserName === "chromium"
      ? await page.context().newCDPSession(page)
      : null;
  await touch?.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await page.route("**/bd/index.json", (r) => r.fulfill({ json: manifest }));
  await page.goto("/");
  await expect(page.locator("[data-value=Power]")).toBeVisible();
  await page.getByLabel("配装名称", { exact: true }).fill("保留的手机草稿");
  await page.evaluate(() => {
    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "auto";
    document.documentElement.style.scrollbarGutter = "auto";
  });
  for (const close of ["button", "footer", "escape"]) {
    await page.getByRole("button", { name: "公开 BD 库", exact: true }).click();
    const dialog = page.getByRole("dialog", dialogName);
    await expect(dialog.locator(".archive-card")).toHaveCount(40);
    expect(
      await dialog.evaluate(
        (el) => getComputedStyle(el, "::backdrop").backdropFilter,
      ),
    ).toBe("none");
    const before = await page.evaluate(() => scrollY);
    if (touch && close === "button") {
      const scroller = dialog.locator(".archive-main");
      await scroller.evaluate((el) => {
        el.scrollTop = 800;
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 185, y: 650 }],
      });
      for (let y = 620; y >= 260; y -= 40) {
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: 185, y }],
        });
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(resolve)),
        );
      }
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect
        .poll(() => scroller.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(800);
      expect(await page.evaluate(() => scrollY)).toBe(before);
    }
    await dialog.locator(".archive-main").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await dialog.locator(".archive-main").hover();
    await page.mouse.wheel(0, 1600);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
    expect(
      await page.evaluate(() => ({
        body: document.body.style.overflow,
        root: document.documentElement.style.overflow,
      })),
    ).toEqual({ body: "hidden", root: "hidden" });
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    if (close === "button") {
      await dialog.screenshot({
        path: "test-results/archive-scroll-mobile.png",
      });
      await page
        .getByRole("button", { name: "关闭公开BD库", exact: true })
        .click();
    } else if (close === "footer")
      await dialog.getByRole("button", { name: /返回工作台/ }).click();
    else await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(
      await page.evaluate(() => ({
        body: document.body.style.overflow,
        root: document.documentElement.style.overflow,
        gutter: document.documentElement.style.scrollbarGutter,
      })),
    ).toEqual({ body: "auto", root: "auto", gutter: "auto" });
    await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
      "保留的手机草稿",
    );
  }
  await page.getByLabel("配装名称", { exact: true }).fill("退出后继续编辑");
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
    "退出后继续编辑",
  );
});

test("手机长列表屏幕外卡片滚入后正常显示，筛选分组和末项打开不受延迟绘制影响", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { build, manifest } = fixture(200);
  let files = 0;
  await page.route("**/bd/index.json", (r) => r.fulfill({ json: manifest }));
  await page.route(`**/bd/${manifest.builds[199].file}`, (r) => {
    files++;
    return r.fulfill({ json: build });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "公开 BD 库", exact: true }).click();
  const dialog = page.getByRole("dialog", dialogName);
  await expect(dialog.locator(".archive-card")).toHaveCount(400);
  await expect(dialog.locator(".library-count")).toContainText("200 / 200");
  await page.getByLabel("搜索公开BD名称", { exact: true }).fill("滚动构筑 199");
  await expect(dialog.locator(".archive-card")).toHaveCount(2);
  await page.getByLabel("搜索公开BD名称", { exact: true }).fill("");
  await page
    .getByLabel("BD列表分组", { exact: true })
    .selectOption("profession");
  await expect(dialog.locator(".archive-card")).toHaveCount(200);
  const target = dialog.getByRole("button", { name: /滚动构筑 199/ });
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport();
  await expect(target.locator(".archive-card-title")).toHaveText(
    "滚动构筑 199",
  );
  expect(files).toBe(0);
  await target.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveValue(
    "滚动构筑 199",
  );
  await expect(page.getByLabel("配装名称", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  expect(files).toBe(1);
  expect(new URL(page.url()).hash).toBe("#bd=" + encodeURIComponent(build.id));
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});
