import Login from "@/components/login";
import { config, ownerSession } from "@/lib/mcp/oauth";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function Connections() {
  if (!(await ownerSession())) return <Login />;
  let endpoint = "",
    configured = false;
  try {
    endpoint = config().resource;
    configured = true;
  } catch {
    /* Show setup instructions without disclosing secrets. */
  }
  const result = await (
    await db()
  ).execute({
    sql: "SELECT COUNT(DISTINCT json_extract(data,'$.family')) AS count FROM mcp_credentials WHERE kind IN ('access','refresh') AND expires>?",
    args: [Date.now()],
  });
  const count = Number(result.rows[0]?.count || 0);
  return (
    <main className="login-shell">
      <div className="login-card mcp-card">
        <span className="eyebrow">PAPERTRAIL / MCP</span>
        <h1>ChatGPT 连接</h1>
        <p>
          {configured
            ? "MCP 已启用。将下面的地址填入 ChatGPT 的自定义 MCP 服务器，认证方式选择 OAuth。"
            : "MCP 尚未启用或配置不完整。请按照 DEPLOY.md 配置 MCP 环境变量并重新部署。"}
        </p>
        {endpoint && <code style={{ overflowWrap: "anywhere" }}>{endpoint}</code>}
        <p>
          支持搜索、读取、创建和更新笔记，以及组织带分支的研究路线。客户端 ID 和密钥使用你在 Vercel
          中配置的值，不是网站登录密码。
        </p>
        <p>当前有效授权：{count} 个。撤销后需要从 ChatGPT 重新授权。</p>
        <form action="/api/mcp/connections" method="post">
          <button className="button" disabled={!count}>
            撤销全部 MCP 授权
          </button>
        </form>
        <a className="mcp-back" href="/#settings">
          返回学习空间
        </a>
      </div>
    </main>
  );
}
