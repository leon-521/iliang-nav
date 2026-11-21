import { expect, login, test } from "./helpers";

test("顶栏只提供站内搜索并保留查询词", async ({ page, jsErrors }) => {
  await page.goto("/");
  const header = page.getByRole("banner");
  const search = header.getByRole("searchbox", { name: "搜索" });
  await expect(page.getByRole("searchbox")).toHaveCount(1);
  await expect(header.getByRole("navigation", { name: "面包屑" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "书签标签" })).toBeVisible();
  // Initial HTML can arrive before the keyboard listener is hydrated.
  await expect.poll(async () => {
    await page.keyboard.press("/");
    return search.evaluate((input) => input === document.activeElement);
  }).toBe(true);
  await search.fill("资源");
  await search.press("Enter");
  await expect(page).toHaveURL((url) => url.pathname === "/search" && url.searchParams.get("q") === "资源");
  await expect(search).toHaveValue("资源");
  await expect(page.getByText("我的资源合集", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveCount(1);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(search).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("searchbox")).toHaveValue("资源");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(jsErrors).toEqual([]);
});

test("后台书签入口归到整理分组", async ({ page }) => {
  await login(page);
  const section = page.locator('[data-sidebar="group"]').filter({ hasText: "整理" });
  await expect(section.getByRole("link", { name: "书签", exact: true })).toHaveAttribute("href", "/bookmarks");
  await expect(page.locator('[data-sidebar="group"]').filter({ hasText: "总览" }).getByRole("link", { name: "书签", exact: true })).toHaveCount(0);
});

test("手机从底栏搜索，分类导航滑入并可退出", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("searchbox")).toHaveCount(0);
  await page.getByRole("button", { name: "打开菜单" }).click();
  const drawer = page.getByRole("dialog", { name: "分类导航" });
  await expect(drawer).toHaveCSS("animation-name", "mobile-nav-present");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await page.getByRole("navigation", { name: "移动端导航" }).getByRole("link", { name: "搜索" }).click();
  const search = page.getByRole("main").getByRole("searchbox");
  await search.fill("资源");
  await search.press("Enter");
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "资源");
});
