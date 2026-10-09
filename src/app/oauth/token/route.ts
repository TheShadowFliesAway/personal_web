import { config, exchangeToken, oauthJson, readForm, validClient } from "@/lib/mcp/oauth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    config();
  } catch {
    return oauthJson({ error: "temporarily_unavailable" }, 503);
  }
  try {
    const form = await readForm(request);
    if (!validClient(request, form)) return oauthJson({ error: "invalid_client" }, 401);
    return oauthJson(await exchangeToken(form));
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    const known = [
      "invalid_request",
      "invalid_grant",
      "invalid_scope",
      "invalid_target",
      "unsupported_grant_type",
    ];
    return oauthJson(
      { error: known.includes(message) ? message : "server_error" },
      known.includes(message) ? 400 : 500,
    );
  }
}
