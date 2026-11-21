import { expect, login, test } from "./helpers";

test("首页只允许管理员排序，并保存拖拽和分类权重", async ({ page, jsErrors }) => {
  await page.goto("/");
  await expect(page.locator("[data-home-bookmark]")).toHaveCount(0);
  await login(page, "/");
  const library = page.locator("#categories");
  const cards = library.locator("[data-home-bookmark]");
  const a = cards.filter({ hasText: "示例站点A" });
  const b = cards.filter({ hasText: "示例站点B" });
  // An interactive menu confirms the streamed homepage has hydrated before the drag.
  await a.getByRole("button", { name: "示例站点A的书签操作" }).click();
  await expect(page.getByRole("menuitem", { name: "编辑书签" })).toBeVisible();
  await page.keyboard.press("Escape");
  await b.scrollIntoViewIfNeeded();
  const target = await b.boundingBox();
  expect(target).not.toBeNull();
  await a.getByTitle(/拖到其他书签卡片/).dragTo(b, { targetPosition: { x: 15, y: Math.floor(target!.height * 0.8) } });
  await expect.poll(() => cards.evaluateAll((items) => items.findIndex((item) => item.textContent?.includes("示例站点B")) < items.findIndex((item) => item.textContent?.includes("示例站点A")))).toBe(true);
  await page.reload();
  await expect.poll(() => cards.evaluateAll((items) => items.findIndex((item) => item.textContent?.includes("示例站点B")) < items.findIndex((item) => item.textContent?.includes("示例站点A")))).toBe(true);

  await page.getByRole("button", { name: "分类排序" }).click();
  const order = page.getByRole("dialog", { name: "首页分类排序" });
  await order.getByRole("spinbutton", { name: "技术权重" }).fill("-30");
  await order.locator("li").filter({ hasText: "技术" }).getByRole("button", { name: "保存" }).click();
  await expect(order.getByRole("status")).toHaveText("顺序已保存。");
  await order.getByRole("combobox", { name: "所在层级" }).selectOption({ label: "技术的子分类" });
  await expect(order.getByRole("spinbutton", { name: "前端权重" })).toBeVisible();
  await page.keyboard.press("Escape");
  await a.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "编辑书签" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "删除书签" }).click();
  await expect(page.getByRole("dialog", { name: "删除书签？" })).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(a).toBeVisible();
  expect(jsErrors).toEqual([]);
});
