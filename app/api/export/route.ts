import { getViewer } from "@/lib/auth/session";
import { exportNetscape } from "@/lib/export/service";

/**
 * 导出全部书签为 Netscape Bookmark File。
 *
 * 放在 API 路由而不是 Server Action，是因为要触发浏览器下载 ——
 * Server Action 的返回值会被序列化进 RSC 流，拿不到「另存为」的行为。
 *
 * 鉴权只认管理员：导出会带上私有书签，匿名绝不能拿到。
 */
export async function GET() {
  const viewer = await getViewer();
  if (viewer.kind !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { html, filename } = exportNetscape();

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      /*
       * 用 filename*= 传 UTF-8 文件名。老浏览器不认这个参数，
       * 会退回 ASCII 的 filename，两边都覆盖到。
       */
      "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
}
