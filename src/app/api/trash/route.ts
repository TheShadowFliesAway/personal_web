import { z } from "zod";
import { guard } from "@/lib/auth";
import { db, ConflictError } from "@/lib/db";
import { emptyTrash } from "@/lib/trash";
export async function DELETE(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const parsed = z
    .object({
      documents: z
        .array(
          z.object({ id: z.string().min(1).max(100), revision: z.number().int().nonnegative() }),
        )
        .min(1)
        .max(10000),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "请先确认要清空的回收站内容" }, { status: 400 });
  try {
    return Response.json(await emptyTrash(await db(), parsed.data.documents));
  } catch (e) {
    return Response.json(
      { error: e instanceof ConflictError ? e.message : "清空失败，请稍后重试" },
      { status: e instanceof ConflictError ? 409 : 500 },
    );
  }
}
