import { test as base, expect, type Page } from "@playwright/test";

/**
 * 共用的登录动作。
 *
 * 走真实的 /login 表单，不伪造 cookie —— 伪造的话
 * 会话逻辑一改测试就失真，等于自己骗自己。
 */
export const E2E_EMAIL = "e2e@local.test";
export const E2E_PASSWORD = "E2ePassword123456";

export async function login(page: Page, next = "/dashboard") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.fill('input[name="email"]', E2E_EMAIL);
  await page.fill('input[name="password"]', E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 20_000,
  });
}

/** 任何未捕获的前端异常都算失败 —— 白屏往往就是这么来的 */
export const test = base.extend<{ jsErrors: string[] }>({
  jsErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
      await use(errors);
    },
    { auto: true },
  ],
});

export { expect };
