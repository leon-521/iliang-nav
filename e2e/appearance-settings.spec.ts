import { expect, login, test } from "./helpers";

test("配色与深浅模式可以组合并在刷新后保留", async ({ page, jsErrors }) => {
  await page.goto("/");
  const theme = page.getByRole("button", { name: /^主题：/ }).first();
  await theme.click();
  for (const name of ["石板靛蓝", "雾松青绿", "玫瑰烟粉", "暖砂琥珀", "暮色藤紫"]) {
    await expect(page.getByRole("menuitemradio", { name })).toBeVisible();
  }
  await page.getByRole("menuitemradio", { name: "玫瑰烟粉" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "rose");
  await theme.click();
  await page.getByRole("menuitem", { name: "深色", exact: true }).click();
  await page.reload();
  await expect(theme).toHaveAccessibleName("主题：深色");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "rose");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(36, 25, 34)");
  expect(jsErrors).toEqual([]);
});

test("管理设置使用真实标签页并支持键盘切换", async ({ page, jsErrors }) => {
  await login(page, "/settings");
  const tabs = page.getByRole("tablist", { name: "设置分类" });
  const site = tabs.getByRole("tab", { name: "站点信息" });
  const ai = tabs.getByRole("tab", { name: "AI 供应商" });
  const password = tabs.getByRole("tab", { name: "修改密码" });
  await expect(site).toHaveAttribute("aria-selected", "true");
  await site.focus();
  await site.press("ArrowRight");
  await expect(ai).toBeFocused();
  await ai.press("Enter");
  await expect(page.getByRole("tabpanel", { name: "AI 供应商" })).toBeVisible();
  await password.click();
  await expect(page.getByRole("tabpanel", { name: "修改密码" })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "站点信息" })).not.toBeVisible();
  await page.setViewportSize({ width: 1600, height: 900 });
  const fillRatio = () => page.locator('[data-slot="sidebar-inset"] main').evaluate((el) => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width);
  await expect.poll(fillRatio).toBeGreaterThan(0.94);
  await expect.poll(fillRatio).toBeLessThan(0.98);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect.poll(fillRatio).toBe(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(jsErrors).toEqual([]);
});
