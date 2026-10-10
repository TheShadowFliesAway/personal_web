import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { COOKIE, verifySession } from "../auth";
import { db, isConfigured, isDemo } from "../db";

export const scopes = ["notes:read", "notes:write"];
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export function discoveryConfig() {
  if (process.env.MCP_ENABLED !== "true")
    throw new Error("MCP_ENABLED：需要设置为 true（不带引号或空格），并重新部署 Production。");
  if (!isConfigured() || isDemo())
    throw new Error("网站基础配置未完成，或正在使用演示模式；请先完成正式环境配置。");
  if (!process.env.MCP_ORIGIN?.trim())
    throw new Error("MCP_ORIGIN：尚未填写网站的固定 HTTPS 域名。");
  let originUrl: URL;
  try {
    originUrl = new URL(process.env.MCP_ORIGIN);
  } catch {
    throw new Error("MCP_ORIGIN：不是有效的网址，请包含 https://。");
  }
  if (
    originUrl.pathname !== "/" ||
    originUrl.search ||
    originUrl.hash ||
    originUrl.username ||
    originUrl.password
  )
    throw new Error("MCP_ORIGIN：只填写网站域名，不要带 /api/mcp、查询参数或登录信息。");
  const origin = originUrl.origin;
  if (!origin.startsWith("https://") && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))
    throw new Error("MCP_ORIGIN：必须使用 HTTPS。");
  return { origin, resource: `${origin}/api/mcp` };
}
// OAuth discovery must work before the client's exact callback is known.
// Issuing/accepting credentials still requires the complete private configuration.
export function config() {
  const { origin, resource } = discoveryConfig();
  const clientId = process.env.MCP_CLIENT_ID || "";
  const secret = process.env.MCP_CLIENT_SECRET || "";
  const redirects = (process.env.MCP_REDIRECT_URIS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const missing = [
    ...(!clientId.trim() ? ["MCP_CLIENT_ID"] : []),
    ...(!secret ? ["MCP_CLIENT_SECRET"] : []),
    ...(!redirects.length ? ["MCP_REDIRECT_URIS"] : []),
  ];
  if (missing.length)
    throw new Error(`缺少环境变量：${missing.join("、")}。保存到 Production 后需要重新部署。`);
  if (secret.length < 32)
    throw new Error("MCP_CLIENT_SECRET：长度不足 32 个字符，请使用 mcp:setup 生成的完整密钥。");
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET：尚未配置网站会话密钥。");
  for (const redirect of redirects) {
    let url: URL;
    try {
      url = new URL(redirect);
    } catch {
      throw new Error(
        "MCP_REDIRECT_URIS：包含无效网址，请填写 ChatGPT 提供的完整 OAuth 回调地址。",
      );
    }
    if (url.protocol !== "https:" || url.hash || url.username || url.password)
      throw new Error("MCP_REDIRECT_URIS：回调地址必须使用 HTTPS，且不能带片段或登录信息。");
  }
  return { origin, resource, clientId, secret, redirects };
}

export async function ownerSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  return token && process.env.SESSION_SECRET && verifySession(token, process.env.SESSION_SECRET)
    ? token
    : null;
}
export function challenge(scope = "notes:read") {
  return `Bearer resource_metadata="${discoveryConfig().origin}/.well-known/oauth-protected-resource/api/mcp", scope="${scope}"`;
}
export function oauthJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}
export async function readForm(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
    throw new Error("invalid_request");
  // Bound actual bytes as well as Content-Length (which may be absent).
  const reader = request.body?.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 16384) {
        await reader.cancel();
        throw new Error("invalid_request");
      }
      chunks.push(value);
    }
  const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  for (const key of form.keys())
    if (form.getAll(key).length !== 1) throw new Error("invalid_request");
  return form;
}
export function validateAuthorization(params: URLSearchParams) {
  const c = config();
  for (const key of params.keys())
    if (params.getAll(key).length !== 1) throw new Error("重复的授权参数");
  const requested = (params.get("scope") || scopes.join(" ")).split(" ").filter(Boolean);
  const redirect = params.get("redirect_uri") || "";
  if (params.get("client_id") !== c.clientId || !c.redirects.includes(redirect))
    throw new Error("客户端或回调地址未配置");
  if (
    params.get("response_type") !== "code" ||
    params.get("code_challenge_method") !== "S256" ||
    !/^[A-Za-z0-9_-]{43}$/.test(params.get("code_challenge") || "")
  )
    throw new Error("需要 PKCE S256 授权");
  if (params.get("resource") !== c.resource) throw new Error("授权资源地址不匹配");
  if (!requested.length || requested.some((s) => !scopes.includes(s)))
    throw new Error("无效的授权范围");
  if ((params.get("state")?.length || 0) > 2048) throw new Error("state 过长");
  return {
    clientId: c.clientId,
    redirect,
    challenge: params.get("code_challenge")!,
    scope: [...new Set(requested)].join(" "),
    resource: c.resource,
    state: params.get("state") || "",
  };
}
export type Grant = ReturnType<typeof validateAuthorization> & { family: string };
export async function storeCredential(kind: string, data: unknown, ttl: number) {
  const token = randomToken();
  const c = await db();
  await c.execute({ sql: "DELETE FROM mcp_credentials WHERE expires<?", args: [Date.now()] });
  await c.execute({
    sql: "INSERT INTO mcp_credentials VALUES (?,?,?,?)",
    args: [digest(token), kind, JSON.stringify(data), Date.now() + ttl],
  });
  return token;
}
export async function accessGrant(request: Request): Promise<Grant | null> {
  let c: ReturnType<typeof config>;
  try {
    c = config();
  } catch {
    return null;
  }
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i)?.[1];
  if (!token) return null;
  const result = await (
    await db()
  ).execute({
    sql: "SELECT data FROM mcp_credentials WHERE hash=? AND kind='access' AND expires>?",
    args: [digest(token), Date.now()],
  });
  if (!result.rows[0]) return null;
  const grant = JSON.parse(String(result.rows[0].data)) as Grant;
  return grant.resource === c.resource && grant.clientId === c.clientId ? grant : null;
}
export function validClient(request: Request, form: URLSearchParams) {
  const c = config();
  let id = form.get("client_id") || "",
    secret = form.get("client_secret") || "";
  const auth = request.headers.get("authorization");
  if (auth) {
    if (!auth.startsWith("Basic ") || form.has("client_secret")) return false;
    const decoded = Buffer.from(auth.slice(6), "base64").toString();
    const colon = decoded.indexOf(":");
    if (colon < 0) return false;
    try {
      id = decodeURIComponent(decoded.slice(0, colon));
      secret = decodeURIComponent(decoded.slice(colon + 1));
    } catch {
      return false;
    }
  }
  return (
    id === c.clientId && timingSafeEqual(Buffer.from(digest(secret)), Buffer.from(digest(c.secret)))
  );
}
export async function exchangeToken(form: URLSearchParams) {
  const c = config(),
    now = Date.now();
  const type = form.get("grant_type");
  if (type !== "authorization_code" && type !== "refresh_token")
    throw new Error("unsupported_grant_type");
  const raw = form.get(type === "authorization_code" ? "code" : "refresh_token") || "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new Error("invalid_grant");
  const tx = await (await db()).transaction("write");
  try {
    const result = await tx.execute({
      sql: "SELECT data FROM mcp_credentials WHERE hash=? AND kind=? AND expires>?",
      args: [digest(raw), type === "authorization_code" ? "code" : "refresh", now],
    });
    if (!result.rows[0]) throw new Error("invalid_grant");
    const grant = JSON.parse(String(result.rows[0].data)) as Grant;
    if (
      grant.clientId !== c.clientId ||
      grant.resource !== c.resource ||
      (form.has("resource") && form.get("resource") !== c.resource)
    )
      throw new Error("invalid_target");
    if (type === "authorization_code") {
      const verifier = form.get("code_verifier") || "";
      if (
        !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
        form.get("redirect_uri") !== grant.redirect ||
        createHash("sha256").update(verifier).digest("base64url") !== grant.challenge
      )
        throw new Error("invalid_grant");
    } else if (form.has("scope") && form.get("scope") !== grant.scope)
      throw new Error("invalid_scope");
    await tx.execute({
      sql: "DELETE FROM mcp_credentials WHERE hash=? OR expires<?",
      args: [digest(raw), now],
    });
    const access = randomToken(),
      refresh = randomToken();
    for (const [token, kind, ttl] of [
      [access, "access", 3600_000],
      [refresh, "refresh", 30 * 86400_000],
    ] as const)
      await tx.execute({
        sql: "INSERT INTO mcp_credentials VALUES (?,?,?,?)",
        args: [digest(token), kind, JSON.stringify(grant), now + ttl],
      });
    await tx.commit();
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: 3600,
      scope: grant.scope,
    };
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
