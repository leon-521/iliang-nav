import { expect, login, test } from "./helpers";

test("搜索在主题切换左侧，详细列表显示简介", async ({ page, jsErrors }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "搜索" });
  const theme = page.getByRole("button", { name: /^主题：/ }).first();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 1024) { await expect(search).toHaveCount(0); continue; }
    await expect(search).toBeVisible();
    const searchBox = await search.boundingBox();
    const themeBox = await theme.boundingBox();
    expect(searchBox!.x + searchBox!.width).toBeLessThan(themeBox!.x);
    expect(Math.abs(searchBox!.y - themeBox!.y)).toBeLessThan(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await page.getByRole("link", { name: "列表视图" }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("view") === "list");
  await expect(page.locator("#categories").getByText("第一个示例", { exact: true })).toBeVisible();
  expect(jsErrors).toEqual([]);
});

test("管理员在首页弹窗建立分类且不离开首页", async ({ page, jsErrors }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "新建分类", exact: true })).toHaveCount(0);
  await login(page, "/");
  await page.getByRole("button", { name: "新建分类", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新建分类" });
  await dialog.getByLabel("分类名称").fill("首页测试分类");
  await expect(dialog.getByLabel("可见性")).toHaveValue("private");
  await dialog.getByRole("button", { name: "创建分类" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("navigation", { name: "分类导航" }).getByRole("link", { name: "首页测试分类" })).toBeVisible();
  expect(jsErrors).toEqual([]);
});
