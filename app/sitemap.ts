import type { MetadataRoute } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";

/**
 * 必须动态生成。
 *
 * 之前它是构建期静态固化的：Docker 构建时镜像里还没有 data/app.db，
 * 查询抛错被下面的 try/catch 吞掉，于是产物里永远只有根路径一条 ——
 * 线上实测 18 个公开分类一个都没进 sitemap，白丢了一整批可索引页面。
 *
 * 改成动态后每次请求都查库，分类增删立刻生效，也不用担心
 * 「构建机没有库」这种环境差异。
 */
export const dynamic = "force-dynamic";

/**
 * 公开域 sitemap。后台域不需要收录，proxy 已给它全站 noindex。
 * 分类现在有独立路由 /c/<slug>，所以要一起列出来 ——
 * 只列 public 的分类，私有分类不该出现在任何公开产物里。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const now = new Date();

  /*
   * 这里不再包 try/catch。
   *
   * 吞错误正是上一个 bug 的成因：库读不到时静默退化成「只有首页」，
   * 看起来一切正常，实际丢了全部分类页。动态渲染下库一定存在，
   * 真出错就该在日志里看得见，而不是假装成功。
   */
  const catRoutes: MetadataRoute.Sitemap = db
    .select({ slug: categories.slug })
    .from(categories)
    .where(eq(categories.visibility, "public"))
    .orderBy(asc(categories.sortOrder))
    .all()
    .map((c) => ({
      url: `${base}/c/${encodeURIComponent(c.slug)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    ...catRoutes,
  ];
}
