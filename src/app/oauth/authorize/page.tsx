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
    return (
      <main className="login-shell">
        <div className="login-card mcp-card">
          <h1>无法授权</h1>
          <p>{e instanceof Error ? e.message : "请求无效"}</p>
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
