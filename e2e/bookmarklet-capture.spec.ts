import { test, expect, E2E_EMAIL, E2E_PASSWORD } from "./helpers";

const description = "MARKER-DESCRIPTION: 浏览器元数据";
const selection = "MARKER-SELECTION: 我主动选中的文字";
const fragment = "#capture=1&" + new URLSearchParams({ url: "https://example-b.invalid/new", title: "手动收藏来源", description, selection });

test("收藏片段留在浏览器，原地登录后可预览", async ({ page, jsErrors }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url() + (request.postData() ?? "")));
  await page.goto(`/quick-add${fragment}`);
  await expect(page.getByRole("heading", { name: "登录后收藏" })).toBeVisible();
  await expect(page).toHaveURL(/\/quick-add$/);
  await page.getByLabel("邮箱", { exact: true }).fill(E2E_EMAIL);
  await page.getByLabel("密码", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const form = page.getByRole("dialog", { name: "添加书签" });
  await expect(form.locator('input[name="url"]')).toHaveValue("https://example-b.invalid/new");
  await expect(form.locator('input[name="title"]')).toHaveValue("手动收藏来源");
  await expect(form.getByLabel("描述", { exact: true })).toHaveValue(description);
  await expect(form.getByLabel("AI 取材方式")).toHaveValue("provided");
  await expect(form.getByLabel("正文节选（可选）")).toHaveValue(selection);
  await expect(page).toHaveURL(/\/quick-add$/);
  expect(requests.every((request) => !/MARKER-DESCRIPTION|MARKER-SELECTION/.test(request))).toBe(true);
  expect(jsErrors).toEqual([]);
});
