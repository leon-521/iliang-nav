import { expect, test } from "./helpers";

test("书签区足够宽时显示三列，手机保持单列", async ({ page }) => {
  const cards = page.locator("#categories > ul");
  const count = () => cards.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect.poll(count).toBe(3);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect.poll(count).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});
