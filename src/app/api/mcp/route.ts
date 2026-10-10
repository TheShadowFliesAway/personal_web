import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { accessGrant, challenge, discoveryConfig, oauthJson } from "@/lib/mcp/oauth";
import { createMcpServer } from "@/lib/mcp/tools";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  let c;
  try {
    c = discoveryConfig();
  } catch {
    return oauthJson({ error: "MCP 未启用或配置不完整" }, 503);
  }
  // Browsers must be same-origin; server-to-server MCP clients send no Origin.
  const origin = request.headers.get("origin");
  if (origin && origin !== c.origin) return oauthJson({ error: "请求来源无效" }, 403);
  const grant = await accessGrant(request);
  if (request.headers.has("authorization") && !grant)
    return new Response(null, {
      status: 401,
      headers: { "WWW-Authenticate": challenge(), "Cache-Control": "no-store" },
    });
  const server = createMcpServer(grant);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 2 * 1024 * 1024,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } finally {
    await server.close();
  }
}
export async function GET(request: Request) {
  try {
    discoveryConfig();
    if (await accessGrant(request))
      return new Response(null, {
        status: 405,
        headers: { Allow: "POST", "Cache-Control": "no-store" },
      });
    return new Response(null, {
      status: 401,
      headers: { "WWW-Authenticate": challenge(), "Cache-Control": "no-store" },
    });
  } catch {
    return oauthJson({ error: "MCP 未启用" }, 503);
  }
}
export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
