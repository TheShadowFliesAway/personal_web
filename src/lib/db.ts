import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { defaultHomeCopy, homeCopySchema, type HomeCopy } from "./home-copy";
import { demoWorkspace } from "./seed";
import type { Document, ResearchRoute, Workspace } from "./model";

export function isDemo() {
  return process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true";
}
export function isConfigured() {
  return (
    isDemo() ||
    Boolean(
      process.env.TURSO_DATABASE_URL &&
      process.env.TURSO_AUTH_TOKEN &&
      process.env.ADMIN_PASSWORD_HASH &&
      (process.env.SESSION_SECRET?.length ?? 0) >= 32,
    )
  );
}
let client: Client | undefined;
let ready: Promise<void> | undefined;
export async function db() {
  if (!isConfigured()) throw new Error("云端连接尚未配置");
  if (!client) {
    if (isDemo()) mkdirSync(".data", { recursive: true });
    client = createClient({
      url: isDemo() ? "file:.data/demo.db" : process.env.TURSO_DATABASE_URL!,
      authToken: isDemo() ? undefined : process.env.TURSO_AUTH_TOKEN,
    });
  }
  if (!ready)
    ready = initialize(client).catch((e) => {
      ready = undefined;
      throw e;
    });
  await ready;
  return client;
}
export async function initialize(c: Client) {
  await c.batch(
    [
      "CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS routes (id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS versions (id INTEGER PRIMARY KEY AUTOINCREMENT, document_id TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS versions_document ON versions(document_id, id DESC)",
      "CREATE TABLE IF NOT EXISTS folders (name TEXT PRIMARY KEY)",
      "CREATE TABLE IF NOT EXISTS tags (name TEXT PRIMARY KEY)",
      "CREATE TABLE IF NOT EXISTS visits (document_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, last_viewed_at TEXT NOT NULL, PRIMARY KEY(document_id,day))",
      "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)",
      "CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, size INTEGER NOT NULL, created_at TEXT NOT NULL)",
    ],
    "write",
  );
  if (isDemo()) {
    const exists = await c.execute("SELECT value FROM settings WHERE key='seeded'");
    if (!exists.rows.length) {
      const seed = demoWorkspace();
      await c.batch(
        [
          ...seed.documents.map((d) => ({
            sql: "INSERT OR IGNORE INTO documents VALUES (?, ?, ?, ?)",
            args: [d.id, JSON.stringify(d), d.revision, d.updatedAt],
          })),
          ...seed.routes.map((r) => ({
            sql: "INSERT OR IGNORE INTO routes VALUES (?, ?, ?, ?)",
            args: [r.id, JSON.stringify(r), r.revision, r.updatedAt],
          })),
          ...seed.folders.map((f) => ({
            sql: "INSERT OR IGNORE INTO folders VALUES (?)",
            args: [f],
          })),
          "INSERT OR IGNORE INTO settings VALUES ('seeded', '1')",
        ],
        "write",
      );
    }
  }
}
export async function workspace(): Promise<
  Workspace & { homeCopy: HomeCopy; tagLibrary: string[] }
> {
  const c = await db();
  const [docs, routes, folders, settings, tags] = await c.batch(
    [
      "SELECT data FROM documents ORDER BY updated_at DESC",
      "SELECT data FROM routes ORDER BY updated_at DESC",
      "SELECT name FROM folders ORDER BY name",
      "SELECT value FROM settings WHERE key='home-copy'",
      "SELECT name FROM tags ORDER BY name",
    ],
    "read",
  );
  return {
    tagLibrary: [
      ...new Set([
        ...tags.rows.map((r) => String(r.name)),
        ...docs.rows.flatMap((r) => JSON.parse(String(r.data)).tags as string[]),
      ]),
    ].sort(),
    homeCopy: settings.rows[0]
      ? homeCopySchema.parse(JSON.parse(String(settings.rows[0].value)))
      : defaultHomeCopy,
    documents: docs.rows.map((r) => JSON.parse(String(r.data))),
    routes: routes.rows.map((r) => JSON.parse(String(r.data))),
    folders: folders.rows.map((r) => String(r.name)),
  };
}
export class ConflictError extends Error {}
export async function saveResource(table: "documents" | "routes", value: Document | ResearchRoute) {
  const c = await db();
  const tx = await c.transaction("write");
  try {
    const old = await tx.execute({
      sql: `SELECT data, revision FROM ${table} WHERE id=?`,
      args: [value.id],
    });
    const previous = old.rows[0];
    if (previous ? Number(previous.revision) !== value.revision : value.revision !== 0)
      throw new ConflictError("这份内容已在其他页面更新。请先导出当前内容，再刷新获取最新版本。");
    if (table === "routes") {
      for (const node of (value as ResearchRoute).nodes) {
        const d = await tx.execute({
          sql: "SELECT data FROM documents WHERE id=?",
          args: [node.paperId],
        });
        if (!d.rows[0] || JSON.parse(String(d.rows[0].data)).kind !== "paper")
          throw new Error("路线只能引用已有论文");
      }
    }
    const updated = { ...value, revision: value.revision + 1, updatedAt: new Date().toISOString() };
    if (table === "documents") {
      const tags = new Set([
        ...(value as Document).tags,
        ...(previous ? JSON.parse(String(previous.data)).tags : []),
      ]);
      for (const tag of tags)
        await tx.execute({
          sql: "INSERT OR IGNORE INTO tags(name) VALUES (?)",
          args: [String(tag)],
        });
    }
    if (table === "documents" && previous) {
      // Keep meaningful snapshots, coalescing continuous autosaves to one per 5 minutes.
      const last = await tx.execute({
        sql: "SELECT created_at FROM versions WHERE document_id=? ORDER BY id DESC LIMIT 1",
        args: [value.id],
      });
      if (
        !last.rows[0] ||
        Date.now() - Date.parse(String(last.rows[0].created_at)) > 300_000 ||
        (value as Document).deletedAt
      ) {
        await tx.execute({
          sql: "INSERT INTO versions(document_id,data,created_at) VALUES (?,?,?)",
          args: [value.id, String(previous.data), updated.updatedAt],
        });
        await tx.execute({
          sql: "DELETE FROM versions WHERE document_id=? AND id NOT IN (SELECT id FROM versions WHERE document_id=? ORDER BY id DESC LIMIT 20)",
          args: [value.id, value.id],
        });
      }
    }
    await tx.execute({
      sql: `INSERT INTO ${table}(id,data,revision,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at`,
      args: [updated.id, JSON.stringify(updated), updated.revision, updated.updatedAt],
    });
    if (table === "documents" && (value as Document).kind === "note" && (value as Document).folder)
      await tx.execute({
        sql: "INSERT OR IGNORE INTO folders VALUES (?)",
        args: [(value as Document).folder],
      });
    await tx.commit();
    return updated;
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
