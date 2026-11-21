import { expect, login, test } from "./helpers";

function keywordUrl(query: string) {
  return `/search?q=${encodeURIComponent(query)}`;
}

test("维护多个标签，并保持标签搜索的访客可见性", async ({ page, browser, baseURL, jsErrors }) => {
  await login(page, "/bookmarks");
  const unique = String(Date.now());
  const title = `标签测试书签 ${unique}`;
  const tag = `风格 ${unique}`;
  const second = `艺设${unique}`;
  await page.getByRole("button", { name: "添加书签" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /^网址/ }).fill(`https://tag-${unique}.invalid/`);
  await dialog.getByRole("textbox", { name: "标题", exact: true }).fill(title);
  await dialog.getByLabel("标签", { exact: true }).fill(`${tag}，${second}、${second}`);
  await dialog.getByLabel("可见性").selectOption("public");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row.getByText(second, { exact: true })).toHaveCount(1);
  await expect(row.getByText(tag, { exact: true })).toBeVisible();

  const guest = await browser.newPage({ baseURL });
  try {
    await guest.goto("/");
    const tagPanel = guest.getByRole("region", { name: "书签标签" });
    await tagPanel.getByRole("link", { name: new RegExp(second) }).click();
    await expect(guest).toHaveURL((url) => url.searchParams.get("tag") === second);
    await expect(guest.locator("#categories").getByText(title, { exact: true })).toBeVisible();
    await expect(guest.locator("#categories").getByText("示例站点A", { exact: true })).toHaveCount(0);
    await guest.goto(keywordUrl(`#"${tag}" #${second}`));
    await expect(guest.getByText(title, { exact: true })).toBeVisible();
    await guest.goto(keywordUrl(`标签测试书签 ${second}`));
    await expect(guest.getByText(title, { exact: true })).toBeVisible();
    await guest.goto(keywordUrl(`#风格`));
    await expect(guest.getByText(title, { exact: true })).toHaveCount(0);

    await row.getByRole("button", { name: "编辑", exact: true }).filter({ visible: true }).click();
    const labels = dialog.getByLabel("标签", { exact: true });
    await expect(labels).toHaveValue(new RegExp(second));
    // An editor that omits the entire field (not an explicitly empty input) must keep tags.
    await labels.evaluate((el) => el.removeAttribute("name"));
    await dialog.getByRole("textbox", { name: "描述", exact: true }).fill("只编辑描述，不提交标签。");
    await dialog.getByLabel("可见性").selectOption("private");
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row.getByText(second, { exact: true })).toBeVisible();
    await guest.goto(keywordUrl(`#${second}`));
    await expect(guest.getByText(title, { exact: true })).toHaveCount(0);
    await guest.goto(keywordUrl(second));
    await expect(guest.getByText(title, { exact: true })).toHaveCount(0);
    await page.goto(keywordUrl(`#${second}`));
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    await page.goto("/bookmarks");
    await row.getByRole("button", { name: "编辑", exact: true }).filter({ visible: true }).click();
    await dialog.getByLabel("标签", { exact: true }).fill("");
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row.getByText(second, { exact: true })).toHaveCount(0);
    await expect(row.getByText(tag, { exact: true })).toHaveCount(0);
    expect(jsErrors).toEqual([]);
  } finally {
    await guest.close();
  }
});
