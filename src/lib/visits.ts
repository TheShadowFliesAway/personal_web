import type { Client } from "@libsql/client";
export type RecentVisit = { id: string; count: number; lastViewedAt: string };
export async function recentVisits(c: Client): Promise<RecentVisit[]> {
  const result = await c.execute({
    sql: "SELECT document_id, SUM(count) AS count, MAX(last_viewed_at) AS last_viewed_at FROM visits WHERE day>=? GROUP BY document_id ORDER BY count DESC,last_viewed_at DESC,document_id",
    args: [new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)],
  });
  return result.rows.map((r) => ({
    id: String(r.document_id),
    count: Number(r.count),
    lastViewedAt: String(r.last_viewed_at),
  }));
}
export async function recordVisit(c: Client, id: string) {
  const tx = await c.transaction("write");
  try {
    const result = await tx.execute({ sql: "SELECT data FROM documents WHERE id=?", args: [id] });
    if (!result.rows[0] || JSON.parse(String(result.rows[0].data)).deletedAt) {
      await tx.rollback();
      return false;
    }
    const now = new Date().toISOString();
    const previous = await tx.execute({
      sql: "SELECT MAX(last_viewed_at) AS last FROM visits WHERE document_id=?",
      args: [id],
    });
    if (
      !previous.rows[0].last ||
      Date.parse(now) - Date.parse(String(previous.rows[0].last)) >= 1800000
    ) {
      await tx.execute({
        sql: "INSERT INTO visits(document_id,day,count,last_viewed_at) VALUES (?,?,1,?) ON CONFLICT(document_id,day) DO UPDATE SET count=count+1,last_viewed_at=excluded.last_viewed_at",
        args: [id, now.slice(0, 10), now],
      });
    }
    await tx.execute({
      sql: "DELETE FROM visits WHERE day<?",
      args: [new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)],
    });
    await tx.commit();
    return true;
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
