import { cookies } from "next/headers";
import { sameOrigin, signSession } from "@/lib/auth";
import { isConfigured } from "@/lib/db";
import { SUBMISSIONS_COOKIE, submissionsSecret } from "@/lib/submissions-access";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!isConfigured()) return Response.json({ error: "网站尚未配置" }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (body?.code !== "zjx") return Response.json({ error: "查看口令不正确" }, { status: 401 });
  (await cookies()).set(
    SUBMISSIONS_COOKIE,
    signSession(submissionsSecret(), Date.now() + 86400_000),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 86400,
    },
  );
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  (await cookies()).delete(SUBMISSIONS_COOKIE);
  return Response.json({ ok: true });
}
