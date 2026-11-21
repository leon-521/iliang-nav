import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareReleaseVersions, parseRepositoryVersion } from "./project-version";

const root = new URL("../", import.meta.url);

test("published version matches the package and lockfile", () => {
  const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  const lock = JSON.parse(readFileSync(new URL("package-lock.json", root), "utf8"));
  assert.equal(parseRepositoryVersion(readFileSync(new URL("VERSION.md", root), "utf8")), manifest.version);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[""].version, manifest.version);
});

test("repository comparison only accepts one stable version declaration", () => {
  assert.equal(compareReleaseVersions("0.1.0", parseRepositoryVersion("ver：0.1.1\r\n")!), "update");
  assert.equal(compareReleaseVersions("0.1.0", parseRepositoryVersion("ver: v0.1.0\n")!), "latest");
  assert.equal(compareReleaseVersions("0.1.0", parseRepositoryVersion("ver: 0.0.9")!), "ahead");
  assert.equal(parseRepositoryVersion("ver: 0.2.0-rc.1"), null);
  assert.equal(parseRepositoryVersion("ver: 0.1.0\nver: 0.1.1"), null);
});
