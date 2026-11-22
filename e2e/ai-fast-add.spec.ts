import { expect, login, test } from "./helpers";

test("编辑书签也可使用 AI，且需同意后才请求", async ({ page, jsErrors }) => {
  await login(page, "/bookmarks");
  const row = page.getByRole("row").filter({ hasText: "示例站点A" });
  await row.getByRole("button", { name: "编辑", exact: true }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "编辑书签" });
  await dialog.getByText("AI 辅助编辑", { exact: true }).click();
  const consent = dialog.getByRole("checkbox", { name: /允许服务器读取当前网址/ });
  const classify = dialog.getByRole("button", { name: "AI 智能分类", exact: true });
  for (const name of ["AI 补全", "AI 智能分类", "AI 标签", "生成 AI 草稿"]) {
    await expect(dialog.getByRole("button", { name, exact: true })).toBeDisabled();
  }
  await consent.check();
  await expect(classify).toBeEnabled();
  await classify.click();
  await expect(dialog.getByRole("alert")).toContainText("请先在设置中配置 AI 供应商");
  await expect(consent).not.toBeChecked();
  await expect(dialog.getByLabel("标题", { exact: true })).toHaveValue("示例站点A");
  await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  expect(jsErrors).toEqual([]);
});

test("可切换为手动节选并在内容变化时重新授权", async ({ page }) => {
  await login(page, "/bookmarks");
  const row = page.getByRole("row").filter({ hasText: "示例站点A" });
  await row.getByRole("button", { name: "编辑", exact: true }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "编辑书签" });
  await dialog.getByText("AI 辅助编辑", { exact: true }).click();
  await dialog.getByLabel("AI 取材方式").selectOption("provided");
  const consent = dialog.getByRole("checkbox", { name: /不读取网页/ });
  const generate = dialog.getByRole("button", { name: "生成 AI 草稿", exact: true });
  await expect(generate).toBeDisabled();
  await consent.check();
  await dialog.getByLabel("正文节选（可选）").fill("这里是从浏览器复制的测试正文，仅用于本次 AI 生成。");
  await expect(consent).not.toBeChecked();
  await expect(generate).toBeDisabled();
  await consent.check();
  await generate.click();
  await expect(dialog.getByRole("alert")).toContainText("请先在设置中配置 AI 供应商");
  await expect(dialog.getByLabel("正文节选（可选）")).not.toHaveAttribute("name");
});

test("AI 收藏需要明确同意，预览失败后仍可编辑和手动保存", async ({ page, jsErrors }) => {
  const suffix = String(Date.now());
  const url = `https://draft-${suffix}.invalid/`;
  await login(page, `/quick-add?url=${encodeURIComponent(url)}`);
  const dialog = page.getByRole("dialog", { name: "添加书签" });
  await dialog.getByText("AI 智能收藏", { exact: true }).click();
  const consent = dialog.getByRole("checkbox", { name: /允许服务器读取当前网址/ });
  const generate = dialog.getByRole("button", { name: "生成 AI 草稿" });
  await expect(dialog.locator('input[name="url"]')).toHaveValue(url);
  await expect(generate).toBeDisabled();
  await consent.check();
  // Test config points to an isolated AI settings file; no provider is called.
  await generate.click();
  await expect(dialog.getByRole("alert")).toContainText("请先在设置中配置 AI 供应商");
  await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  const title = `手动收藏 ${suffix}`;
  await dialog.getByLabel("标题", { exact: true }).fill(title);
  await dialog.getByLabel("描述", { exact: true }).fill("仍由管理员审阅后保存。");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("heading", { name: "已收藏" })).toBeVisible();
  await page.goto("/bookmarks");
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
  expect(jsErrors).toEqual([]);
});
