import fs from "node:fs";
import path from "node:path";
import { test, expect } from "./helpers";

/**
 * 图标服务（/icons/<name>）。
 *
 * 这条用例守的是一个真实踩过的坑：
 * 图标原本放在 `public/icons`，Next.js standalone 在**启动那一刻**
 * 对 public/ 做目录快照，之后新写入的文件静态服务看不见 ——
 * 文件明明在磁盘上，访问一律 404，重启容器才好。
 * 表现就是「识别了图标但显示不出来」，非常像下载失败。
 *
 * 所以这里的关键不是「图标能访问」，而是
 * **服务已经在跑的时候新写一个文件，必须立刻能访问**。
 */

const ICON_DIR = process.env.ICON_DIR ?? "/tmp/nav-e2e-icons";

/** 最小的合法 PNG（1x1 透明），避免依赖 sharp 或外网 */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("图标服务", () => {
  test("服务运行中新写入的图标立刻可访问（不需要重启）", async ({ page }) => {
    const name = "deadbeefdeadbeef.png";
    fs.mkdirSync(ICON_DIR, { recursive: true });
    fs.writeFileSync(path.join(ICON_DIR, name), PNG_1PX);

    const res = await page.request.get(`/icons/${name}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    expect((await res.body()).length).toBe(PNG_1PX.length);
  });

  test("内容寻址的图标给长缓存", async ({ page }) => {
    const name = "cafebabecafebabe.png";
    fs.mkdirSync(ICON_DIR, { recursive: true });
    fs.writeFileSync(path.join(ICON_DIR, name), PNG_1PX);

    const res = await page.request.get(`/icons/${name}`);
    /* 文件名是来源 URL 的 hash，内容永不改变，可以放心 immutable */
    expect(res.headers()["cache-control"]).toContain("immutable");
  });

  test("非法文件名一律 404，挡住路径穿越", async ({ page }) => {
    const bad = [
      "../../etc/passwd",
      "..%2F..%2Fetc%2Fpasswd",
      "abc.png", // 不是 16 位 hex
      "deadbeefdeadbeef.txt", // 扩展名不在白名单
      "DEADBEEFDEADBEEF.png", // 大写不认
      "%2e%2e%2fpackage.json",
    ];

    for (const n of bad) {
      const res = await page.request.get(`/icons/${n}`);
      expect(res.status(), `${n} 应该被拒绝`).toBe(404);
    }
  });

  test("合法但文件不存在时 404，不是 500", async ({ page }) => {
    const res = await page.request.get("/icons/ffffffffffffffff.png");
    expect(res.status()).toBe(404);
  });
});
