"use client";

import * as React from "react";
import {
  DEFAULT_PALETTE,
  PALETTES,
  PALETTE_KEY,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEME_STORAGE_KEY,
  isTheme,
  isPalette,
  type Palette,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** 实际生效的主题（system 已解析成 light/dark） */
  resolved: ResolvedTheme;
  palette: Palette;
  setPalette: (palette: Palette) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(v)) return v;
  } catch {
    // 隐私模式可能禁用 localStorage，继续尝试 cookie。
  }
  const cookie = document.cookie.split("; ").find((part) => part.startsWith(`${THEME_COOKIE}=`))?.slice(THEME_COOKIE.length + 1);
  return isTheme(cookie) ? cookie : "system";
}

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";
function readStoredPalette(): Palette {
  try {
    const value = localStorage.getItem(PALETTE_KEY);
    if (isPalette(value)) return value;
  } catch {
    // Browser may disable storage.
  }
  return DEFAULT_PALETTE;
}

const serverPalette = (): Palette => DEFAULT_PALETTE;
const serverTheme = () => "system" as const;
const serverSystemDark = () => false;
const subscribeToInitialTheme = () => () => {};

function systemPrefersDark() {
  return window.matchMedia(SYSTEM_DARK_QUERY).matches;
}

function subscribeToSystemTheme(onChange: () => void) {
  const media = window.matchMedia(SYSTEM_DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** 两处同时写：localStorage 供首帧、cookie 供服务端渲染 theme-color */
function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 忽略写入失败
  }
  try {
    // 顶层 cookie 即可，不需要 httpOnly（客户端要能改）
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    // 同上
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Hydration uses the same snapshot on both sides; the head script handles the first paint.
  const stored = React.useSyncExternalStore(subscribeToInitialTheme, readStoredTheme, serverTheme);
  const systemDark = React.useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark, serverSystemDark);
  const [chosen, setChosen] = React.useState<Theme | null>(null);
  const theme = chosen ?? stored;
  const storedPalette = React.useSyncExternalStore(subscribeToInitialTheme, readStoredPalette, serverPalette);
  const [chosenPalette, setChosenPalette] = React.useState<Palette | null>(null);
  const palette = chosenPalette ?? storedPalette;

  const resolved: ResolvedTheme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  React.useEffect(() => {
    // Do not overwrite the head script while React still renders the server snapshot.
    if (palette !== (chosenPalette ?? readStoredPalette())) return;
    const actual = chosen ?? readStoredTheme();
    const dark = actual === "dark" || (actual === "system" && systemPrefersDark());
    if ((resolved === "dark") !== dark) return;
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = resolved;
    document.documentElement.dataset.palette = palette;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = PALETTES[palette][resolved];
    }
  }, [chosen, chosenPalette, palette, resolved]);

  // 首次挂载时对齐 cookie：老用户只有 localStorage，没有 cookie，
  // 不补写的话服务端永远拿不到他的选择。
  React.useEffect(() => {
    const stored = readStoredTheme();
    if (document.cookie.includes(`${THEME_COOKIE}=`)) return;
    persistTheme(stored);
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    persistTheme(next);
    setChosen(next);
  }, []);

  const setPalette = React.useCallback((next: Palette) => {
    try {
      localStorage.setItem(PALETTE_KEY, next);
    } catch {
      // Keep selection for the current session even without storage.
    }
    setChosenPalette(next);
  }, []);

  const value = React.useMemo(
    () => ({ theme, setTheme, resolved, palette, setPalette }),
    [theme, setTheme, resolved, palette, setPalette],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme 必须在 ThemeProvider 内使用");
  return ctx;
}
