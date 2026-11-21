import { expect, login, test } from "./helpers";

const first = "示例站点A";
const second = "示例站点B";

test("首页常用入口可添加、拖动并保存，访客只能查看", async ({ page, browser, baseURL, jsErrors }) => {
  await login(page, "/");
  const quick = page.getByRole("region", { name: "常用入口", exact: true });
  const open = quick.getByRole("button", { name: "添加常用入口" });
  const dialog = page.getByRole("dialog", { name: "常用工具" });
  const save = dialog.getByRole("button", { name: "保存", exact: true });
  const links = quick.getByRole("link");

  async function clearConfigured() {
    await open.click();
    if (await dialog.isVisible()) {
      const remove = dialog.getByRole("button", { name: /^移除/ });
      // Remove only known, enabled entries in this isolated seeded fixture.
      const enabled = remove.and(dialog.locator("button:not([disabled])"));
      for (let i = await enabled.count(); i > 0; i--) await enabled.first().click();
      await save.click();
      await expect(dialog).toBeHidden();
    }
  }

  try {
    await open.click();
    await expect(dialog).toBeVisible();
    const removeFirst = dialog.getByRole("button", { name: `移除 ${first}`, exact: true });
    if (await removeFirst.count()) await removeFirst.click();
    await dialog.getByRole("button", { name: new RegExp(`^${first}`) }).click();
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(links.last()).toHaveAccessibleName(first);

    await quick.getByRole("button", { name: "调整顺序" }).click();
    const a = quick.locator("[data-quick-tool-id]").filter({ has: page.getByRole("link", { name: first, exact: true }) });
    const b = quick.locator("[data-quick-tool-id]").filter({ has: page.getByRole("link", { name: second, exact: true }) });
    await a.getByTitle("拖动排序").dragTo(b);
    await expect(quick.getByRole("status")).toHaveText("常用入口顺序已保存。");
    const firstIsBeforeSecond = async () => {
      const names = await links.allTextContents();
      return names.findIndex((s) => s.includes(first)) < names.findIndex((s) => s.includes(second));
    };
    await expect.poll(firstIsBeforeSecond).toBe(true);

    // Both keyboard and touch users can use the normal movement buttons.
    const forward = a.getByRole("button", { name: `后移 ${first}` });
    await forward.focus();
    await page.keyboard.press("Enter");
    await expect.poll(firstIsBeforeSecond).toBe(false);
    await expect(quick.getByRole("status")).toHaveText("常用入口顺序已保存。");
    await page.reload();
    await expect(links.filter({ hasText: first })).toBeVisible();
    const persisted = await links.allTextContents();
    expect(persisted.findIndex((s) => s.includes(first))).toBeGreaterThan(persisted.findIndex((s) => s.includes(second)));

    const guest = await browser.newPage({ baseURL });
    try {
      await guest.goto("/");
      const guestQuick = guest.getByRole("region", { name: "常用入口", exact: true });
      await expect(guestQuick.getByRole("link", { name: first, exact: true })).toBeVisible();
      await expect(guestQuick.getByRole("button")).toHaveCount(0);
    } finally { await guest.close(); }
    expect(jsErrors).toEqual([]);
  } finally {
    await clearConfigured();
  }
});
