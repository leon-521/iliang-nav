import { getViewer } from "@/lib/auth/session";
import { exportLibrary } from "@/lib/export/service";

/** All formats contain the administrator's entire bookmark library, including private records. */
export async function GET(request: Request) {
  const noCache = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if ((await getViewer()).kind !== "admin") return new Response("Unauthorized", { status: 401, headers: noCache });
  const format = new URL(request.url).searchParams.get("format") ?? "html";
  if (format !== "html" && format !== "json" && format !== "csv") {
    return new Response("Unsupported export format", { status: 400, headers: noCache });
  }
  const { body, filename, contentType } = exportLibrary(format);
  return new Response(body, {
    headers: {
      ...noCache,
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
