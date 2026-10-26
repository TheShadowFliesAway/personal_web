import { z } from "zod";
import { guard } from "@/lib/auth";
import { db, ConflictError } from "@/lib/db";
import { canViewSubmissions } from "@/lib/submissions-access";
import { submissionSchema } from "@/lib/submissions";
export async function GET() {
  if (!(await canViewSubmissions()))
    return Response.json({ error: "请输入查看口令" }, { status: 401 });
  const rows = await (
    await db()
  ).execute("SELECT data FROM submissions ORDER BY updated_at DESC,id");
  return Response.json(
    { submissions: rows.rows.map((r) => JSON.parse(String(r.data))) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function PUT(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const parsed = submissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const tx = await (await db()).transaction("write");
  try {
    const p = parsed.data;
    const previous = (
      await tx.execute({ sql: "SELECT data,revision FROM submissions WHERE id=?", args: [p.id] })
    ).rows[0];
    if (previous ? Number(previous.revision) !== p.revision : p.revision !== 0)
      throw new ConflictError();
    const now = new Date().toISOString();
    const saved = {
      ...p,
      createdAt: previous ? JSON.parse(String(previous.data)).createdAt : now,
      updatedAt: now,
      revision: p.revision + 1,
    };
    await tx.execute({
      sql: "INSERT INTO submissions VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at",
      args: [p.id, JSON.stringify(saved), saved.revision, now],
    });
    await tx.commit();
    return Response.json(saved);
  } catch (e) {
    await tx.rollback();
    return Response.json(
      {
        error:
          e instanceof ConflictError
            ? "记录已被修改，请保留当前输入，关闭编辑并刷新后重试。"
            : "保存失败，请稍后重试",
      },
      { status: e instanceof ConflictError ? 409 : 500 },
    );
  } finally {
    tx.close();
  }
}
export async function DELETE(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const parsed = z
    .object({ id: z.uuid(), revision: z.number().int().positive() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "无效的删除请求" }, { status: 400 });
  const result = await (
    await db()
  ).execute({
    sql: "DELETE FROM submissions WHERE id=? AND revision=?",
    args: [parsed.data.id, parsed.data.revision],
  });
  if (!result.rowsAffected)
    return Response.json({ error: "记录已变化，请刷新后重试" }, { status: 409 });
  return Response.json({ ok: true });
}
