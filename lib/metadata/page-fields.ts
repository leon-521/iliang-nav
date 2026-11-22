import type { CheerioAPI } from "cheerio";

/** Decode bounded bytes without running scripts or visiting HTML resources. */
export function decodePageBytes(bytes: Buffer, contentType?: string) {
  const header = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  const meta = bytes.subarray(0, 4096).toString("latin1").match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1];
  try { return new TextDecoder(header ?? meta ?? "utf-8").decode(bytes); }
  catch { return new TextDecoder().decode(bytes); }
}

/** Do not pass common HTML verification/error pages to the model as evidence. */
export function looksLikeAccessChallenge($: CheerioAPI) {
  const title = $("title").first().text().trim();
  return /^(?:just a moment|attention required|access denied|forbidden|verify (?:you are|that you are) human|robot check|captcha)(?:[.!…\s:|–-]|$)/i.test(title) ||
    $("#challenge-form, #cf-challenge-running, #cf-please-wait").length > 0;
}

function jsonLdDescription($: CheerioAPI, headOnly: boolean): string | undefined {
  let found: string | undefined;
  let budget = 256;
  function visit(value: unknown, depth: number) {
    if (found || depth > 6 || budget-- <= 0 || !value || typeof value !== "object") return;
    const description = (value as Record<string, unknown>).description;
    if (typeof description === "string" && description.trim().length > 20) { found = description; return; }
    for (const item of Object.values(value)) {
      visit(item, depth + 1);
      if (found || budget <= 0) break;
    }
  }
  $(headOnly ? 'head script[type="application/ld+json"]' : 'script[type="application/ld+json"]').slice(0, 8).each((_, element) => {
    if (found || budget <= 0) return;
    const value = $(element).text();
    if (value.length <= 65_536) {
      try { visit(JSON.parse(value), 0); } catch { /* Ignore malformed JSON-LD. */ }
    }
  });
  return found;
}

export function extractHtmlFields($: CheerioAPI, headOnly = false) {
  const root = $("head").first();
  const field = (selector: string) => root.find(selector).first().attr("content");
  const pick = (max: number, ...values: (string | undefined)[]) => values.map((value) => value?.replace(/\s+/gu, " ").trim()).find(Boolean)?.slice(0, max) ?? "";
  return {
    title: pick(300, field('meta[property="og:title"]'), field('meta[name="twitter:title"]'), root.find("title").first().text(), headOnly ? undefined : $("h1").first().text()),
    description: pick(500, field('meta[property="og:description"]'), field('meta[name="description"]'), field('meta[name="twitter:description"]'), jsonLdDescription($, headOnly)),
  };
}
