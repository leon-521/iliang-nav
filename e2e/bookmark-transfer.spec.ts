import { expect, login, test } from "./helpers";

const archive = (suffix: string) => ({
  format: "iliang-nav-library", version: 1,
  categories: [
    { id: "nested", parentId: "root", name: `子分类-${suffix}`, sortOrder: -3, visibility: "public" },
    { id: "root", parentId: null, name: `导入-${suffix}`, sortOrder: 9, visibility: "public" },
    { id: "empty", parentId: "root", name: `空分类-${suffix}`, sortOrder: 2 },
  ],
  bookmarks: [
    { id: "new", categoryId: "nested", url: `https://transfer-${suffix}.invalid/`, altUrl: `https://alt-${suffix}.invalid/`, title: `=标题-${suffix}`, description: "quoted \"comma,\"\nsecond line", tags: ["标签甲", "标签乙"], sortOrder: -7, visibility: "public" },
    { id: "duplicate", categoryId: "nested", url: "https://example-a.invalid/", title: "不得覆盖旧书签", tags: ["不得写入"] },
  ],
  settings: { siteName: "未勾选不能生效", smtp_password: "TEST-ONLY-SENTINEL", weatherLat: 9 },
});

test("JSON preview merges without overwriting and export retains hierarchy, order, and tags", async ({ page }) => {
  const suffix = String(Date.now());
  const title = `=标题-${suffix}`;
  for (const format of ["json", "csv", "html"]) expect((await page.request.get(`/api/export?format=${format}`)).status()).toBe(401);
  await login(page, "/import");
  const upload = page.locator('input[type="file"]');
  await upload.setInputFiles({ name: "new.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(archive(suffix))) });
  await expect(page.getByRole("heading", { name: "确认导入" })).toBeVisible();
  await expect(page.getByText("将新建 3 个分类")).toBeVisible();
  const check = await page.request.get("/api/export?format=json");
  expect((await check.text()).includes(title)).toBe(false);
  await page.getByRole("button", { name: "确认导入 1 条" }).click();
  await expect(page.getByRole("heading", { name: "导入完成" })).toBeVisible();

  const response = await page.request.get("/api/export?format=json");
  expect(response.headers()["content-disposition"]).toContain(".json");
  const result = await response.json();
  expect(result.format).toBe("iliang-nav-library");
  expect(result.settings).not.toHaveProperty("smtp_password");
  expect(result.settings).not.toHaveProperty("weatherLat");
  expect(result.settings.siteName).not.toBe("未勾选不能生效");
  const root = result.categories.find((item: { name: string }) => item.name === `导入-${suffix}`);
  const nested = result.categories.find((item: { name: string }) => item.name === `子分类-${suffix}`);
  expect(root).toMatchObject({ sortOrder: 9, visibility: "private" });
  expect(nested).toMatchObject({ parentId: root.id, sortOrder: -3 });
  expect(result.categories).toEqual(expect.arrayContaining([expect.objectContaining({ name: `空分类-${suffix}` })]));
  expect(result.bookmarks).toEqual(expect.arrayContaining([expect.objectContaining({ title, categoryId: nested.id, tags: ["标签乙", "标签甲"], sortOrder: -7, visibility: "private" })]));
  expect(JSON.stringify(result)).not.toContain("不得覆盖旧书签");

  const csv = await page.request.get("/api/export?format=csv");
  expect(csv.headers()["content-disposition"]).toContain(".csv");
  const text = await csv.text();
  expect(text).toContain(`"'${title}"`);
  await upload.setInputFiles({ name: "same.csv", mimeType: "text/csv", buffer: Buffer.from(text) });
  await expect(page.getByRole("heading", { name: "确认导入" })).toBeVisible();
  await expect(page.locator('div').filter({ hasText: /^将新增$/ }).locator('xpath=following-sibling::div[1]')).toHaveText("0");
});
