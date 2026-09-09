import { guard } from "@/lib/auth";
import { ConflictError, saveResource } from "@/lib/db";
import { documentSchema } from "@/lib/model";
export async function PUT(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const parsed = documentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  try {
    return Response.json(await saveResource("documents", parsed.data));
  } catch (e) {
    return Response.json(
      { error: e instanceof ConflictError ? e.message : "保存失败，请稍后重试" },
      { status: e instanceof ConflictError ? 409 : 500 },
    );
  }
}
