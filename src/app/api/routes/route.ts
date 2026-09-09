import { guard } from "@/lib/auth";
import { ConflictError, db, saveResource } from "@/lib/db";
import { routeSchema } from "@/lib/model";
export async function PUT(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const parsed = routeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  try {
    return Response.json(await saveResource("routes", parsed.data));
  } catch (e) {
    return Response.json(
      { error: e instanceof ConflictError ? e.message : "保存路线失败，请检查节点" },
      { status: e instanceof ConflictError ? 409 : 400 },
    );
  }
}
export async function DELETE(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const { id, revision } = await request.json();
  if (typeof id !== "string" || !Number.isInteger(revision))
    return new Response(null, { status: 400 });
  const c = await db();
  const result = await c.execute({
    sql: "DELETE FROM routes WHERE id=? AND revision=?",
    args: [id, revision],
  });
  return result.rowsAffected
    ? Response.json({ ok: true })
    : Response.json({ error: "路线已更新，请刷新后重试" }, { status: 409 });
}
