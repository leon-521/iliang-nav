"use client";

import * as React from "react";
import { useTheme } from "@/components/theme-provider";
import { PAPER_BG } from "@/lib/theme";

/**
 * 前台用的是 .theme-paper（暖纸底），与后台的中性底不同色。
 * 根布局的 theme-color 只能按后台色写死，所以前台由这里覆盖成纸色，
 * 否则手机上会出现「暖纸页面 + 纯黑地址栏」的割裂。
 */
export function ThemeColorSync() {
  const { resolved } = useTheme();

  React.useEffect(() => {
    const color = resolved === "dark" ? PAPER_BG.dark : PAPER_BG.light;
    for (const el of document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    )) {
      el.content = color;
    }
  }, [resolved]);

  return null;
}
