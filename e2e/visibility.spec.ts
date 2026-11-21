import { test, expect, login } from "./helpers";

/**
 * 可见性隔离。
 *
 * 这是安全项：private / unlisted 的书签，以及私有分类下的书签，
 * 一条都不能出现在匿名访客能看到的地方 —— 首页、分类页、搜索、sitemap。
 *
 * 之前这块零覆盖。lib/visibility.ts 是唯一入口，但它有两条判断
 * （书签自身可见性 + 分类可见性），任何一条被改动都不会有类型错误，
 * 只会静默泄漏。所以用真实浏览器逐条断言。
 *
 * 种子数据里三条「不该出现」的书签：
 *   私密书签                private
 *   链接可见书签            unlisted
 *   私有分类里的公开书签     public + private 分类
 */

const LEAKS = ["私密书签", "链接可见书签", "私有分类里的公开书签"];

test.describe("可见性隔离（匿名）", () => {
  test("首页不出现 private / unlisted / 私有分类的书签", async ({ page, jsErrors }) => {
    await page.goto("/");
    /*
     * 同一条书签会在「常用工具」网格和分类卡里各出现一次，
     * 用 .first() 避免 strict mode 报「匹配到 2 个元素」。
     */
    await expect(page.getByText("示例站点A").first()).toBeVisible();

    for (const title of LEAKS) {
      await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    }
    expect(jsErrors).toEqual([]);
  });

  test("侧栏不出现私有分类", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.getByRole("navigation", { name: "分类导航" }).first();
    await expect(sidebar.getByText("技术")).toBeVisible();
    /* 分类名泄漏和书签泄漏一样严重 */
    await expect(sidebar.getByText("私密分类")).toHaveCount(0);
  });

  test("搜索搜不到 private / unlisted", async ({ page }) => {
    /* 用三条书签共有的关键词，确保不是「词没匹配上」而是「被过滤了」 */
    await page.goto("/search?q=" + encodeURIComponent("不应出现"));
    await expect(page.getByText("没有匹配")).toBeVisible();

    for (const title of LEAKS) {
      await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    }
  });

  test("直接访问私有分类的 URL 返回 404", async ({ page }) => {
    /*
     * 分类 slug 是 `名字-<id前6位>`，种子里写死成 simi-e2e004。
     * 匿名访问必须 404 —— 不能出现「分类存在但内容为空」，
     * 那等于确认了这个私有分类的名字。
     */
    const res = await page.goto("/c/simi-e2e004");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("私密分类")).toHaveCount(0);
  });

  test("sitemap 里没有私有分类", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    expect(xml).not.toContain("simi-e2e004");
    /* 公开分类应该在，否则这条断言就没有意义了 */
    expect(xml).toContain("jishu-e2e001");
  });
});

test.describe("可见性隔离（管理员）", () => {
  test("登录后能看到私有分类和全部书签", async ({ page }) => {
    await login(page, "/bookmarks");
    await expect(page.getByRole("heading", { name: "书签" })).toBeVisible();

    /*
     * 管理员在后台表格里应该看到全部 8 条（5 公开 + 3 受限）。
     * 只断言「至少能看到那三条受限的」，不锁死总数 ——
     * 以后往种子里加数据不该让这条假失败。
     */
    for (const title of LEAKS) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }
  });

  test("管理员登录后公开首页显示全部（含私有）", async ({ page }) => {
    /*
     * 这是刻意的设计：管理员看公开页时不该被自己的可见性规则挡住，
     * 否则「我刚存的书签怎么不见了」。visibleWhere 对 admin 直接返回 undefined。
     */
    await login(page, "/");
    await expect(page.getByText("示例站点A").first()).toBeVisible();
    await expect(page.getByText("私密书签", { exact: true }).first()).toBeVisible();
  });
});
