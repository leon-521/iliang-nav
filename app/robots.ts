import type { MetadataRoute } from "next";

/**
 * 前后台现在同一个域名，robots.txt 不能再按 host 区分，
 * 只能按路径排除后台。
 *
 * 只靠 noindex 头不够：爬虫先看到的是 robots，允许抓取后才会去读
 * noindex。后台路径干脆 Disallow，双保险。
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/bookmarks",
          "/categories",
          "/import",
          "/settings",
          "/quick-add",
          "/login",
          "/forgot-password",
          "/reset-password",
          "/logout",
          "/api/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
