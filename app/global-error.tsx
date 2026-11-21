"use client";

import * as React from "react";

/**
 * 根布局本身出错时的兜底。
 *
 * app/error.tsx 盖不住根布局（它渲染在 layout 内部），
 * 根布局一崩就只剩 Next 自带的英文错误页。这个文件要自带
 * <html> / <body>，所以样式只能内联 —— 此时全局 CSS 可能也没加载成功。
 *
 * 实际很少触发；加上它是为了「任何情况下都不给用户看英文报错」。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#faf9f5",
          color: "#1f1e1b",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        }}
      >
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
            这个页面没打开
          </h1>
          <p
            style={{
              marginTop: 6,
              fontSize: 13,
              lineHeight: 1.6,
              color: "#6b6a65",
            }}
          >
            可能是站点刚更新过。刷新一下通常就好了。
          </p>
          <div
            style={{
              marginTop: 18,
              display: "flex",
              gap: 8,
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 10,
                border: "none",
                background: "#1f6f5c",
                color: "#fff",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              刷新页面
            </button>
            <button
              type="button"
              onClick={reset}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 10,
                border: "1px solid #dcd9d0",
                background: "transparent",
                color: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              重试
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
