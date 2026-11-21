import fs from "node:fs";
import { getViewer } from "@/lib/auth/session";
import { backupPath } from "@/lib/backup/service";

/** 下载备份文件。只给管理员，匿名直接 401。 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const viewer = await getViewer();
  if (viewer.kind !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { name } = await ctx.params;

  let file: string;
  try {
    file = backupPath(name);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const buf = fs.readFileSync(file);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.sqlite3",
      "content-length": String(buf.byteLength),
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
