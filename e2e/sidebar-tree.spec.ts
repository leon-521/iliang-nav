import { test, expect } from "./helpers";

/**
 * 侧栏分类折叠。
 *
 * 这里有个必须守住的行为：点箭头只能展开/收起，
 * 不能顺手把人带到分类页 —— 之前整行是 <Link> 时就是这样，
 * 想展开子分类，结果人已经被导航走了。
 *
 * 种子数据：技术（顶层）→ 前端（二级）；工具（顶层，无子分类）
 */
test.describe("侧栏分类折叠", () => {
  test("点箭头展开子分类且不跳转", async ({ page, jsErrors }) => {
    await page.goto("/");
    const sidebar = page.getByRole("navigation", { name: "分类导航" }).first();
    await expect(sidebar).toBeVisible();

    /* 初始：二级分类「前端」不应出现 */
    await expect(sidebar.getByRole("link", { name: /前端/ })).toHaveCount(0);

    const toggle = sidebar.getByRole("button", { name: "展开 技术 的子分类" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    const urlBefore = page.url();
    await toggle.click();

    /* 展开了 */
    await expect(
      sidebar.getByRole("button", { name: "收起 技术 的子分类" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar.getByRole("link", { name: /前端/ })).toBeVisible();

    /* 而且没有跳转 —— 这是这条用例存在的理由 */
    expect(page.url()).toBe(urlBefore);

    /* 再点一次收起 */
    await sidebar.getByRole("button", { name: "收起 技术 的子分类" }).click();
    await expect(sidebar.getByRole("link", { name: /前端/ })).toHaveCount(0);
    expect(page.url()).toBe(urlBefore);

    expect(jsErrors).toEqual([]);
  });

  test("没有子分类的分类不显示箭头", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.getByRole("navigation", { name: "分类导航" }).first();
    /* 工具是顶层且没有子分类 */
    await expect(
      sidebar.getByRole("button", { name: /工具 的子分类/ }),
    ).toHaveCount(0);
  });

  test("直接访问二级分类页时上级自动展开", async ({ page }) => {
    /*
     * 从外部链接直接进 /c/前端-xxxx，侧栏里必须能看见「前端」，
     * 否则用户会以为自己点错了。slug 带 id 前 6 位，所以用正则匹配。
     */
    await page.goto("/");
    const sidebar = page.getByRole("navigation", { name: "分类导航" }).first();

    /* 先拿到「前端」的真实链接，再直接访问 */
    await sidebar.getByRole("button", { name: "展开 技术 的子分类" }).click();
    const link = sidebar.getByRole("link", { name: /前端/ });
    const href = await link.getAttribute("href");
    expect(href).toBeTruthy();

    await page.goto(href!);
    const sidebar2 = page.getByRole("navigation", { name: "分类导航" }).first();

    /* 上级自动展开 + 当前项高亮 */
    await expect(sidebar2.getByRole("link", { name: /前端/ })).toBeVisible();
    await expect(
      sidebar2.getByRole("button", { name: "收起 技术 的子分类" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar2.getByRole("link", { name: /前端/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
