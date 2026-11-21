import "server-only";
import Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type CredentialKind, type McpScope, validScopes } from "./common";

const ACCESS_TTL = 600;
const now = () => Math.floor(Date.now() / 1000);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;
const dummyHash = digest("invalid credential");
function matches(value: string, expected: string) {
  return timingSafeEqual(Buffer.from(digest(value), "hex"), Buffer.from(expected, "hex"));
}

// Separate from the bookmark database: restoring a bookmark backup cannot resurrect revoked credentials.
function store<T>(fn: (db: Database.Database) => T): T {
  const file = resolve(/* turbopackIgnore: true */ process.env.ILIANG_MCP_DB ?? `${process.env.DATABASE_PATH ?? "data/app.db"}.mcp`);
  if (process.env.DATABASE_PATH && resolve(process.env.DATABASE_PATH) === file) throw new Error("MCP storage must be separate");
  mkdirSync(/* turbopackIgnore: true */ dirname(file), { recursive: true, mode: 0o700 });
  const db = new Database(file);
  try {
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 3000");
    db.exec(`CREATE TABLE IF NOT EXISTS mcp_state (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL, epoch INTEGER NOT NULL);
      INSERT OR IGNORE INTO mcp_state VALUES(1, 0, 0);
      CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, label TEXT NOT NULL, kind TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, scopes TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS access_tokens (hash TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES credentials(id) ON DELETE CASCADE, scopes TEXT NOT NULL, expires INTEGER NOT NULL);`);
    return fn(db);
  } finally { db.close(); }
}
function enabled(db: Database.Database) {
  return (db.prepare("SELECT enabled FROM mcp_state WHERE id=1").get() as { enabled: number }).enabled === 1;
}
interface Row { id: string; label: string; kind: CredentialKind; hash: string; scopes: string; created: number; expires: number }
function scopesOf(row: { scopes: string }): McpScope[] {
  const scopes = row.scopes.split(" ");
  return validScopes(scopes) ? scopes : [];
}
export function mcpStatus() {
  return store((db) => ({ enabled: enabled(db), credentials: (db.prepare("SELECT id, label, kind, scopes, created, expires FROM credentials ORDER BY created DESC, id").all() as Omit<Row, "hash">[]).map((row) => ({ ...row, scopes: scopesOf(row) })) }));
}
export function mcpEnabled() { return store(enabled); }
export function setMcpEnabled(on: boolean) {
  store((db) => db.transaction(() => {
    db.prepare("UPDATE mcp_state SET enabled=?, epoch=epoch+1 WHERE id=1").run(on ? 1 : 0);
    if (!on) db.prepare("DELETE FROM access_tokens").run();
  })());
}
export function mintCredential(label: string, kind: CredentialKind, scopes: McpScope[], days: number) {
  return store((db) => db.transaction(() => {
    db.prepare("DELETE FROM credentials WHERE expires<=?").run(now());
    if ((db.prepare("SELECT count(*) AS n FROM credentials").get() as { n: number }).n >= 32) throw new Error("credential limit");
    const id = randomUUID(), value = secret(kind === "oauth" ? "mcp_cs" : "mcp_pat"), created = now();
    db.prepare("INSERT INTO credentials VALUES(?,?,?,?,?,?,?)").run(id,label,kind,digest(value),scopes.join(" "),created,created + days * 86400);
    return { id, value };
  }).immediate());
}
export function revokeCredential(id: string) {
  store((db) => { db.prepare("DELETE FROM credentials WHERE id=?").run(id); });
}
export type Principal = { id: string; scopes: McpScope[] };
export function authenticateBearer(header: string | null): Principal | null {
  const value = /^Bearer (mcp_(?:pat|at)_[A-Za-z0-9_-]{43})$/i.exec(header ?? "")?.[1];
  if (!value) return null;
  return store((db) => {
    if (!enabled(db)) return null;
    const time = now(), hash = digest(value);
    if (value.startsWith("mcp_pat_")) {
      const row = db.prepare("SELECT id, scopes FROM credentials WHERE hash=? AND kind='bearer' AND expires>?").get(hash,time) as { id: string; scopes: string } | undefined;
      return row ? { id: row.id, scopes: scopesOf(row) } : null;
    }
    const row = db.prepare("SELECT c.id, a.scopes FROM access_tokens a JOIN credentials c ON c.id=a.client_id WHERE a.hash=? AND a.expires>? AND c.expires>? AND c.kind='oauth'").get(hash,time,time) as { id: string; scopes: string } | undefined;
    return row ? { id: row.id, scopes: scopesOf(row) } : null;
  });
}
export function exchangeClient(id: string, value: string, requested: string | null) {
  return store((db) => db.transaction(() => {
    if (!enabled(db)) return { error: "temporarily_unavailable" } as const;
    const time = now();
    const client = db.prepare("SELECT * FROM credentials WHERE id=? AND kind='oauth' AND expires>?").get(id,time) as Row | undefined;
    if (!matches(value, client?.hash ?? dummyHash) || !client) return { error: "invalid_client" } as const;
    const authorized = scopesOf(client);
    const scopes = requested === null ? authorized : requested.split(" ");
    if (!validScopes(scopes) || scopes.some((scope) => !authorized.includes(scope))) return { error: "invalid_scope" } as const;
    db.prepare("DELETE FROM access_tokens WHERE expires<=?").run(time);
    if ((db.prepare("SELECT count(*) AS n FROM access_tokens WHERE client_id=?").get(id) as { n: number }).n >= 64) return { error: "temporarily_unavailable" } as const;
    const token = secret("mcp_at");
    const ttl = Math.min(ACCESS_TTL,client.expires-time);
    db.prepare("INSERT INTO access_tokens VALUES(?,?,?,?)").run(digest(token),id,scopes.join(" "),time+ttl);
    return { access_token: token, token_type: "Bearer", expires_in: ttl, scope: scopes.join(" ") } as const;
  }).immediate());
}
