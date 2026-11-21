import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 配置。
 *
 * 只跑真实浏览器里的关键路径 —— 保存书签、侧栏折叠、批量补全。
 * 这三条都是「改坏了用户立刻会撞上」的地方，也是最容易在重构里
 * 悄悄退化、又不会被类型检查发现的地方。
 *
 * 不联网：webServer 里带 METADATA_DISABLED=1，所有外部抓取直接短路。
 * 用例必须只依赖自己的种子数据，不能依赖 example.com 今天通不通。
 */
export default defineConfig({
  testDir: "./e2e",
  /* 用例之间共享同一个库，串行跑最稳；并行会互相删数据 */
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://127.0.0.1:3200",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],

  /*
   * 直接复用 standalone 产物：dev server 的编译延迟会让
   * 「等 3 秒看进度条」这类断言变得不可靠。
   */
  webServer: {
    command: "bash scripts/e2e-server.sh",
    url: "http://127.0.0.1:3200/",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
