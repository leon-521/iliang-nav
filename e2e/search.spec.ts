import { test, expect } from "./helpers";

/**
 * 中文子串搜索。
 *
 * 这条是回归测试，起因是一个真 bug：FTS5 的 unicode61 分词器把连续的
 * CJK 字符当成一个 token，只支持前缀匹配。所以「我的资源合集」能搜到
 * 「我的」，却搜不到「资源」—— 而中文用户最常搜的就是这种两字词。
 *
 * 修法是 FTS 命中为 0 时退回 LIKE 子串匹配。下面这些用例锁住这个行为：
 * 一旦有人把兜底删掉，这里立刻红。
 */
test.describe("搜索", () => {
  test("中文子串能搜到（FTS 命中为 0 时退回 LIKE）", async ({ page, jsErrors }) => {
    /*
     * 「资源」在种子标题「我的资源合集」里位于 token 中间，
     * 纯 FTS 必然 0 命中，只有 LIKE 兜底能捞出来。
     */
    await page.goto("/search?q=" + encodeURIComponent("资源"));

    await expect(page.getByText("我的资源合集")).toBeVisible();
    /* 页头会显示「「资源」· N 条结果」 */
    await expect(page.getByText(/「资源」/)).toBeVisible();
    expect(jsErrors).toEqual([]);
  });

  test("英文仍然走 FTS 索引", async ({ page }) => {
    /* 「示例站点A」是纯中文，用它的域名片段测英文前缀匹配 */
    await page.goto("/search?q=example-a");
    await expect(page.getByText("示例站点A")).toBeVisible();
  });

  test("搜不到时给出空状态，不是白屏", async ({ page, jsErrors }) => {
    await page.goto("/search?q=" + encodeURIComponent("这个词肯定不存在zzz"));
    await expect(page.getByText("没有匹配")).toBeVisible();
    expect(jsErrors).toEqual([]);
  });

  test("通配符不会把整库都匹配出来", async ({ page }) => {
    /*
     * 用户搜「%」时，裸 % 会变成 SQL 通配符。
     * lib/search.ts 用 ESCAPE '\' 转义，所以应该 0 条，而不是全部。
     */
    await page.goto("/search?q=" + encodeURIComponent("%"));
    await expect(page.getByText("没有匹配")).toBeVisible();
  });

  test("空查询返回全部，不报错", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByText("输入关键词开始搜索")).toBeVisible();
  });
});
