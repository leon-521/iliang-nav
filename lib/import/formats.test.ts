import test from "node:test";
import assert from "node:assert/strict";
import { encodeCsv, parseTransfer, transferUrl } from "./formats";
import { serializeNetscape } from "./netscape";

const json = (data: object) => JSON.stringify({ format: "iliang-nav-library", version: 1, categories: [], bookmarks: [], ...data });

test("JSON resolves parents before children and rejects cycles and missing references", () => {
  const parsed = parseTransfer(json({ categories: [
    { id: "child", parentId: "root", name: "Sub", sortOrder: -7 },
    { id: "root", parentId: null, name: "Top", sortOrder: 10 },
  ], bookmarks: [{ id: "first", categoryId: "child", url: "https://example.test/", title: "Title", tags: ["导航", "AI"] }],
  settings: { footerText: "Public footer", auth_secret: "test-only-secret", weatherLat: 9 } }), "json");
  assert.deepEqual(parsed.categories.map((row) => row.id), ["root", "child"]);
  assert.deepEqual(parsed.bookmarks[0].folderPath, ["Top", "Sub"]);
  assert.deepEqual(parsed.settings, { footerText: "Public footer" });
  assert.throws(() => parseTransfer(json({ categories: [{ id: "a", parentId: "a", name: "Cycle" }] }), "json"), /循环/);
  assert.throws(() => parseTransfer(json({ bookmarks: [{ categoryId: "missing", url: "https://example.test", title: "Broken" }] }), "json"), /不存在/);
});

test("CSV escapes formula-like values, reads quoted multiline fields and reverses its own encoding", () => {
  const raw = encodeCsv([["https://example.test", " =fake", 'First, "quoted"\nSecond', '["A/B","子分类"]', '["甲","乙"]', "", "private", "-10", "1710000000", "", "1"]]);
  assert(raw.startsWith("\uFEFF"));
  assert(raw.includes('"\' =fake"'));
  const book = parseTransfer(raw, "csv").bookmarks[0];
  assert.equal(book.title, "=fake");
  assert.equal(book.description, 'First, "quoted"\nSecond');
  assert.deepEqual(book.folderPath, ["A/B", "子分类"]);
  assert.deepEqual(book.tags, ["甲", "乙"]);
  assert.equal(book.sortOrder, -10);
  assert.equal(book.iconHidden, true);
  assert.throws(() => parseTransfer('url,title\nhttps://example.test,"unclosed', "csv"), /引号/);
});

test("HTML retains folder order, empty folders, and descriptions; credential URLs are rejected", () => {
  const html = serializeNetscape({ emptyFolders: [["Z"], ["A", "empty"]],
    bookmarks: [{ url: "https://example.test/?a=1&b=2", title: "标题 & title", description: "详情", folderPath: ["A"] }] });
  const data = parseTransfer(html, "html");
  assert.deepEqual(data.categories.map((row) => row.path), [["Z"], ["A"], ["A", "empty"]]);
  assert.equal(data.bookmarks[0].description, "详情");
  assert.equal(data.bookmarks[0].url, "https://example.test/?a=1&b=2");
  assert.equal(transferUrl("https://username:secret@example.test/"), null);
  assert.equal(transferUrl("javascript:alert(1)"), null);
});
