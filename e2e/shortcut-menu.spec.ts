import { expect, login, test } from "./helpers";

test("快捷入口菜单支持新建、编辑、排序、仅移除和确认删除", async ({ page, browser, baseURL, jsErrors }) => {
  await login(page, "/");
  const quick = page.getByRole("region", { name: "常用入口", exact: true });
  const original = "示例站点A";
  const created = "快捷菜单测试书签";
  const edited = "快捷菜单修改后书签";
  const link = (name: string) => quick.getByRole("link", { name, exact: true });
  const actions = (name: string) => quick.getByRole("button", { name: `${name}的常用入口操作`, exact: true });
  const menuitem = (name: string) => page.getByRole("menuitem", { name, exact: true });
  async function choose(label: string, command: string) {
    await actions(label).click();
    await menuitem(command).click();
  }

  // The visible keyboard menu and the right-click menu expose the same commands.
  await expect(actions(original)).toBeVisible();
  await link(original).click({ button: "right" });
  await menuitem("新建书签并加入").click();
  const form = page.getByRole("dialog", { name: /书签/ });
  await form.locator('input[name="url"]').fill("https://shortcut-menu-fixture.invalid/");
  await form.locator('input[name="title"]').fill(created);
  await form.getByRole("button", { name: "保存", exact: true }).click();
  await expect(link(created)).toBeVisible();
  await expect(quick.getByRole("status")).toContainText("已创建并添加");

  await choose(created, "编辑书签");
  await expect(form.locator('input[name="title"]')).toHaveValue(created);
  await form.locator('input[name="title"]').fill(edited);
  await form.getByRole("button", { name: "保存", exact: true }).click();
  await expect(link(edited)).toBeVisible();
  await choose(edited, "上移入口");
  await expect(quick.getByRole("status")).toHaveText("常用入口顺序已保存。");

  const guest = await browser.newPage({ baseURL });
  try {
    await guest.goto("/");
    const guestQuick = guest.getByRole("region", { name: "常用入口", exact: true });
    await expect(guestQuick.getByRole("link", { name: edited, exact: true })).toHaveCount(0);
    await expect(guestQuick.getByRole("button", { name: /常用入口操作/ })).toHaveCount(0);
  } finally { await guest.close(); }

  await choose(edited, "仅移除入口");
  await expect(link(edited)).toHaveCount(0);
  await expect(page.locator("#categories").getByText(edited, { exact: true })).toBeVisible();
  await choose(original, "添加已有书签");
  const picker = page.getByRole("dialog", { name: "常用工具" });
  await picker.getByRole("button", { name: new RegExp(`^${edited}`) }).click();
  await picker.getByRole("button", { name: "保存", exact: true }).click();
  await expect(link(edited)).toBeVisible();

  await choose(edited, "删除书签");
  const confirm = page.getByRole("dialog", { name: "删除书签？" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "取消", exact: true }).click();
  await expect(link(edited)).toBeVisible();
  await choose(edited, "删除书签");
  await confirm.getByRole("button", { name: "确认删除" }).click();
  await expect(link(edited)).toHaveCount(0);
  await expect(page.locator("#categories").getByText(edited, { exact: true })).toHaveCount(0);
  await expect(quick.getByRole("status")).toHaveText("书签已删除。");
  expect(jsErrors).toEqual([]);
});
