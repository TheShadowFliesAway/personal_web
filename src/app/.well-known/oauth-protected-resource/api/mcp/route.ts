import { discoveryConfig, oauthJson, scopes } from "@/lib/mcp/oauth";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    const { origin, resource } = discoveryConfig();
    return oauthJson({
      resource,
      authorization_servers: [origin],
      scopes_supported: scopes,
      bearer_methods_supported: ["header"],
      resource_name: "Papertrail 私人笔记",
    });
  } catch {
    return oauthJson({ error: "MCP 未启用或配置不完整" }, 503);
  }
}
