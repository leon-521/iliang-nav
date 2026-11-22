import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { buildBookmarkletCode, readBookmarkletCapture } from "./bookmarklet";

function capture(activeElement: { tagName: string; isContentEditable?: boolean }, text: string) {
  const calls: [string, string, string][] = [];
  const code = buildBookmarkletCode("https://nav.example.com/path");
  const title = "自然语言 & #🪄";
  vm.runInNewContext(code.slice("javascript:".length), {
    location: new URL("https://page.example.com/a?x=1&y=2#heading"),
    URLSearchParams,
    document: {
      title,
      activeElement,
      head: { querySelector: (selector: string) => selector.includes('name="description"') ? { content: " 页面简介 " } : null },
      get cookie(): never { throw new Error("cookie must not be read"); },
      get body(): never { throw new Error("whole page must not be read"); },
    },
    window: {
      getSelection: () => ({ isCollapsed: false, toString: () => text }),
      open: (...args: [string, string, string]) => calls.push(args),
    },
  });
  assert.equal(calls.length, 1);
  const [href, target, features] = calls[0];
  assert.equal(target, "_blank");
  assert.match(features, /noopener,noreferrer/);
  const landing = new URL(href);
  assert.equal(landing.origin, "https://nav.example.com");
  assert.equal(landing.pathname, "/quick-add");
  assert.equal(landing.search, "");
  const payload = readBookmarkletCapture(landing.hash);
  assert.ok(payload);
  return payload;
}

test("bookmarklet keeps only bounded capture data in a URL fragment", () => {
  assert.deepEqual(capture({ tagName: "DIV" }, "中文 & #".repeat(300)), {
    url: "https://page.example.com/a?x=1&y=2#heading",
    title: "自然语言 & #🪄",
    description: "页面简介",
    selection: "中文 & #".repeat(300).slice(0, 1500),
  });
});

test("bookmarklet does not capture focused form or contenteditable selection", () => {
  for (const element of [{ tagName: "INPUT" }, { tagName: "TEXTAREA" }, { tagName: "DIV", isContentEditable: true }]) {
    assert.equal(capture(element, "don't capture").selection, "");
  }
});

test("capture rejects non-http URLs, embedded credentials and oversized payloads", () => {
  assert.equal(buildBookmarkletCode("javascript:alert(1)"), "");
  for (const url of ["javascript:alert(1)", "https://u:p@page.example.com/", "https://page.example.com/" + "x".repeat(2048)]) {
    assert.equal(readBookmarkletCapture("#capture=1&" + new URLSearchParams({ url })), null);
  }
  assert.equal(readBookmarkletCapture("#capture=1&url=https://example.com/&selection=" + "x".repeat(40_000)), null);
});
