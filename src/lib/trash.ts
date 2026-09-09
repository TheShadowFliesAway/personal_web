import type { Client } from "@libsql/client";
import { ConflictError } from "./db";
import type { Document, ResearchRoute } from "./model";

export async function emptyTrash(c: Client, expected: { id: string; revision: number }[]) {
  const tx = await c.transaction("write");
  try {
    const docs = (await tx.execute("SELECT data FROM documents")).rows.map(
      (r) => JSON.parse(String(r.data)) as Document,
    );
    const trash = docs.filter((d) => d.deletedAt);
    if (
      trash.length !== expected.length ||
      new Set(expected.map((d) => d.id)).size !== expected.length ||
      trash.some((d) => !expected.some((e) => e.id === d.id && e.revision === d.revision))
    )
      throw new ConflictError("回收站内容已变化，请刷新后重新确认。");
    const ids = new Set(trash.map((d) => d.id));
    const updatedAt = new Date().toISOString();
    const documents: Document[] = [];
    const routes: ResearchRoute[] = [];
    for (const d of docs.filter((d) => !ids.has(d.id) && d.relatedIds.some((id) => ids.has(id)))) {
      const updated = {
        ...d,
        relatedIds: d.relatedIds.filter((id) => !ids.has(id)),
        revision: d.revision + 1,
        updatedAt,
      };
      await tx.execute({
        sql: "UPDATE documents SET data=?,revision=?,updated_at=? WHERE id=?",
        args: [JSON.stringify(updated), updated.revision, updatedAt, d.id],
      });
      documents.push(updated);
    }
    for (const row of (await tx.execute("SELECT data FROM routes")).rows) {
      const r = JSON.parse(String(row.data)) as ResearchRoute;
      const nodes = r.nodes.filter((n) => !ids.has(n.paperId));
      if (nodes.length === r.nodes.length) continue;
      const nodeIds = new Set(nodes.map((n) => n.id));
      const updated = {
        ...r,
        nodes,
        edges: r.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)),
        revision: r.revision + 1,
        updatedAt,
      };
      await tx.execute({
        sql: "UPDATE routes SET data=?,revision=?,updated_at=? WHERE id=?",
        args: [JSON.stringify(updated), updated.revision, updatedAt, r.id],
      });
      routes.push(updated);
    }
    // Surviving snapshots must not restore links to permanently deleted documents.
    for (const row of (await tx.execute("SELECT id,document_id,data FROM versions")).rows) {
      if (ids.has(String(row.document_id))) continue;
      const d = JSON.parse(String(row.data)) as Document;
      if (d.relatedIds.some((id) => ids.has(id)))
        await tx.execute({
          sql: "UPDATE versions SET data=? WHERE id=?",
          args: [
            JSON.stringify({ ...d, relatedIds: d.relatedIds.filter((id) => !ids.has(id)) }),
            row.id,
          ],
        });
    }
    for (const d of trash) {
      for (const tag of d.tags)
        await tx.execute({ sql: "INSERT OR IGNORE INTO tags(name) VALUES (?)", args: [tag] });
      await tx.execute({ sql: "DELETE FROM versions WHERE document_id=?", args: [d.id] });
      await tx.execute({ sql: "DELETE FROM visits WHERE document_id=?", args: [d.id] });
      await tx.execute({ sql: "DELETE FROM documents WHERE id=?", args: [d.id] });
    }
    await tx.commit();
    return { deletedIds: [...ids], documents, routes };
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
