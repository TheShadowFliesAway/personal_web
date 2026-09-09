import { authenticated } from "@/lib/auth";
import { isConfigured, isDemo } from "@/lib/db";
import WorkspaceApp from "@/components/workspace-app";
import Login from "@/components/login";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!isConfigured())
    return (
      <main className="login-shell">
        <div className="login-card">
          <div className="brand-mark">p.</div>
          <span className="eyebrow">PAPERTRAIL / SETUP</span>
          <h1>
            你的学习空间，
            <br />
            即将就绪。
          </h1>
          <p>请在部署环境中连接 Turso，并设置个人登录密码和会话密钥。</p>
          <p className="muted">配置步骤见仓库中的 DEPLOY.md。连接完成后重新部署即可。</p>
        </div>
      </main>
    );
  if (!(await authenticated())) return <Login />;
  return <WorkspaceApp demo={isDemo()} />;
}
