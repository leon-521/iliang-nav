import { expect, login, test } from "./helpers";

test("管理员可查看 MCP 手册并从整理进入导入导出", async ({ page }) => {
  await page.goto("/api-manual");
  await expect(page).toHaveURL(/\/login/);
  await login(page, "/api-manual");
  await expect(page.getByRole("heading", { name: "API 手册", exact: true })).toBeVisible();
  await expect(page.getByText(/grant_type=client_credentials/)).toBeVisible();
  await expect(page.getByRole("link", { name: "MCP 设置", exact: true })).toHaveAttribute("href", "/settings?tab=mcp");
  await page.getByRole("link", { name: "导入导出", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "导入", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "导出", exact: true }).click();
  const exportPanel = page.getByRole("tabpanel", { name: "导出", exact: true });
  for (const format of ["JSON", "CSV", "HTML"]) {
    await expect(exportPanel.getByRole("link", { name: `导出 ${format}` })).toHaveAttribute("href", `/api/export?format=${format.toLowerCase()}`);
  }
  await page.goto("/settings?tab=export");
  await expect(page).toHaveURL(/\/import\?tab=export$/);
  await expect(exportPanel).toBeVisible();
});
