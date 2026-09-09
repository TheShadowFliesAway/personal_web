import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { z } from "zod";
import { documentSchema, routeSchema } from "../src/lib/model";
import { homeCopySchema, defaultHomeCopy } from "../src/lib/home-copy";
import { initialize } from "../src/lib/db";

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* CI may provide environment variables directly. */
  }
  process.env.DEMO_MODE = "false";
  const file = process.argv[2];
  if (!file) throw new Error("用法：npm run backup:restore -- /path/to/papertrail-backup.json");
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN)
    throw new Error("请在环境变量中配置用于恢复的空 Turso 数据库");
  const backup = z
    .object({
      format: z.literal("papertrail-v1"),
      homeCopy: homeCopySchema.default(defaultHomeCopy),
      documents: z.array(documentSchema),
      routes: z.array(routeSchema),
      folders: z.array(z.string().max(200)),
      tagLibrary: z.array(z.string().max(50)).default([]),
      imageManifest: z
        .array(
          z.object({
            id: z.string().regex(/^[a-f0-9-]{36}$/),
            size: z.number().int().nonnegative(),
            created_at: z.string(),
          }),
        )
        .default([]),
      versions: z
        .array(
          z.object({ documentId: z.string(), document: documentSchema, createdAt: z.string() }),
        )
        .default([]),
    })
    .parse(JSON.parse(await readFile(file, "utf8")));
  const ids = new Set(backup.documents.map((d) => d.id));
  if (
    ids.size !== backup.documents.length ||
    new Set(backup.routes.map((r) => r.id)).size !== backup.routes.length
  )
    throw new Error("备份包含重复 ID");
  for (const r of backup.routes)
    for (const node of r.nodes)
      if (!backup.documents.some((d) => d.id === node.paperId && d.kind === "paper"))
        throw new Error("备份路线引用了不存在的论文");
  const c = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  try {
    await initialize(c);
    const tx = await c.transaction("write");
    try {
      const count = await tx.execute(
        "SELECT (SELECT COUNT(*) FROM documents)+(SELECT COUNT(*) FROM routes)+(SELECT COUNT(*) FROM images)+(SELECT COUNT(*) FROM versions) AS count",
      );
      if (Number(count.rows[0].count))
        throw new Error("目标数据库不是空的。为避免覆盖，恢复已停止。");
      await tx.batch([
        {
          sql: "INSERT INTO settings(key,value) VALUES ('home-copy',?)",
          args: [JSON.stringify(backup.homeCopy)],
        },
        ...backup.documents.map((d) => ({
          sql: "INSERT INTO documents VALUES (?,?,?,?)",
          args: [d.id, JSON.stringify(d), d.revision, d.updatedAt],
        })),
        ...backup.routes.map((r) => ({
          sql: "INSERT INTO routes VALUES (?,?,?,?)",
          args: [r.id, JSON.stringify(r), r.revision, r.updatedAt],
        })),
        ...backup.tagLibrary.map((name) => ({
          sql: "INSERT OR IGNORE INTO tags(name) VALUES (?)",
          args: [name],
        })),
        ...backup.folders.map((f) => ({
          sql: "INSERT OR IGNORE INTO folders VALUES (?)",
          args: [f],
        })),
        ...backup.imageManifest.map((i) => ({
          sql: "INSERT INTO images VALUES (?,?,?)",
          args: [i.id, i.size, i.created_at],
        })),
        ...backup.versions.map((v) => ({
          sql: "INSERT INTO versions(document_id,data,created_at) VALUES (?,?,?)",
          args: [v.documentId, JSON.stringify(v.document), v.createdAt],
        })),
      ]);
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    } finally {
      tx.close();
    }
    console.log(
      `恢复完成：${backup.documents.length} 篇内容，${backup.routes.length} 条路线。图片文件请单独恢复到 R2 原路径。`,
    );
  } finally {
    c.close();
  }
}
main().catch((e) => {
  console.error(e instanceof z.ZodError ? "备份格式验证失败" : (e as Error).message);
  process.exitCode = 1;
});
