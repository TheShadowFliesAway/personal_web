import { ownerSession, oauthJson } from "@/lib/mcp/oauth";
import { sameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
export async function POST(request: Request) {
  if (!(await ownerSession()) || !sameOrigin(request)) return oauthJson({ error: "请先登录" }, 403);
  await (await db()).execute("DELETE FROM mcp_credentials");
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL("/connections?revoked=1", request.url).toString(),
      "Cache-Control": "no-store",
    },
  });
}
