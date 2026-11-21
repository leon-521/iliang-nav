import fs from "node:fs/promises";
import path from "node:path";
import { ICON_DIR, ICON_NAME_RE } from "@/lib/metadata/icons";

/**
 * 图标服务。
 *
 * 为什么不能放在 public/ 里：
 * Next.js standalone 在**启动那一刻**对 public/ 做一次目录快照，
 * 之后新写进去的文件静态服务看不见，一律 404 且不会自愈 ——
 * 每存一个新图标就得重启一次容器。实测过：文件明明在，
 * 访问 404，重启后立刻 200。
 *
 * 改成动态路由直接读盘，新图标写进去就能访问。
 *
 * 图标是内容寻址的（文件名是来源 URL 的 hash），内容永不改变，
 * 所以可以放心给一年缓存 + immutable。
 */

const MIME: Record<string, string> = {
  png: "image/png",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const { name } = await ctx.params;

  /*
   * 文件名必须严格匹配「16 位 hex + 白名单扩展名」。
   * 这一条同时挡住了 `../` 穿越和任意文件读取 ——
   * 不能靠 path.join 之后再比较前缀，那种写法很容易被编码绕过。
   */
  if (!ICON_NAME_RE.test(name)) {
    return new Response("Not found", { status: 404 });
  }

  const ext = name.slice(name.lastIndexOf(".") + 1);
  const file = path.join(ICON_DIR, name);

  try {
    const buf = await fs.readFile(file);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "content-length": String(buf.byteLength),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
