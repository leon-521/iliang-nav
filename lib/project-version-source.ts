import { parseRepositoryVersion, PROJECT_REPOSITORY } from "./project-version";

const origin = `https://raw.githubusercontent.com/${PROJECT_REPOSITORY}/main/VERSION.md`;
const mirror = `https://cdn.jsdelivr.net/gh/${PROJECT_REPOSITORY}@main/VERSION.md`;
export type RepositoryVersion = { tag: string; source: "GitHub" | "jsDelivr" } | { error: string };

export async function fetchRepositoryVersion(request: typeof fetch = fetch): Promise<RepositoryVersion> {
  async function read(url: string) {
    try {
      const res = await request(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3000) });
      if (!res.ok || !res.body) return null;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let size = 0, text = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 65_536) { void reader.cancel().catch(() => {}); return null; }
          text += decoder.decode(value, { stream: true });
        }
        return parseRepositoryVersion(text + decoder.decode());
      } finally { reader.releaseLock(); }
    } catch { return null; }
  }
  const github = await read(origin);
  if (github) return { tag: github, source: "GitHub" };
  const cdn = await read(mirror);
  if (cdn) return { tag: cdn, source: "jsDelivr" };
  return { error: "暂时无法从 GitHub 或 jsDelivr 读取有效版本，无法确认更新状态。" };
}
