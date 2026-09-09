import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { homeCopySchema } from "@/lib/home-copy";

export async function PUT(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const parsed = homeCopySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "请填写主标题，并检查文案长度" }, { status: 400 });
  try {
    const c = await db();
    await c.execute({
      sql: "INSERT INTO settings(key,value) VALUES ('home-copy',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      args: [JSON.stringify(parsed.data)],
    });
    return Response.json(parsed.data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
