import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { configFields, scheduleState, type ScheduleState, type WebDavConfig } from "./config";

const storedSchema = configFields.omit({ password: true }).extend({ revision: z.string().uuid(), cipher: z.string().max(8192) });

type Credentials = z.infer<typeof storedSchema>;

function storageDir() {
  const path = process.env.WEBDAV_SETTINGS_DIR;
  if (path) {
    if (!isAbsolute(path)) throw new Error("WEBDAV_SETTINGS_DIR must be absolute");
    return path;
  }
  const instance = createHash("sha256").update(resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH ?? "data/app.db")).digest("hex").slice(0, 24);
  return join(homedir(), ".iliang-nav", `webdav-${instance}`);
}

function secretKey() {
  const secret = process.env.WEBDAV_SETTINGS_SECRET ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("WebDAV encryption secret unavailable");
  return createHash("sha256").update("iliang-nav/webdav/v1\0").update(secret).digest();
}

function aad(c: Omit<Credentials, "cipher">) {
  return Buffer.from(JSON.stringify([c.endpoint, c.username, c.enabled, c.intervalHours, c.revision]));
}

function read(name: string): unknown {
  try { return JSON.parse(readFileSync(/* turbopackIgnore: true */ join(storageDir(), name), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function write(name: string, value: unknown) {
  const folder = storageDir();
  const target = join(folder, name);
  const file = join(folder, `${randomUUID()}.tmp`);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(file, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    renameSync(file, target);
  } finally { rmSync(file, { force: true }); }
}

export function readConfig(): WebDavConfig | null {
  const data = read("config.json");
  if (!data) return null;
  const { cipher, ...cfg } = storedSchema.parse(data);
  const bytes = Buffer.from(cipher, "base64");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), bytes.subarray(0, 12));
  decipher.setAAD(aad(cfg));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const password = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
  return { ...configFields.parse({ ...cfg, password }), revision: cfg.revision };
}

export function writeConfig(config: WebDavConfig) {
  const { password, ...cfg } = config;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  cipher.setAAD(aad(cfg));
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  write("config.json", { ...cfg, cipher: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64") });
}

export function removeConfig() {
  rmSync(join(storageDir(), "config.json"), { force: true });
}

export function readState(revision: string): ScheduleState | null {
  const data = read("state.json");
  if (!data) return null;
  const state = scheduleState.parse(data);
  return state.revision === revision ? state : null;
}

export function writeState(state: ScheduleState) {
  write("state.json", state);
}
