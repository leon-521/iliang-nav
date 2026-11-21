import { expect, test } from "./helpers";

test("首页轻量入场尊重减少动态效果偏好", async ({ page }) => {
  const hero = page.locator('[aria-labelledby="home-title"]');
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(hero).toHaveCSS("animation-name", "fade-up");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(hero).toHaveCSS("animation-name", "none");
});
