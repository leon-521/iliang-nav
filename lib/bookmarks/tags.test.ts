import assert from "node:assert/strict";
import test from "node:test";
import { MAX_BOOKMARK_TAGS, MAX_TAG_LENGTH, parseBookmarkTags, tagKey } from "./tags";

test("tag keys normalize case, full-width forms and repeated whitespace", () => {
  assert.equal(tagKey("  Ｄｅｓｉｇｎ  Tool "), "design tool");
  assert.deepEqual(parseBookmarkTags(" #Ｄｅｓｉｇｎ  Tool，design tool、中文\n标签"), { tags: ["Design Tool", "中文", "标签"] });
  assert.deepEqual(parseBookmarkTags("， 、 #   "), { tags: [] });
});

test("tag count, Unicode length and unsafe control characters are constrained", () => {
  assert.equal(parseBookmarkTags(Array.from({ length: MAX_BOOKMARK_TAGS + 1 }, (_, i) => `tag${i}`).join(",")).error?.includes(String(MAX_BOOKMARK_TAGS)), true);
  assert.deepEqual(parseBookmarkTags("字".repeat(MAX_TAG_LENGTH)), { tags: ["字".repeat(MAX_TAG_LENGTH)] });
  assert.ok(parseBookmarkTags("字".repeat(MAX_TAG_LENGTH + 1)).error);
  assert.ok(parseBookmarkTags("normal\u0000tag").error);
});
