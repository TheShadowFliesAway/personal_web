import { z } from "zod";
import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
const schema = z.object({ name: z.string().trim().min(1).max(50) });

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const c = await db();
  const [tags, docs] = await c.batch(
    ["SELECT name FROM tags", "SELECT data FROM documents"],
    "read",
  );
  const counts = new Map<string, number>(tags.rows.map((r) => [String(r.name), 0]));
  for (const row of docs.rows) {
    for (const tag of new Set<string>(JSON.parse(String(row.data)).tags))
      counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return Response.json(
    [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "标签名称需为 1–50 个字符" }, { status: 400 });
  const c = await db();
  await c.execute({ sql: "INSERT OR IGNORE INTO tags(name) VALUES (?)", args: [parsed.data.name] });
  return Response.json(parsed.data);
}
export async function DELETE(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "无效标签" }, { status: 400 });
  const c = await db();
  const tx = await c.transaction("write");
  try {
    const docs = await tx.execute("SELECT data FROM documents");
    if (docs.rows.some((r) => JSON.parse(String(r.data)).tags.includes(parsed.data.name))) {
      await tx.rollback();
      return Response.json(
        { error: "此标签仍被笔记使用（包含回收站），请先从笔记中移除。" },
        { status: 409 },
      );
    }
    await tx.execute({ sql: "DELETE FROM tags WHERE name=?", args: [parsed.data.name] });
    await tx.commit();
    return Response.json({ ok: true });
  } catch {
    await tx.rollback();
    return Response.json({ error: "删除失败，请重试" }, { status: 500 });
  } finally {
    tx.close();
  }
}
