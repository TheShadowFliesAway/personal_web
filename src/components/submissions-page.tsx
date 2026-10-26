"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Plus, Pencil, Trash2, FileText } from "lucide-react";
import {
  currentSubmission,
  newSubmission,
  submissionSchema,
  submissionStatuses,
  type Submission,
} from "@/lib/submissions";
import { Modal } from "./ui";

async function request<T>(url: string, method = "GET", value?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败，请稍后重试");
  return data;
}
const primaryLinks = [
  ["paperGithub", "论文 GitHub"],
  ["overleaf", "Overleaf"],
  ["codeGithub", "代码 GitHub"],
  ["paperUrl", "论文 / arXiv"],
] as const;
export default function SubmissionsPage({
  admin,
  unlocked,
}: {
  admin: boolean;
  unlocked: boolean;
}) {
  const [allowed, setAllowed] = useState(unlocked);
  const [code, setCode] = useState("");
  const [papers, setPapers] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(unlocked);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Submission | null>(null);
  const [removing, setRemoving] = useState<Submission | null>(null);
  async function reload() {
    setLoading(true);
    setError("");
    try {
      setPapers((await request<{ submissions: Submission[] }>("/api/submissions")).submissions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (allowed) void reload();
  }, [allowed]);
  const filtered = papers.filter(
    (p) =>
      `${p.title} ${p.history.map((h) => h.venue).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "all" || (currentSubmission(p)?.status || "draft") === status),
  );
  return (
    <main className="submissions-page">
      <header className="submission-nav">
        <a href="/">
          <ArrowLeft size={16} /> 返回主页
        </a>
        <span>Papertrail / 论文投稿</span>
        {allowed && !admin && (
          <button
            onClick={async () => {
              try {
                await request("/api/submissions/access", "DELETE");
                setAllowed(false);
                setPapers([]);
                setCode("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            退出查看
          </button>
        )}
      </header>
      <div className="submission-heading">
        <div>
          <span className="eyebrow">RESEARCH IN PROGRESS</span>
          <h1>让每一步研究，都有迹可循。</h1>
          <p>记录投稿的去向、进展与结果，留下一篇论文走过的路。</p>
        </div>
        {allowed && admin && (
          <button className="button primary" onClick={() => setEditing(newSubmission())}>
            <Plus size={16} /> 添加论文
          </button>
        )}
      </div>
      {!allowed ? (
        <form
          className="submission-gate"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await request("/api/submissions/access", "POST", { code });
              setAllowed(true);
              setCode("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="brand-mark">
            <FileText size={24} />
          </div>
          <h2>查看论文投稿</h2>
          <p>输入查看口令即可浏览，无需登录个人空间。</p>
          <label htmlFor="submission-code">查看口令</label>
          <input
            id="submission-code"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={100}
            required
            placeholder="输入查看口令"
          />
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "正在验证…" : "进入投稿页面"}
          </button>
        </form>
      ) : (
        <>
          <div className="submission-stats">
            {[
              ["all", "全部论文"],
              ["submitted", submissionStatuses.submitted],
              ["accepted", "中稿"],
              ["rejected", "拒稿"],
              ["draft", "待投稿"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={status === key ? "selected" : ""}
                onClick={() => setStatus(key)}
                aria-pressed={status === key}
              >
                <strong>
                  {key === "all"
                    ? papers.length
                    : papers.filter((p) => (currentSubmission(p)?.status || "draft") === key)
                        .length}
                </strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="submission-search">
            <input
              aria-label="搜索投稿论文"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索论文标题或会议 / 期刊…"
            />
            <button className="button" onClick={() => void reload()} disabled={loading}>
              刷新
            </button>
            {!admin && <span className="muted">只读浏览 · 编辑请先登录主页</span>}
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          {loading ? (
            <p className="submission-empty" role="status">
              正在读取投稿记录…
            </p>
          ) : filtered.length ? (
            <div className="submission-grid">
              {filtered.map((p) => {
                const current = currentSubmission(p);
                const links = [
                  ...primaryLinks
                    .filter(([key]) => p[key])
                    .map(([key, label]) => ({ label, url: p[key] })),
                  ...p.links,
                ];
                return (
                  <article className="submission-card" key={p.id}>
                    <div className="submission-card-top">
                      <span className={`submission-status ${current?.status || "draft"}`}>
                        {current ? submissionStatuses[current.status] : "待投稿"}
                      </span>
                      {admin && (
                        <div className="submission-actions">
                          <button
                            className="icon-button"
                            aria-label={`编辑 ${p.title}`}
                            onClick={() => setEditing(structuredClone(p))}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`删除 ${p.title}`}
                            onClick={() => {
                              setError("");
                              setRemoving(p);
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                    <h2>{p.title}</h2>
                    {p.summary && <p className="submission-text">{p.summary}</p>}
                    <div className="submission-current">
                      <span>{current?.status === "submitted" ? "当前投稿" : "最近投稿"}</span>
                      <strong>{current?.venue || "尚未添加投稿记录"}</strong>
                      {current?.submittedAt && <small>投稿于 {current.submittedAt}</small>}
                    </div>
                    {links.length > 0 && (
                      <div className="submission-links">
                        {links.map((l, i) => (
                          <a
                            key={i}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                          >
                            {l.label}
                            <ArrowUpRight size={13} />
                          </a>
                        ))}
                      </div>
                    )}
                    <details className="submission-history">
                      <summary>
                        投稿历程 <span>{p.history.length} 轮</span>
                      </summary>
                      {p.history.length ? (
                        <ol reversed>
                          {[...p.history].reverse().map((h, i) => (
                            <li key={h.id}>
                              <div>
                                <strong>{h.venue}</strong>
                                <span className={`submission-status ${h.status}`}>
                                  {submissionStatuses[h.status]}
                                </span>
                              </div>
                              <small>
                                第 {p.history.length - i} 轮 · 投稿：{h.submittedAt || "未记录"}
                                {h.decisionAt && ` · 结果：${h.decisionAt}`}
                              </small>
                              {h.notes && <p className="submission-text">{h.notes}</p>}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p>还没有投稿记录。</p>
                      )}
                    </details>
                    {p.notes && (
                      <details className="submission-history">
                        <summary>论文备注</summary>
                        <p className="submission-text">{p.notes}</p>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="submission-empty">
              <FileText size={32} />
              <h2>{papers.length ? "没有匹配的论文" : "从第一篇论文开始"}</h2>
              <p>
                {papers.length
                  ? "试试其他关键词或状态。"
                  : admin
                    ? "添加论文与链接，再记录每一轮投稿。"
                    : "还没有发布投稿记录。"}
              </p>
            </div>
          )}
        </>
      )}
      {editing && (
        <SubmissionEditor
          paper={editing}
          onClose={() => setEditing(null)}
          onSave={(saved) => {
            setPapers((old) => [saved, ...old.filter((p) => p.id !== saved.id)]);
            setEditing(null);
          }}
        />
      )}
      {removing && (
        <Modal
          title="删除投稿记录"
          onClose={() => {
            if (!busy) setRemoving(null);
          }}
        >
          <p>
            确定删除「{removing.title}」及其全部投稿历程？此操作无法撤销，不会删除 GitHub 或
            Overleaf 中的文件。
          </p>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="submission-form-actions">
            <button className="button" disabled={busy} onClick={() => setRemoving(null)}>
              取消
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await request("/api/submissions", "DELETE", {
                    id: removing.id,
                    revision: removing.revision,
                  });
                  setPapers((old) => old.filter((p) => p.id !== removing.id));
                  setRemoving(null);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在删除…" : "确认删除"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
function SubmissionEditor({
  paper,
  onClose,
  onSave,
}: {
  paper: Submission;
  onClose: () => void;
  onSave: (paper: Submission) => void;
}) {
  const [draft, setDraft] = useState(paper);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(paper);
  const close = () => {
    if (!busy && (!dirty || window.confirm("有未保存的修改，确定放弃吗？"))) onClose();
  };
  const text = (
    key: "title" | "summary" | "notes" | "paperGithub" | "overleaf" | "codeGithub" | "paperUrl",
    label: string,
    multiline = false,
  ) => (
    <label className={multiline || key === "title" ? "submission-full" : ""}>
      {label}
      {multiline ? (
        <textarea
          rows={3}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      ) : (
        <input
          type={primaryLinks.some(([k]) => k === key) ? "url" : "text"}
          value={draft[key]}
          required={key === "title"}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      )}
    </label>
  );
  function updateRound(index: number, patch: Partial<Submission["history"][number]>) {
    setDraft({
      ...draft,
      history: draft.history.map((h, i) => (i === index ? { ...h, ...patch } : h)),
    });
  }
  return (
    <Modal title={paper.revision ? "编辑投稿论文" : "添加投稿论文"} wide onClose={close}>
      <form
        className="submission-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const parsed = submissionSchema.safeParse(draft);
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          setBusy(true);
          setError("");
          try {
            onSave(await request<Submission>("/api/submissions", "PUT", parsed.data));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <div className="submission-form-grid">
            {text("title", "论文标题 *")}
            {text("summary", "论文简介", true)}
          </div>
          <h3>论文链接</h3>
          <p className="muted">填写的链接与备注均对持有查看口令的人可见。</p>
          <div className="submission-form-grid">
            {primaryLinks.map(([key, label]) => (
              <div key={key}>{text(key, label)}</div>
            ))}
          </div>
          {draft.links.map((l, i) => (
            <div className="submission-link-row" key={i}>
              <input
                aria-label={`链接 ${i + 1} 名称`}
                placeholder="链接名称，例如项目主页"
                value={l.label}
                required
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    links: draft.links.map((v, j) =>
                      i === j ? { ...v, label: e.target.value } : v,
                    ),
                  })
                }
              />
              <input
                aria-label={`链接 ${i + 1} 地址`}
                type="url"
                placeholder="https://…"
                value={l.url}
                required
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    links: draft.links.map((v, j) => (i === j ? { ...v, url: e.target.value } : v)),
                  })
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`移除链接 ${i + 1}`}
                onClick={() => setDraft({ ...draft, links: draft.links.filter((_, j) => i !== j) })}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button"
            disabled={draft.links.length >= 20}
            onClick={() => setDraft({ ...draft, links: [...draft.links, { label: "", url: "" }] })}
          >
            <Plus size={14} /> 添加其他链接
          </button>
          <h3>投稿历程</h3>
          <p className="muted">
            按投稿先后记录，最后一轮决定卡片状态；日期可留空。再次投稿前，请先更新上一轮的结果。
          </p>
          {draft.history.map((h, i) => (
            <section className="submission-round-form" key={h.id}>
              <div className="submission-card-top">
                <strong>
                  第 {i + 1} 轮{i === draft.history.length - 1 ? " · 最新投稿" : ""}
                </strong>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`移除第 ${i + 1} 轮`}
                  onClick={() => {
                    if (window.confirm("确定移除这一轮投稿记录？保存后生效。"))
                      setDraft({ ...draft, history: draft.history.filter((_, j) => i !== j) });
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="submission-form-grid">
                <label>
                  会议 / 期刊 *
                  <input
                    value={h.venue}
                    required
                    onChange={(e) => updateRound(i, { venue: e.target.value })}
                    placeholder="例如 NeurIPS 2027"
                  />
                </label>
                <label>
                  状态
                  <select
                    aria-label="状态"
                    value={h.status}
                    onChange={(e) =>
                      updateRound(i, {
                        status: e.target.value as typeof h.status,
                        ...(e.target.value === "submitted" ? { decisionAt: "" } : {}),
                      })
                    }
                  >
                    {Object.entries(submissionStatuses).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  投稿日期
                  <input
                    type="date"
                    value={h.submittedAt}
                    onChange={(e) => updateRound(i, { submittedAt: e.target.value })}
                  />
                </label>
                <label>
                  结果日期
                  <input
                    type="date"
                    disabled={h.status === "submitted"}
                    min={h.submittedAt || undefined}
                    value={h.decisionAt}
                    onChange={(e) => updateRound(i, { decisionAt: e.target.value })}
                  />
                </label>
                <label className="submission-full">
                  本轮备注
                  <textarea
                    rows={2}
                    value={h.notes}
                    onChange={(e) => updateRound(i, { notes: e.target.value })}
                    placeholder="审稿意见摘要、修改计划、投稿编号等"
                  />
                </label>
              </div>
            </section>
          ))}
          <button
            className="button"
            type="button"
            disabled={
              draft.history.length >= 100 || currentSubmission(draft)?.status === "submitted"
            }
            onClick={() =>
              setDraft({
                ...draft,
                history: [
                  ...draft.history,
                  {
                    id: crypto.randomUUID(),
                    venue: "",
                    status: "submitted",
                    submittedAt: "",
                    decisionAt: "",
                    notes: "",
                  },
                ],
              })
            }
          >
            <Plus size={14} /> 添加一轮投稿
          </button>
          <h3>其他备注</h3>
          {text("notes", "备注", true)}
        </fieldset>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="submission-form-actions">
          <button type="button" className="button" disabled={busy} onClick={close}>
            取消
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "正在保存…" : "保存论文"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
