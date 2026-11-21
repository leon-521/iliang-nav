import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { DEFAULT_PALETTE, PALETTES, PALETTE_KEY, THEME_BG, THEME_COOKIE, THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "iliang nav",
    template: "%s · iliang nav",
  },
  description: "个人书签导航 —— 收录、归类、随时可达。",
  applicationName: "iliang nav",
  appleWebApp: { capable: true, title: "iliang nav", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // 注意：这里不能设 noindex。根布局同时服务公开域与后台域，
  // 公开域必须可被索引；后台域的 noindex 由 (admin)/layout 与 proxy 的
  // X-Robots-Tag 负责。
};

/**
 * theme-color 走静态双 media 声明，而不是在根布局读 cookie：
 * 读 cookie 会把 /login、404 这类本可静态化的路由全部拖成动态渲染，
 * 而浏览器地址栏的颜色差异用两条 media 就够覆盖「跟随系统」的场景。
 * 用户显式选了浅/深色时，由首屏脚本把两条都改成同一颜色。
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_BG.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_BG.dark },
  ],
};

/**
 * 首屏前应用主题：
 *  1. 读 localStorage（老用户）→ 没有就读 cookie（新设备）→ 再退回 system
 *  2. 切换 <html> 的 .dark 与 color-scheme
 *  3. 同步 theme-color，避免深色页面配白色地址栏
 * 整段同步执行、不 await，保证在首次绘制前完成，不闪白。
 */
const themeScript = `(function(){try{
var L=${JSON.stringify(THEME_STORAGE_KEY)},C=${JSON.stringify(THEME_COOKIE)};
var palettes=${JSON.stringify(PALETTES)}, p=${JSON.stringify(DEFAULT_PALETTE)};
 try{var saved=localStorage.getItem(${JSON.stringify(PALETTE_KEY)});if(Object.prototype.hasOwnProperty.call(palettes,saved))p=saved}catch(e){}
 document.documentElement.dataset.palette=p;
 var BG=palettes[p];
var t=null;
try{t=localStorage.getItem(L)}catch(e){}
if(t!=="light"&&t!=="dark"&&t!=="system"){
  var m=document.cookie.match(new RegExp("(?:^|; )"+C+"=([^;]*)"));
  t=m?decodeURIComponent(m[1]):"system";
}
var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.classList.toggle("dark",d);
document.documentElement.style.colorScheme=d?"dark":"light";
if(t==="light"||t==="dark"||p!==${JSON.stringify(DEFAULT_PALETTE)}){
  var metas=document.querySelectorAll('meta[name="theme-color"]');
  for(var i=0;i<metas.length;i++){metas[i].setAttribute("content",d?BG.dark:BG.light)}
}
}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
