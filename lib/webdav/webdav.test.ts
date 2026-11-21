import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectionUrl, isDue, type ScheduleState, type WebDavConfig, WebDavError } from "./config";
import { selectAddress, uploadUrl } from "./network";
import { createRunner } from "./runner";
import { readConfig, readState, removeConfig, writeConfig, writeState } from "./storage";

const cfg: WebDavConfig = {
  endpoint: "https://dav.example.com/folder/",
  username: "test@local.test",
  password: "not-a-live-secret",
  intervalHours: 24,
  revision: randomUUID(),
  enabled: true,
};

const name = "app-20261121-210000-wdaaa.db";

test("WebDAV URL validation and safe append do not use credentials or user paths", () => {
  assert.equal(uploadUrl("https://dav.example.com:443/folder%20name", name).href, `https://dav.example.com/folder%20name/${name}`);
  for (const bad of ["http://dav.example.com/", "https://u:p@dav.example.com/", "https://dav.example.com/a?key=secret", "https://dav.example.com/a#hash", "https://dav.example.com/a%2fother", "https://dav.example.com/a%5cb"]) {
    assert.throws(() => collectionUrl(bad), WebDavError);
  }
  assert.throws(() => uploadUrl(cfg.endpoint, "../bad.db"), WebDavError);
});

test("WebDAV DNS accepts public addresses and requires exact operator pin for a private NAS", async () => {
  const signal = new AbortController().signal;
  const publicHost = collectionUrl(cfg.endpoint);
  assert.deepEqual(await selectAddress(publicHost, signal, async () => [{ family: 4, address: "1.1.1.1" }], ""), { family: 4, address: "1.1.1.1" });
  for (const address of ["127.0.0.1", "169.254.169.254", "192.168.1.10", "168.63.129.16", "::ffff:127.0.0.1", "fd00::1"]) {
    await assert.rejects(selectAddress(publicHost, signal, async () => [{ family: 4, address: "1.1.1.1" }, { family: address.includes(":") ? 6 : 4, address }], ""), WebDavError);
  }
  const nas = collectionUrl("https://nas.example.net:5006/backup/");
  const matches = async () => [{ family: 4, address: "192.168.1.9" }];
  await assert.rejects(selectAddress(nas, signal, matches, ""), WebDavError);
  await assert.rejects(selectAddress(nas, signal, matches, "https://nas.example.net:5006=192.168.1.10"), WebDavError);
  assert.equal((await selectAddress(nas, signal, matches, "https://nas.example.net:5006=192.168.1.9")).address, "192.168.1.9");
  await assert.rejects(selectAddress(collectionUrl("https://127.0.0.1/"), signal, undefined, "https://127.0.0.1=127.0.0.1"), WebDavError);
});

test("WebDAV scheduler persists attempts/failures and prevents overlap with a manual run", async () => {
  let now = 1_000_000;
  let state: ScheduleState | null = null;
  let deleted = 0;
  let calls = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const dependencies = {
    readConfig: () => cfg,
    readState: () => state,
    writeState: (newState: ScheduleState) => { state = newState; },
    create: async () => name,
    upload: async () => { calls += 1; if (calls === 1) await gate; else throw new WebDavError("Mock upload rejected"); },
    remove: () => { deleted += 1; },
    now: () => now,
  };
  const lock = { running: false };
  const run = createRunner(dependencies, lock);
  const first = run();
  assert.equal(dependencies.readState()?.result, "running");
  assert.match((await run(true) as { error: string }).error, /正在运行/);
  release();
  assert.deepEqual(await first, { ok: true, name });
  assert.equal(dependencies.readState()?.lastFile, name);
  assert.equal(dependencies.readState()?.lastSuccess, now);
  assert.equal(deleted, 1);
  assert.equal((await createRunner(dependencies, { running: false })()).ok, false);
  now += 86_400_000;
  assert.deepEqual(await run(), { ok: false, error: "Mock upload rejected" });
  assert.equal(dependencies.readState()?.lastRun, now);
  assert.equal(dependencies.readState()?.lastSuccess, 1_000_000);
  assert.equal(dependencies.readState()?.result, "failed");
  assert.equal(deleted, 2);
  assert.equal(isDue({ enabled: false, intervalHours: 1 }, null, now), false);
});

test("WebDAV credentials have authenticated encryption, and state belongs to one config", () => {
  const dir = mkdtempSync(join(tmpdir(), "iliang-webdav-test-"));
  const previous = { dir: process.env.WEBDAV_SETTINGS_DIR, secret: process.env.WEBDAV_SETTINGS_SECRET };
  process.env.WEBDAV_SETTINGS_DIR = dir;
  process.env.WEBDAV_SETTINGS_SECRET = "mock-test-credential-encryption-key-never-use";
  try {
    assert.equal(readConfig(), null);
    writeConfig(cfg);
    assert.deepEqual(readConfig(), cfg);
    const path = join(dir, "config.json");
    const wire = readFileSync(path, "utf8");
    assert(!wire.includes(cfg.password));
    const state = { revision: cfg.revision, lastRun: 1, lastSuccess: 2, lastFile: name, result: "success" as const, error: null };
    writeState(state);
    assert.deepEqual(readState(cfg.revision), state);
    assert.equal(readState(randomUUID()), null);
    writeFileSync(path, JSON.stringify({ ...JSON.parse(wire), endpoint: "https://wrong.example.com/" }));
    assert.throws(readConfig);
    removeConfig();
    assert.equal(readConfig(), null);
  } finally {
    if (previous.dir === undefined) delete process.env.WEBDAV_SETTINGS_DIR;
    else process.env.WEBDAV_SETTINGS_DIR = previous.dir;
    if (previous.secret === undefined) delete process.env.WEBDAV_SETTINGS_SECRET;
    else process.env.WEBDAV_SETTINGS_SECRET = previous.secret;
    rmSync(dir, { recursive: true, force: true });
  }
});
