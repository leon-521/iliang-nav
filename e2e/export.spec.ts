import { test, expect, login } from "./helpers";

/**
 * 导出书签（Netscape 格式）。
 *
 * 这条路径的意义是「数据不被锁死」：只要还能导出一份标准 HTML，
 * 用户随时能带着全部书签换到别的工具。所以测试重点不是文件长什么样，
 * 而是**能不能拿到、内容全不全、私有书签在不在**。
 */
test.describe("导出书签", () => {
  test("未登录时不能导出", async ({ page }) => {
    /*
     * 导出会带上私有书签，匿名绝不能拿到。
     * 这里用 request 直连，绕过页面渲染 —— 要测的就是路由本身的鉴权。
     */
    const res = await page.request.get("/api/export");
    expect(res.status()).toBe(401);
  });

  test("登录后能下载到包含全部书签的文件", async ({ page }) => {
    await login(page, "/settings");

    const res = await page.request.get("/api/export");
    expect(res.status()).toBe(200);

    /* 浏览器靠这两个头识别成「下载文件」而不是「打开网页」 */
    const cd = res.headers()["content-disposition"] ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toContain(".html");

    const body = await res.text();

    /* 文件头必须是 Netscape 格式，否则浏览器不认 */
    expect(body).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");

    /*
     * 公开书签要在，私有书签也要在 —— 导出是给自己做备份，
     * 把私有数据过滤掉等于备份不完整。
     */
    expect(body).toContain("示例站点A");
    expect(body).toContain("私密书签");

    /* 分类层级要保留，否则导入回来就成一堆散书签了 */
    expect(body).toContain("<DT><H3>技术</H3>");
    expect(body).toContain("<DT><H3>前端</H3>");
  });

  test("导出的内容能被自己的解析器读回来", async ({ page }) => {
    await login(page, "/import");
    const res = await page.request.get("/api/export");
    const html = await res.text();

    /*
     * 走真实上传界面做往返验证。
     *
     * 导入不是 POST 路由，而是「选文件 → Server Action 解析」，
     * 所以只能驱动 UI：把刚导出的文件塞进 file input，
     * 看预览能不能识别出条目。
     *
     * 断言「文件内条目 > 0」而不是具体数字 —— 这里要证明的是
     * 导出的格式能被自己读回来（导出/导入语义自洽），
     * 数字跟着种子数据变，写死只会变成维护负担。
     */
    await page.setInputFiles('input[type="file"]', {
      name: "bookmarks.html",
      mimeType: "text/html",
      buffer: Buffer.from(html, "utf8"),
    });

    /*
     * 用 heading 定位，不能用 getByText("确认导入")：
     * 页面上「确认导入」出现在三处（步骤条、小标题、提交按钮），
     * getByText 会命中 3 个元素直接抛 strict mode violation。
     */
    await expect(
      page.getByRole("heading", { name: "确认导入" }),
    ).toBeVisible({ timeout: 20_000 });

    /* 预览里「文件内条目」这个统计必须是正数 */
    const total = page
      .locator("div", { hasText: /^文件内条目$/ })
      .locator("xpath=following-sibling::div[1]");
    await expect(total).toBeVisible();
    const n = Number((await total.textContent())?.trim());
    expect(n).toBeGreaterThan(0);

    /*
     * 再确认「重复跳过」也等于条目数 —— 导出的就是库里已有的东西，
     * 全部被判重复才说明 URL 规范化是自洽的（否则同一个地址
     * 导出再导入会被当成新条目，用户会看到满屏重复）。
     */
    const dup = page
      .locator("div", { hasText: /^重复跳过$/ })
      .locator("xpath=following-sibling::div[1]");
    const d = Number((await dup.textContent())?.trim());
    expect(d).toBe(n);
  });
});

/**
 * 备用链接。
 *
 * 关键风险是 HTML 不允许 <a> 嵌套 <a>：一旦嵌套，浏览器会把内层
 * 拆到外面，点「备用」还是跳主站，功能等于没做。
 */
test.describe("备用链接", () => {
  test("前台卡片上有独立的备用入口", async ({ page }) => {
    await page.goto("/");

    const alt = page.getByRole("link", { name: /示例站点A 的备用链接/ }).first();
    await expect(alt).toBeVisible();
    await expect(alt).toHaveAttribute("href", "https://example-a-mirror.invalid/");
  });

  test("备用入口没有被嵌套进主链接里", async ({ page }) => {
    await page.goto("/");

    const nested = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      return links.filter((a) => a.querySelector("a") !== null).length;
    });

    /* a 套 a 是非法 HTML，浏览器解析后行为不可预测，一律不允许 */
    expect(nested).toBe(0);
  });

  test("没设备用链接的书签不会多出入口", async ({ page }) => {
    await page.goto("/");

    /* 「示例站点B」种子里没有 alt_url */
    const bAlt = page.getByRole("link", { name: /示例站点B 的备用链接/ });
    await expect(bAlt).toHaveCount(0);
  });
});
