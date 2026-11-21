import { expect, login, test } from "./helpers";

test("AI 工具是整理分组中的独立后台页面", async ({ page }) => {
  await page.goto("/ai-tools");
  await expect(page).toHaveURL((url) => url.pathname === "/login");
  await login(page, "/bookmarks");
  await expect(page.getByRole("button", { name: "AI 工具", exact: true })).toHaveCount(0);
  const organize = page.locator('[data-sidebar="group"]').filter({ hasText: "整理" });
  await organize.getByRole("link", { name: "AI 工具", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI 工具", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("heading", { name: "预览与应用" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole("link", { name: "AI 供应商设置" }).click();
  await expect(page.getByRole("tabpanel", { name: "AI 供应商" })).toBeVisible();
});

test("批量 AI 要求确认、保留逐条失败结果，链接检测只能单选", async ({ page, jsErrors }) => {
  await login(page, "/ai-tools");
  const workspace = page.getByRole("region", { name: "书签 AI 工具" });
  const search = workspace.getByRole("searchbox", { name: "筛选书签" });
  const operation = workspace.getByLabel("操作", { exact: true });
  const generate = workspace.getByRole("button", { name: "生成预览" });
  const a = workspace.getByRole("checkbox", { name: "示例站点A", exact: true });
  const b = workspace.getByRole("checkbox", { name: "示例站点B", exact: true });

  await search.fill("示例站点A");
  await a.check();
  await expect(b).toHaveCount(0);
  await search.fill("示例站点B");
  await b.check();
  await expect(workspace.getByRole("group", { name: /已选 2 \/ 8/ })).toBeVisible();
  await expect(generate).toBeDisabled();
  await workspace.getByRole("checkbox", { name: /允许服务器访问所选书签/ }).check();
  await generate.click();

  // Both seeded bookmarks are already complete, so neither item calls a provider.
  const results = workspace.getByRole("region", { name: "逐条预览与结果" });
  await expect(results.getByRole("article")).toHaveCount(2);
  for (const title of ["示例站点A", "示例站点B"]) {
    const item = results.getByRole("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await expect(item.getByText(/补全不会覆盖现有内容/)).toBeVisible();
  }
  await expect(workspace.getByRole("status")).toContainText("已处理 2 / 2 条");
  await expect(workspace.getByRole("button", { name: /应用已选字段/ })).toHaveCount(0);

  await operation.selectOption("link");
  await search.fill("");
  await expect(workspace.getByRole("group", { name: /已选 0 \/ 1/ })).toBeVisible();
  await a.check();
  await expect(b).toBeDisabled();
  await expect(generate).toBeDisabled();
  expect(jsErrors).toEqual([]);
});

test("批量 AI 展示进度，并能在当前条目结束后停止", async ({ page }) => {
  await login(page, "/ai-tools");
  const workspace = page.getByRole("region", { name: "书签 AI 工具" });
  await workspace.getByRole("checkbox", { name: "示例站点A", exact: true }).check();
  await workspace.getByRole("checkbox", { name: "示例站点B", exact: true }).check();
  await workspace.getByRole("checkbox", { name: /允许服务器访问所选书签/ }).check();

  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/ai-tools", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      calls++;
      await gate;
    }
    await route.continue();
  });
  try {
    await workspace.getByRole("button", { name: "生成预览" }).click();
    await expect.poll(() => calls).toBe(1);
    await expect(workspace.getByRole("progressbar", { name: "预览进度" })).toBeVisible();
    await workspace.getByRole("button", { name: "停止后续预览" }).click();
    release();
    await expect(workspace.getByRole("status")).toContainText("已停止：已处理 1 / 2 条");
    await expect(workspace.getByRole("article")).toHaveCount(1);
    expect(calls).toBe(1);
  } finally {
    release();
  }
});
