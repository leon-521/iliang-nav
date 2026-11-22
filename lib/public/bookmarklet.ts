"use client";

import * as React from "react";

const LIMITS = { url: 2048, title: 300, description: 500, selection: 1500 } as const;
const CAPTURE_MARKER = "capture=";
export type BookmarkletCapture = { url: string; title: string; description: string; selection: string };

/** No page content other than explicitly selected text and head metadata. */
export function buildBookmarkletCode(base: string) {
  let origin: string;
  try {
    const url = new URL(base);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    origin = url.origin;
  } catch { return ""; }
  const target = JSON.stringify(`${origin}/quick-add#${CAPTURE_MARKER}1&`);
  return "javascript:(function(){" +
    "if(!/^https?:$/.test(location.protocol))return;" +
    `if(location.href.length>${LIMITS.url}){alert('当前地址太长，请手动收藏。');return;}` +
    `var p=new URLSearchParams(),d=document.head&&(document.head.querySelector('meta[name="description" i]')||document.head.querySelector('meta[property="og:description" i]')),a=document.activeElement;` +
    "p.set('url',location.href);" +
    `p.set('title',document.title.slice(0,${LIMITS.title}));` +
    `if(d)p.set('description',d.content.trim().slice(0,${LIMITS.description}));` +
    `if(!a||!a.isContentEditable&&!/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)){var s=window.getSelection();if(s&&!s.isCollapsed)p.set('selection',s.toString().trim().slice(0,${LIMITS.selection}));}` +
    `window.open(${target}+p.toString(),'_blank','popup,width=560,height=720,noopener,noreferrer');})()`;
}

/** Parse a bounded fragment as untrusted plain text. Never include it in a request URL. */
export function readBookmarkletCapture(hash: string): BookmarkletCapture | null {
  if (!hash.startsWith(`#${CAPTURE_MARKER}`) || hash.length > 40_000) return null;
  const params = new URLSearchParams(hash.slice(1));
  if (params.get("capture") !== "1") return null;
  const url = params.get("url")?.trim();
  if (!url || url.length > LIMITS.url) return null;
  try {
    const target = new URL(url);
    if (!/^https?:$/.test(target.protocol) || target.username || target.password) return null;
  } catch { return null; }
  const text = (key: "title" | "description" | "selection") =>
    (params.get(key) ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, LIMITS[key]);
  return { url, title: text("title"), description: text("description"), selection: text("selection") };
}

export function isBookmarkletFragment(hash: string) {
  return hash.startsWith(`#${CAPTURE_MARKER}`);
}

export function useBookmarklet(baseUrl?: string) {
  const clientOrigin = React.useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  return buildBookmarkletCode(baseUrl ?? "") || buildBookmarkletCode(clientOrigin);
}

function subscribe() { return () => {}; }
