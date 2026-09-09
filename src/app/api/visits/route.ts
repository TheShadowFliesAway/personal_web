import { z } from "zod";
import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { recentVisits, recordVisit } from "@/lib/visits";
export async function POST(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const parsed = z
    .object({ id: z.string().min(1).max(100) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "无效笔记" }, { status: 400 });
  try {
    const c = await db();
    if (!(await recordVisit(c, parsed.data.id)))
      return Response.json({ error: "笔记不存在或已删除" }, { status: 404 });
    return Response.json(await recentVisits(c), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "访问记录暂时无法保存" }, { status: 500 });
  }
}
