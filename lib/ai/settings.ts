import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { providerSchema, type Provider } from "./provider";

function storagePath() {
  const custom = process.env.ILIANG_AI_SETTINGS_PATH;
  if (custom) {
    if (!isAbsolute(custom)) throw new Error("AI settings path must be absolute");
    return custom;
  }
  const instance = createHash("sha256").update(resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH ?? "data/app.db")).digest("hex").slice(0, 24);
  return join(homedir(), ".iliang-nav", `ai-provider-${instance}.json`);
}

function secretKey() {
  const secret = process.env.ILIANG_AI_SETTINGS_SECRET ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AI settings encryption key unavailable");
  return createHash("sha256").update("iliang-nav/provider-store/v1\0").update(secret).digest();
}

function encrypt(key: string, endpoint: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  cipher.setAAD(Buffer.from(endpoint));
  const ciphertext = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

function decrypt(payload: string, endpoint: string) {
  const buf = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), buf.subarray(0, 12));
  decipher.setAAD(Buffer.from(endpoint));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export function readProvider(): Provider | null {
  let raw: string;
  try { raw = readFileSync(/* turbopackIgnore: true */ storagePath(), "utf8"); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  const stored = JSON.parse(raw);
  return providerSchema.parse({ ...stored, key: decrypt(stored.ciphertext, stored.endpoint) });
}

/** The file lives outside SQLite, app source, and application backup/export by default. */
export function saveProvider(provider: Provider) {
  const file = storagePath();
  const temp = `${file}.${randomUUID()}.tmp`;
  const { endpoint, model, key } = provider;
  const encrypted = encrypt(key, endpoint);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(temp, JSON.stringify({ endpoint, model, ciphertext: encrypted }), { flag: "wx", mode: 0o600 });
    renameSync(temp, file);
  } finally { rmSync(temp, { force: true }); }
}

export function removeProvider() {
  rmSync(storagePath(), { force: true });
}
