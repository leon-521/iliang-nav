import assert from "node:assert/strict";
import test from "node:test";
import { complete, parseSuggestion } from "../lib/ai/provider";
import { isPublicAddress, linkTransport, pinAddress, pinnedLookup, providerEndpoint, type SafeRequest } from "../lib/ai/network";
import { checkUrl } from "../lib/links/check";

const cfg = { endpoint: "https://api.example.com/v1", model: "text-test", key: "unit-test-dummy-key" };
const mockResponse = (content: unknown) => JSON.stringify({ choices: [{ message: { content } }] });

test("public IP policy and endpoint reject private, mapped, local and unsafe URLs", () => {
  for (const address of ["127.1.1.1", "10.1.2.3", "169.254.169.254", "192.0.2.1", "198.18.0.1", "203.0.113.4", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:8.8.8.8", "64:ff9b::7f00:1", "fe80::abcd", "fe90::abcd", "fd00::1", "2001:db8::1", "2002:7f00:1::1", "ff02::1"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(address), true, address);
  for (const u of ["http://api.example.com/v1", "https://2130706433/v1", "https://0x7f000001/v1", "https://[::ffff:7f00:1]", "https://[fd00::1]", "https://metadata.google.internal/v1", "https://localhost./v1", "https://api.example.com:8443", "https://secret@api.example.com/", "https://api.example.com/?token=secret"]) {
    assert.throws(() => providerEndpoint(u), { name: "BlockedHostError" }, u);
  }
  assert.equal(providerEndpoint(cfg.endpoint).href, "https://api.example.com/v1/chat/completions");
  assert.equal(providerEndpoint("https://api.example.com/v1/chat/completions/").href, "https://api.example.com/v1/chat/completions");
});

test("DNS rejects mixed answers; transport lookup pins exactly the validated original host and address", async () => {
  const url = providerEndpoint(cfg.endpoint);
  await assert.rejects(pinAddress(url, async () => [{ address: "8.8.8.8", family: 4 }, { address: "::ffff:192.168.0.1", family: 6 }]), { name: "BlockedHostError" });
  let lookups = 0;
  const addr = await pinAddress(url, async () => {
    return [{ address: ++lookups === 1 ? "8.8.8.8" : "127.0.0.1", family: 4 }];
  });
  const lookup = pinnedLookup(url, addr);
  for (let i = 0; i < 2; i++) lookup(url.hostname, { all: true }, (e, values) => {
    assert.equal(e, null);
    assert.deepEqual(values, [{ address: "8.8.8.8", family: 4 }]);
  });
  lookup("different.example.com", { all: false }, (e) => assert.equal(e?.name, "BlockedHostError"));
  assert.equal(lookups, 1);
});

test("provider sends only text inference, no tools, does not follow redirects or expose raw body", async () => {
  let calls = 0;
  const redirect: SafeRequest = async (url, req) => {
    assert.equal(url.href, "https://api.example.com/v1/chat/completions");
    assert.equal(req.headers?.authorization, `Bearer ${cfg.key}`);
    assert.equal(req.method, "POST");
    const body = JSON.parse(req.body!);
    assert.deepEqual(Object.keys(body).sort(), ["max_tokens", "messages", "model", "stream"]);
    assert.equal(req.maxBytes, 65536);
    calls++;
    return { status: 307, location: "https://other.example.com/", body: cfg.key };
  };
  await assert.rejects(complete(cfg, "System instruction", {}, redirect), /重定向/);
  assert.equal(calls, 1);
  await assert.rejects(complete(cfg, "S", {}, async () => ({ status: 401, location: null, body: cfg.key })), (error: unknown) => error instanceof Error && !error.message.includes(cfg.key) && error.message.includes("401"));
  await assert.rejects(complete(cfg, "S", {}, async () => ({ status: 200, location: null, body: JSON.stringify({choices:[{message:{content:"ok",tool_calls:[{"function":{"name":"anything"}}]}}]}) })), /文本/);
  const suggestion = await complete(cfg, "S", {}, async () => ({ status: 200, location: null, body: mockResponse('{"title":"Valid title"}') }));
  assert.equal(parseSuggestion(suggestion, cfg.key, new Set()).title, "Valid title");
  assert.throws(() => parseSuggestion(`{"title":"${cfg.key}"}`, cfg.key, new Set()));
  assert.throws(() => parseSuggestion('{"title":"X","visibility":"public"}', cfg.key, new Set()));
  assert.throws(() => parseSuggestion('{"categoryId":"12345678-1234-4321-8234-123456789012"}', cfg.key, new Set()));
});

test("safe link probe refuses redirect to local/mapped destinations, preserves HEAD fallback and liveness evidence", async () => {
  for (const location of ["http://127.0.0.1/", "https://[::ffff:7f00:1]/", "ftp://ftp.example.com/"]) {
    let calls = 0;
    const result = await checkUrl("https://target.example.com/", linkTransport(async () => {
      calls++;
      return { status: 302, location, body: "" };
    }));
    assert.equal(result.reason, "blocked");
    assert.equal(calls, 1);
  }
  const visited: string[] = [];
  const gone = await checkUrl("https://target.example.com/", linkTransport(async (url, req) => {
    visited.push(`${req.method} ${url.pathname}`);
    if (url.pathname === "/") return { status: 302, location: "/moved", body: "" };
    return { status: req.method === "HEAD" ? 405 : 410, location: null, body: "" };
  }));
  assert.deepEqual(visited, ["HEAD /", "HEAD /moved", "GET /", "GET /moved"]);
  assert.equal(gone.reason, "not_found");
  assert.equal(gone.status, 410);
  assert.equal(gone.ok, false);
});
