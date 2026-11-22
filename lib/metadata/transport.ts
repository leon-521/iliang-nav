import { requestPinned, safeUrl, withinDeadline, type SafeRequest } from "../ai/network";

export class MetadataRedirectError extends Error {}
const redirects = new Set([301, 302, 303, 307, 308]);

export function identityEncoding(value?: string) {
  return !value || value.trim().toLowerCase() === "identity";
}

/** Keep existing metadata redirect support, pinning each hop and sharing one time budget. */
export async function fetchMetadataResource(raw: string, options: {
  timeoutMs: number; maxBytes: number; accept: string; allowPrefix?: boolean;
  acceptContent?: (type?: string) => boolean;
}, send: SafeRequest = requestPinned) {
  return withinDeadline(options.timeoutMs, async (signal) => {
    let url = safeUrl(raw);
    for (let hop = 0; hop <= 3; hop++) {
      signal.throwIfAborted();
      url.hash = "";
      const response = await send(url, {
        method: "GET", signal, maxBytes: options.maxBytes, rawBytes: true, allowPrefix: options.allowPrefix,
        acceptContent: (type, encoding) => identityEncoding(encoding) && (!options.acceptContent || options.acceptContent(type)),
        headers: { "user-agent": "iliang-nav/1.0", accept: options.accept, "accept-encoding": "identity" },
      });
      if (!redirects.has(response.status)) return { response, finalUrl: url.href };
      if (!response.location || hop === 3) throw new MetadataRedirectError("网页重定向无效或次数过多。可使用最终页面地址。");
      try {
        const target = safeUrl(new URL(response.location, url).href);
        if (url.protocol === "https:" && target.protocol === "http:") throw new MetadataRedirectError("不能从 HTTPS 网页跳转至 HTTP。");
        url = target;
      } catch (error) {
        if (error instanceof TypeError) throw new MetadataRedirectError("网页重定向地址无效。");
        throw error;
      }
    }
    throw new MetadataRedirectError("网页重定向次数过多。");
  });
}
