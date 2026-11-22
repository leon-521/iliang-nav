import { expect, login, test } from "./helpers";

test("后台设置的昵称显示在首页时段问候里", async ({ page, jsErrors }) => {
  await login(page, "/settings");
  const panel = page.getByRole("tabpanel", { name: "站点信息" });
  await panel.getByLabel("首页昵称").fill("设计师");
  await panel.getByRole("button", { name: /^保存/ }).click();
  await expect(panel.getByText("已保存", { exact: true })).toBeVisible();
  await page.goto("/");
  await expect(page.locator("#home-title")).toHaveText(/^(夜深了|早上好|中午好|下午好|晚上好)，设计师$/);
  await expect(page.getByRole("region", { name: "当地天气" })).toHaveCount(0);
  expect(jsErrors).toEqual([]);
});
