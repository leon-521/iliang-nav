import test from "node:test";
import assert from "node:assert/strict";
import { fetchRepositoryVersion } from "./project-version-source";

test("GitHub is preferred and fallback is read only", async () => {
  const calls: string[] = [];
  const get: typeof fetch = async (input, init) => {
    calls.push(String(input));
    assert.equal(init?.redirect, "error");
    assert.equal(init?.headers, undefined);
    return new Response("ver: 0.1.5");
  };
  assert.deepEqual(await fetchRepositoryVersion(get), { tag: "0.1.5", source: "GitHub" });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/raw\.githubusercontent\.com\//);
});

test("unreachable or invalid origin falls back and labels mirror", async () => {
  for (const fail of ["invalid", "network", "oversize"]) {
    const get: typeof fetch = async (input) => {
      if (String(input).startsWith("https://raw.githubusercontent.com/")) {
        if (fail === "network") throw new TypeError("unavailable");
        return new Response(fail === "oversize" ? "x".repeat(65_537) : "no version here");
      }
      return new Response("ver: 0.1.6\n");
    };
    assert.deepEqual(await fetchRepositoryVersion(get), { tag: "0.1.6", source: "jsDelivr" });
  }
});

test("all sources unavailable leaves status unknown", async () => {
  const result = await fetchRepositoryVersion(async () => new Response(null, { status: 503 }));
  assert.ok("error" in result);
});
