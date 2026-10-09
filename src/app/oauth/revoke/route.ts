import { db } from "@/lib/db";
import { config, digest, oauthJson, readForm, validClient } from "@/lib/mcp/oauth";
export async function POST(request: Request) {
  try {
    config();
  } catch {
    return oauthJson({ error: "temporarily_unavailable" }, 503);
  }
  try {
    const form = await readForm(request);
    if (!validClient(request, form)) return oauthJson({ error: "invalid_client" }, 401);
    const c = await db();
    const token = digest(form.get("token") || "");
    // Invalidate the entire authorization family, including rotated refresh tokens.
    await c.execute({
      sql: "DELETE FROM mcp_credentials WHERE json_extract(data,'$.family') IN (SELECT json_extract(data,'$.family') FROM mcp_credentials WHERE hash=?)",
      args: [token],
    });
    return oauthJson({});
  } catch {
    return oauthJson({ error: "invalid_request" }, 400);
  }
}
