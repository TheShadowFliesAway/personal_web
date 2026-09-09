import { cookies } from "next/headers";
import { checkPassword, COOKIE, signSession, sameOrigin } from "@/lib/auth";
import { db, isConfigured, isDemo } from "@/lib/db";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!isConfigured()) return Response.json({ error: "请先完成云端配置" }, { status: 503 });
  const { password } = await request.json().catch(() => ({}));
  if (typeof password !== "string" || password.length > 200)
    return Response.json({ error: "请输入密码" }, { status: 400 });
  const c = await db();
  const now = Date.now();
  // A durable single-account limit works across serverless instances, without trusting proxy headers.
  const attempts = await c.execute({
    sql: "INSERT INTO login_attempts(key,count,expires) VALUES ('admin',1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING count",
    args: [now + 15 * 60000, now, now],
  });
  if (Number(attempts.rows[0].count) > 10)
    return Response.json({ error: "尝试次数过多，请 15 分钟后再试" }, { status: 429 });
  if (!isDemo() && !checkPassword(password, process.env.ADMIN_PASSWORD_HASH!))
    return Response.json({ error: "密码不正确" }, { status: 401 });
  await c.execute("DELETE FROM login_attempts WHERE key='admin'");
  (await cookies()).set(COOKIE, signSession(process.env.SESSION_SECRET || "development-only"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 86400,
  });
  return Response.json({ ok: true });
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  (await cookies()).delete(COOKIE);
  return Response.json({ ok: true });
}
