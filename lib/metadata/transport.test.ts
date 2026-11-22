import assert from "node:assert/strict";
import test from "node:test";
import { load } from "cheerio";
import { fetchMetadataResource } from "./transport";
import { decodePageBytes, extractHtmlFields } from "./page-fields";

const options = { timeoutMs: 500, maxBytes: 512, accept: "text/html", allowPrefix: true };

test("metadata redirects are bounded and validate every next hop", async () => {
  const urls: string[] = [];
  const result = await fetchMetadataResource("https://docs.example.com/start#anchor", options, async (url, request) => {
    urls.push(url.href);
    assert.equal(request.headers?.cookie, undefined);
    assert.equal(request.headers?.authorization, undefined);
    assert.equal(request.allowPrefix, true);
    return url.pathname === "/start" ? { status: 302, location: "/final", body: "" } : { status: 200, location: null, body: "" };
  });
  assert.equal(result.finalUrl, "https://docs.example.com/final");
  assert.deepEqual(urls, ["https://docs.example.com/start", "https://docs.example.com/final"]);
  for (const location of ["http://127.0.0.1/", "https://[::ffff:7f00:1]/", "http://docs.example.com/final"]) {
    let calls = 0;
    await assert.rejects(fetchMetadataResource("https://docs.example.com/start", options, async () => {
      calls++;
      return { status: 302, location, body: "" };
    }));
    assert.equal(calls, 1);
  }
});

test("bounded metadata extraction understands legacy encoding and ignores a truncated body", () => {
  assert.equal(decodePageBytes(Buffer.from([0xc4, 0xe3, 0xba, 0xc3]), "text/html; charset=gbk"), "你好");
  const html = '<head><title>Example</title><script type="application/ld+json">{"description":"A sufficiently descriptive example."}</script></head><body><h1>Visible heading</h1>';
  assert.deepEqual(extractHtmlFields(load(html), true), { title: "Example", description: "A sufficiently descriptive example." });
  assert.deepEqual(extractHtmlFields(load('<body><h1>Only a heading</h1>'), true), { title: "", description: "" });
});
