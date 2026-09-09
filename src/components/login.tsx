"use client";
import { useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-shell">
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/api/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password: new FormData(e.currentTarget).get("password") }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            window.location.reload();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="brand-mark">p.</div>
        <span className="eyebrow">YOUR PRIVATE LEARNING SPACE</span>
        <h1>
          继续你的
          <br />
          好奇心。
        </h1>
        <p>论文、代码与灵感，在这里慢慢生长。</p>
        <label className="field-label" htmlFor="password">
          个人访问密码
        </label>
        <div className="password-field">
          <LockKeyhole size={18} />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="输入密码"
            required
            autoFocus
          />
        </div>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "正在登录…" : "进入学习空间"}
          <ArrowRight size={17} />
        </button>
        <small>仅自己可见 · Papertrail</small>
      </form>
    </main>
  );
}
