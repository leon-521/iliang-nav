/**
 * 主题常量。客户端 provider 与服务端 layout 都要用，所以单独放一个
 * 不依赖 React 的模块。
 *
 * 三态：system（跟随系统）/ light / dark。
 * 持久化两处：
 *  - localStorage —— 客户端首帧读取，避免闪白（同步、无网络开销）
 *  - cookie       —— 服务端渲染时读，用于输出正确的 <meta name="theme-color">，
 *                    让手机浏览器地址栏在首屏就是对的颜色
 * 两处必须同时写，否则会出现「页面深色、地址栏白色」的割裂。
 */

export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "nav-theme";
export const THEME_COOKIE = "nav-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * 浏览器 UI（地址栏 / 状态栏）取色，与 globals.css 的 --background 对应。
 * 后台与前台现在共用同一套色板，两处取值保持一致。
 */
export const THEME_BG = {
  light: "#f6f8fc",
  dark: "#131a28",
} as const;

/** 前台与后台共用底色。 */
export const PAPER_BG = THEME_BG;

export const PALETTE_KEY = "nav-palette";
export const DEFAULT_PALETTE = "indigo";
export const PALETTES = {
  indigo: { label: "石板靛蓝", swatch: "#465ba8", light: "#f6f8fc", dark: "#131a28" },
  teal: { label: "雾松青绿", swatch: "#216b60", light: "#f3f8f6", dark: "#121f20" },
  rose: { label: "玫瑰烟粉", swatch: "#984468", light: "#fbf5f7", dark: "#241922" },
  amber: { label: "暖砂琥珀", swatch: "#88521f", light: "#fbf7ef", dark: "#211b16" },
  violet: { label: "暮色藤紫", swatch: "#6947a3", light: "#f8f5fc", dark: "#1c1729" },
} as const;

export type Palette = keyof typeof PALETTES;

export function isPalette(value: unknown): value is Palette {
  return typeof value === "string" && Object.hasOwn(PALETTES, value);
}

export function isTheme(v: unknown): v is Theme {
  return v === "system" || v === "light" || v === "dark";
}

/** 三态文案集中在这里，UI 只消费，不各写一份 */
export const THEME_OPTIONS: Array<{
  value: Theme;
  label: string;
  hint: string;
}> = [
  { value: "system", label: "跟随系统", hint: "随设备外观自动切换" },
  { value: "light", label: "浅色", hint: "始终使用浅色" },
  { value: "dark", label: "深色", hint: "始终使用深色" },
];
