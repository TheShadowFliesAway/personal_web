import { db } from "@/lib/db";
import { config, digest, oauthJson, ownerSession, randomToken, readForm } from "@/lib/mcp/oauth";
export async function POST(request: Request) {
  let c;
  try {
    c = config();
  } catch {
    return oauthJson({ error: "MCP 未启用" }, 503);
  }
  const session = await ownerSession();
  if (!session || request.headers.get("origin") !== c.origin)
    return oauthJson({ error: "请重新登录并授权" }, 403);
  let form;
  try {
    form = await readForm(request);
  } catch {
    return oauthJson({ error: "无效请求" }, 400);
  }
  const tx = await (await db()).transaction("write");
  try {
    const result = await tx.execute({
      sql: "SELECT data FROM mcp_credentials WHERE hash=? AND kind='consent' AND expires>?",
      args: [digest(form.get("ticket") || ""), Date.now()],
    });
    if (!result.rows[0]) throw new Error("授权请求已失效");
    const { grant, session: bound } = JSON.parse(String(result.rows[0].data));
    if (
      bound !== digest(session) ||
      grant.clientId !== c.clientId ||
      grant.resource !== c.resource ||
      !c.redirects.includes(grant.redirect)
    )
      throw new Error("授权请求已失效");
    await tx.execute({
      sql: "DELETE FROM mcp_credentials WHERE hash=?",
      args: [digest(form.get("ticket") || "")],
    });
    const redirect = new URL(grant.redirect);
    if (form.get("decision") === "allow") {
      const code = randomToken();
      await tx.execute({
        sql: "INSERT INTO mcp_credentials VALUES (?,?,?,?)",
        args: [
          digest(code),
          "code",
          JSON.stringify({ ...grant, family: randomToken() }),
          Date.now() + 300_000,
        ],
      });
      redirect.searchParams.set("code", code);
    } else redirect.searchParams.set("error", "access_denied");
    if (grant.state) redirect.searchParams.set("state", grant.state);
    await tx.commit();
    return new Response(null, {
      status: 303,
      headers: {
        Location: redirect.toString(),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    await tx.rollback();
    return oauthJson({ error: "授权请求已失效，请从 ChatGPT 重新连接" }, 400);
  } finally {
    tx.close();
  }
}
