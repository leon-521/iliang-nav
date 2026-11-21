import { test, expect, login } from "./helpers";

/**
 * 批量补全图标和简介。
 *
 * E2E 里 METADATA_DISABLED=1，所有抓取都短路 —— 所以这里验证的是
 * 「流程能跑通、进度会走、失败不炸」，而不是真的抓到了内容。
 * 真抓取属于联网验证，放在人工验收里做。
 */
test.describe("批量补全图标简介", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "/bookmarks");
    await expect(page.getByRole("heading", { name: "书签" })).toBeVisible();
  });

  test("按钮存在且作用于当前筛选结果", async ({ page, jsErrors }) => {
    const btn = page.getByRole("button", { name: /补全图标简介/ });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();

    /*
     * 筛选到「示例站点D」—— 种子数据里唯一缺图标缺简介的那条。
     * 筛选后按钮仍然可用，说明它认的是 filtered 而不是 rows。
     */
    await page.fill('input[placeholder*="筛选标题"]', "示例站点D");
    /*
     * 只断言「筛出 1 条」，不写死总数 ——
     * 以后往种子里加书签不该让这条用例假失败。
     */
    await expect(page.getByText(/^1 \/ \d+ 条$/)).toBeVisible();
    await expect(btn).toBeEnabled();
    expect(jsErrors).toEqual([]);
  });

  test("跑完后给出结果提示，页面不崩", async ({ page, jsErrors }) => {
    await page.fill('input[placeholder*="筛选标题"]', "示例站点D");

    await page.getByRole("button", { name: /补全图标简介/ }).click();

    /*
     * 抓取被禁用 → 全部计入「抓不到」。断言的是
     * 「有结论、能回到可用状态」，不是具体数字 ——
     * 数字会随批量大小变，锁死它等于给自己制造假失败。
     */
    await expect(page.getByText(/抓不到|没有需要补|补图标/)).toBeVisible({
      timeout: 30_000,
    });

    /* 按钮恢复可点，表格还在 */
    await expect(page.getByRole("button", { name: /补全图标简介/ })).toBeEnabled();
    await expect(page.locator("table")).toBeVisible();
    expect(jsErrors).toEqual([]);
  });

  test("Server Action 失效时只报失败，不影响表格", async ({ page }) => {
    await page.route("**/bookmarks**", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 409,
          contentType: "text/plain",
          body: "Server Action unavailable.",
        });
      } else {
        await route.continue();
      }
    });

    await page.fill('input[placeholder*="筛选标题"]', "示例站点D");
    await page.getByRole("button", { name: /补全图标简介/ }).click();

    await expect(page.getByText(/失败/)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByText(/This page couldn't load/)).toHaveCount(0);
  });
});
