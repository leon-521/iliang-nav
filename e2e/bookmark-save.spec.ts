import { test, expect, login } from "./helpers";

/**
 * 保存书签。
 *
 * 这条路径出过两次线上事故：
 *  1. Server Action 报 409（部署换容器）→ 整页变成英文
 *     「This page couldn't load」，因为当时没有 error.tsx；
 *  2. 重复网址没有友好提示，用户以为保存成功。
 *
 * 所以除了「能保存」，还要断言「失败时留在弹窗里」。
 */
test.describe("书签保存", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "/bookmarks");
    await expect(page.getByRole("heading", { name: "书签" })).toBeVisible();
  });

  test("新增书签后出现在列表里", async ({ page, jsErrors }) => {
    const title = `E2E 新增 ${Date.now()}`;
    const url = `https://e2e-add-${Date.now()}.invalid/`;

    await page.getByRole("button", { name: "添加书签" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.locator('input[name="url"]').fill(url);
    await dialog.locator('input[name="title"]').fill(title);
    await dialog.getByRole("button", { name: "保存" }).click();

    /* 保存成功后弹窗关闭，列表里出现新行 */
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    expect(jsErrors, "保存过程中不应有未捕获异常").toEqual([]);
  });

  test("重复网址会被拒绝，提示留在弹窗里", async ({ page, jsErrors }) => {
    /* 种子数据里已有 example-a.invalid */
    await page.getByRole("button", { name: "添加书签" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.locator('input[name="url"]').fill("https://example-a.invalid/");
    await dialog.locator('input[name="title"]').fill("重复测试");
    await dialog.getByRole("button", { name: "保存" }).click();

    await expect(dialog.getByText("这个网址已经存在了")).toBeVisible({
      timeout: 20_000,
    });
    /* 弹窗必须还在 —— 关掉的话用户不知道发生了什么 */
    await expect(dialog).toBeVisible();
    expect(jsErrors).toEqual([]);
  });

  test("Server Action 失效时弹窗不崩、给刷新入口", async ({ page }) => {
    /*
     * 模拟部署换容器后的 409：浏览器还跑着旧构建，
     * action id 在新服务端不存在。这条是回归测试 ——
     * 修之前它会让整页变成英文错误页。
     */
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

    await page.getByRole("button", { name: "添加书签" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="url"]').fill("https://e2e-409.invalid/");
    await dialog.getByRole("button", { name: "保存" }).click();

    await expect(dialog.getByText(/保存没有发出去/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(dialog.getByRole("button", { name: "刷新页面" })).toBeVisible();
    /* 关键：整页没有掉进错误边界 */
    await expect(page.getByText(/This page couldn't load/)).toHaveCount(0);
    await expect(dialog).toBeVisible();
  });
});
