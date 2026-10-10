import Login from "@/components/login";
import {
  config,
  digest,
  ownerSession,
  storeCredential,
  validateAuthorization,
} from "@/lib/mcp/oauth";
export const dynamic = "force-dynamic";
export default async function Authorize({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let grant;
  try {
    config();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
      else if (value !== undefined) params.set(key, value);
    }
    grant = validateAuthorization(params);
  } catch (e) {
    if (!(await ownerSession())) return <Login />;
    let callback = "";
    if (typeof query.redirect_uri === "string" && query.redirect_uri.length <= 2048) {
      try {
        const url = new URL(query.redirect_uri);
        if (url.protocol === "https:" && !url.username && !url.password && !url.hash)
          callback = query.redirect_uri;
      } catch {
        /* Never redirect to or automatically trust a supplied callback. */
      }
    }
    return (
      <main className="login-shell">
        <div className="login-card mcp-card">
          <h1>无法授权</h1>
          <p>{e instanceof Error ? e.message : "请求无效"}</p>
          {callback && (
            <>
              <p>本次客户端请求携带的回调地址（尚未信任）：</p>
              <code>{callback}</code>
              <p>
                仅当你刚从 ChatGPT 发起此连接，并核对地址属于该客户端后，将完整地址填入 Vercel 的
                MCP_REDIRECT_URIS。重新部署后从 ChatGPT 再次连接。此页面不会自动添加地址或授予权限。
              </p>
            </>
          )}
          <a href="/connections">查看 MCP 连接配置</a>
        </div>
      </main>
    );
  }
  const session = await ownerSession();
  if (!session) return <Login />;
  const ticket = await storeCredential("consent", { grant, session: digest(session) }, 10 * 60_000);
  return (
    <main className="login-shell">
      <form className="login-card mcp-card" action="/api/mcp/authorize" method="post">
        <span className="eyebrow">PAPERTRAIL / CHATGPT</span>
        <h1>授权连接私人笔记</h1>
        <p>
          允许已配置的客户端 <strong>{grant.clientId}</strong> 访问这个学习空间。
        </p>
        <ul>
          {grant.scope.includes("notes:read") && (
            <li>搜索、读取论文笔记、学习笔记、标签和研究路线。</li>
          )}
          {grant.scope.includes("notes:write") && <li>创建与更新笔记及路线，不包含删除权限。</li>}
        </ul>
        <p>
          笔记内容会在工具调用时提供给连接的客户端。授权有效期内可持续访问，随时可在“设置与备份 →
          ChatGPT 连接”撤销。
        </p>
        <small>授权回调：{new URL(grant.redirect).host}</small>
        <input type="hidden" name="ticket" value={ticket} />
        <button className="button primary" name="decision" value="allow">
          允许连接
        </button>
        <button className="button" name="decision" value="deny">
          取消
        </button>
      </form>
    </main>
  );
}
