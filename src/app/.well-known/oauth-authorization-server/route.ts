import { config, oauthJson, scopes } from "@/lib/mcp/oauth";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    const { origin } = config();
    return oauthJson({
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      revocation_endpoint: `${origin}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: scopes,
    });
  } catch {
    return oauthJson({ error: "MCP 未启用或配置不完整" }, 503);
  }
}
