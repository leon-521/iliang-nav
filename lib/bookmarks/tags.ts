export const MAX_BOOKMARK_TAGS = 12;
export const MAX_TAG_LENGTH = 32;
export const MAX_TAG_INPUT_LENGTH = 1024;

export function tagKey(label: string): string {
  return label.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function parseBookmarkTags(raw: string): { tags: string[]; error?: never } | { tags?: never; error: string } {
  if (raw.length > MAX_TAG_INPUT_LENGTH) return { error: "标签输入过长" };
  const unique = new Map<string, string>();
  for (const value of raw.normalize("NFKC").split(/[,、\r\n]+/u)) {
    const label = value.trim().replace(/^#+\s*/u, "").replace(/\s+/gu, " ");
    if (!label) continue;
    const key = tagKey(label);
    if ([...label].length > MAX_TAG_LENGTH || /[\p{Cc}\p{Cf}]/u.test(label)) {
      return { error: `单个标签最多 ${MAX_TAG_LENGTH} 个字符，且不能包含控制字符` };
    }
    if (!unique.has(key)) unique.set(key, label);
  }
  if (unique.size > MAX_BOOKMARK_TAGS) return { error: `每条书签最多 ${MAX_BOOKMARK_TAGS} 个标签` };
  return { tags: Array.from(unique.values()) };
}

export function tagSearchQuery(label: string): string {
  return `#"${label.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
