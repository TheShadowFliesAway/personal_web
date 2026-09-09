import type { Client } from "@libsql/client";
import type { Document } from "./model";

export const UNCATEGORIZED = "未分类";
export function withinFolder(path: string, parent: string) {
  return path === parent || path.startsWith(`${parent}/`);
}
export function folderTree(paths: string[]) {
  return [
    ...new Set(
      paths.flatMap((path) => {
        const parts = path.split("/");
        return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
      }),
    ),
  ].sort();
}

export async function deleteFolder(client: Client, name: string) {
  if (!name.trim() || name.length > 200 || name === UNCATEGORIZED) {
    throw new Error("不能删除未分类或无效主题");
  }
  const tx = await client.transaction("write");
  try {
    const folders = (await tx.execute("SELECT name FROM folders ORDER BY name")).rows.map((r) =>
      String(r.name),
    );
    const removed = folders.filter((f) => withinFolder(f, name));
    const docs = (await tx.execute("SELECT data FROM documents")).rows.map(
      (r) => JSON.parse(String(r.data)) as Document,
    );
    // Include archived notes, so restoring one later does not resurrect a deleted topic.
    const affected = docs.filter((d) => d.kind === "note" && withinFolder(d.folder, name));
    const updatedAt = new Date().toISOString();
    const documents = affected.map((d) => ({
      ...d,
      folder: UNCATEGORIZED,
      revision: d.revision + 1,
      updatedAt,
    }));
    for (let i = 0; i < documents.length; i++) {
      const d = documents[i];
      await tx.execute({
        sql: "INSERT INTO versions(document_id,data,created_at) VALUES (?,?,?)",
        args: [d.id, JSON.stringify(affected[i]), updatedAt],
      });
      await tx.execute({
        sql: "DELETE FROM versions WHERE document_id=? AND id NOT IN (SELECT id FROM versions WHERE document_id=? ORDER BY id DESC LIMIT 20)",
        args: [d.id, d.id],
      });
      await tx.execute({
        sql: "UPDATE documents SET data=?,revision=?,updated_at=? WHERE id=?",
        args: [JSON.stringify(d), d.revision, d.updatedAt, d.id],
      });
    }
    // Compare path segments rather than SQL LIKE: '%' and '_' are valid topic text.
    for (const folder of removed)
      await tx.execute({ sql: "DELETE FROM folders WHERE name=?", args: [folder] });
    if (documents.length)
      await tx.execute({ sql: "INSERT OR IGNORE INTO folders VALUES (?)", args: [UNCATEGORIZED] });
    const remaining = (await tx.execute("SELECT name FROM folders ORDER BY name")).rows.map((r) =>
      String(r.name),
    );
    await tx.commit();
    return { documents, folders: remaining, movedCount: documents.length };
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
