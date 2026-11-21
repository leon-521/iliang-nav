/**
 * Next.js 启动钩子。
 *
 * 链接检测的定时器放在这里：容器起来就自动生效，
 * 不依赖宿主机 crontab，也不用额外跑一个进程。
 *
 * 注意只在 nodejs runtime 注册 —— edge 里没有 better-sqlite3。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // 构建阶段（收集页面数据）也会执行 register，别在那时候连库
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startLinkScheduler } = await import("./lib/links/scheduler");
  startLinkScheduler();

  const { startWebDavScheduler } = await import("./lib/webdav/scheduler");
  startWebDavScheduler();
}
