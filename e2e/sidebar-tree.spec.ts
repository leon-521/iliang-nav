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
  test("桌面默认展示二级分类，箭头只折叠或展开且不跳转", async ({ page, jsErrors }) => {
    await page.goto("/");
    const sidebar = page.getByRole("navigation", { name: "分类导航" }).first();
    await expect(sidebar).toBeVisible();

    const child = sidebar.getByRole("link", { name: /前端/ });
    await expect(child).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /技术/ })).toHaveText(/技术03/);
    await expect(child).toHaveText(/前端01/);
    await expect(sidebar.getByRole("link", { name: /私密分类/ })).toHaveCount(0);

    const parent = sidebar.getByRole("button", { name: "收起 技术 的子分类" });
    await expect(parent).toHaveAttribute("aria-expanded", "true");
    const urlBefore = page.url();
    await parent.click();
    await expect(child).toBeHidden();
    expect(page.url()).toBe(urlBefore);

    await sidebar.getByRole("button", { name: "展开 技术 的子分类" }).click();
    await expect(child).toBeVisible();
    expect(page.url()).toBe(urlBefore);

    expect(jsErrors).toEqual([]);
  });

  test("手机抽屉默认展开二级，并可手动折叠", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "打开菜单" }).click();
    const drawer = page.getByRole("dialog", { name: "分类导航" });
    const sidebar = drawer.getByRole("navigation", { name: "分类导航" });
    const child = sidebar.getByRole("link", { name: /前端/ });
    await expect(child).toBeVisible();
    await sidebar.getByRole("button", { name: "收起 技术 的子分类" }).click();
    await expect(child).toBeHidden();
    await expect(drawer).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
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
