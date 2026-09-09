"use client";
import { useState } from "react";
import { defaultHomeCopy, type HomeCopy } from "@/lib/home-copy";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileText,
  Network,
  NotebookPen,
  Plus,
  Pencil,
  Clock3,
} from "lucide-react";
import type { Document, ResearchRoute } from "@/lib/model";
import { api, dateLabel, Empty, Modal, Status } from "./ui";
import RouteThumbnail from "./route-thumbnail";

export default function HomePage({
  homeCopy,
  onHomeCopySaved,
  frequent,
  documents,
  routes,
  onOpen,
  onRoute,
  onCreate,
  onNavigate,
}: {
  homeCopy: HomeCopy;
  onHomeCopySaved: (copy: HomeCopy) => void;
  frequent: Document[];
  documents: Document[];
  routes: ResearchRoute[];
  onOpen: (id: string) => void;
  onRoute: (id: string) => void;
  onCreate: (kind: "paper" | "note" | "route") => void;
  onNavigate: (view: "papers" | "notes" | "routes" | "frequent") => void;
}) {
  const [editing, setEditing] = useState(false);
  const recent = [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const papers = recent.filter((d) => d.kind === "paper");
  const notes = recent.filter((d) => d.kind === "note");
  const reading = papers.filter((d) => d.status === "reading");
  const latestRoutes = [...routes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <div className="page-heading home-heading">
        <div className="home-copy">
          <div className="home-copy-toolbar">
            {homeCopy.eyebrow && <span className="eyebrow">{homeCopy.eyebrow}</span>}
            <button
              className="icon-button"
              aria-label="编辑首页文案"
              title="编辑首页文案"
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} />
            </button>
          </div>
          <h1>
            {homeCopy.title.endsWith("。") ? (
              <>
                {homeCopy.title.slice(0, -1)}
                <span className="teal">。</span>
              </>
            ) : (
              homeCopy.title
            )}
          </h1>
          {homeCopy.description && <p>{homeCopy.description}</p>}
        </div>
        <div className="home-create-actions">
          <button className="button" onClick={() => onCreate("paper")}>
            <Plus size={16} />
            记录论文
          </button>
          <button className="button primary" onClick={() => onCreate("note")}>
            <NotebookPen size={16} />
            写学习笔记
          </button>
        </div>
      </div>
      <div className="home-library-summary">
        <span>已积累</span>
        <button onClick={() => onNavigate("notes")}>
          <strong>{notes.length}</strong> 篇学习笔记
        </button>
        <span>·</span>
        <button onClick={() => onNavigate("papers")}>
          <strong>{papers.length}</strong> 篇论文记录
        </button>
        <span>·</span>
        <button onClick={() => onNavigate("routes")}>
          <strong>{routes.length}</strong> 条研究路线
        </button>
      </div>
      <div className="home-workspace-grid">
        <div className="home-main-column">
          <section className="home-recent" aria-label="最近编辑">
            <div className="section-heading">
              <div>
                <h2>最近编辑</h2>
                <p className="home-section-caption">论文笔记与学习笔记，都从上次停下的地方继续。</p>
              </div>
              <span className="muted small-text">按编辑时间</span>
            </div>
            <div className="home-recent-list">
              {recent.slice(0, 6).map((d) => (
                <button className="home-recent-item" key={d.id} onClick={() => onOpen(d.id)}>
                  <span className={`document-icon ${d.kind}`}>
                    {d.kind === "paper" ? <FileText size={18} /> : <NotebookPen size={18} />}
                  </span>
                  <span className="home-recent-content">
                    <span className="home-item-context">
                      {d.kind === "paper"
                        ? "论文笔记"
                        : `学习笔记 · ${d.folder.replaceAll("/", " / ") || "未分类"}`}
                    </span>
                    <strong>{d.title || "未命名"}</strong>
                    <span className="home-item-summary">
                      {d.summary || "打开笔记，继续记录你的理解。"}
                    </span>
                  </span>
                  <span className="home-item-date">{dateLabel(d.updatedAt)}</span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
              {!recent.length && (
                <Empty
                  title="从第一份记录开始"
                  text="写下一个知识点，或记录一篇论文的核心思路。"
                  action={
                    <button className="button primary" onClick={() => onCreate("note")}>
                      <Plus size={16} />
                      写学习笔记
                    </button>
                  }
                />
              )}
            </div>
          </section>
          <section aria-label="研究路线">
            <div className="section-heading">
              <h2>把思考连接起来</h2>
              <button className="text-button" onClick={() => onNavigate("routes")}>
                全部路线
                <ArrowRight size={15} />
              </button>
            </div>
            {latestRoutes.slice(0, 2).map((r) => (
              <button className="route-preview" key={r.id} onClick={() => onRoute(r.id)}>
                <div className="route-preview-info">
                  <span className="route-symbol">
                    <Network size={22} />
                  </span>
                  <div>
                    <h3>{r.title}</h3>
                    <p>{r.description || "从已有的论文中，整理出自己的理解路径。"}</p>
                  </div>
                  <ArrowUpRight size={18} />
                </div>
                <RouteThumbnail route={r} papers={papers} />
                <div className="route-preview-footer">
                  <span>
                    {r.nodes.length} 篇论文 · {r.edges.length} 个关联
                  </span>
                  <span>
                    打开路线图
                    <ArrowRight size={14} />
                  </span>
                </div>
              </button>
            ))}
            {!routes.length && (
              <div className="home-route-empty">
                <Network size={25} />
                <div>
                  <h3>给相关论文一条路线</h3>
                  <p>从一个问题出发，整理分支与联系。</p>
                </div>
                <button className="button small" onClick={() => onCreate("route")}>
                  <Plus size={15} />
                  创建路线
                </button>
              </div>
            )}
          </section>
        </div>
        <aside className="home-side-column">
          <button className="quick-note-card home-quick-note" onClick={() => onCreate("note")}>
            <span className="round-icon">
              <NotebookPen size={23} />
            </span>
            <h3>今天，又学到了什么？</h3>
            <p>
              一段代码、一个知识点，
              <br />
              也可以是还没想明白的问题。
            </p>
            <span className="text-button">
              开始记录
              <Plus size={15} />
            </span>
          </button>
          <section className="home-side-section" aria-label="近期常看">
            <div className="section-heading">
              <h2>
                <Clock3 size={15} />
                近期常看
              </h2>
              <button className="text-button" onClick={() => onNavigate("frequent")}>
                全部
                <ArrowRight size={14} />
              </button>
            </div>
            {frequent.slice(0, 4).map((d) => (
              <button className="home-shortcut" key={d.id} onClick={() => onOpen(d.id)}>
                <span>
                  <strong>{d.title || "未命名"}</strong>
                  <small>{d.kind === "paper" ? "论文笔记" : "学习笔记"}</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
            {!frequent.length && (
              <p className="home-side-empty">打开笔记后，这里会自动整理最近 30 天常看的内容。</p>
            )}
          </section>
          <section className="home-side-section home-reading" aria-label="论文记录进度">
            <div className="section-heading">
              <h2>
                <BookOpen size={15} />
                论文记录进度
              </h2>
              <button className="text-button" onClick={() => onNavigate("papers")}>
                论文库
                <ArrowRight size={14} />
              </button>
            </div>
            {reading.slice(0, 3).map((d) => (
              <button className="home-shortcut" key={d.id} onClick={() => onOpen(d.id)}>
                <span>
                  <strong>{d.title || "未命名论文"}</strong>
                  <Status status={d.status} />
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
            {!reading.length && <p className="home-side-empty">记录中的论文笔记会出现在这里。</p>}
          </section>
        </aside>
      </div>
      {editing && (
        <HomeCopyEditor
          value={homeCopy}
          onClose={() => setEditing(false)}
          onSaved={(copy) => {
            onHomeCopySaved(copy);
            setEditing(false);
          }}
        />
      )}
      <footer className="page-footer">
        一点一滴，成为自己的知识。<span>PAPERTRAIL</span>
      </footer>
    </>
  );
}

function HomeCopyEditor({
  value,
  onClose,
  onSaved,
}: {
  value: HomeCopy;
  onClose: () => void;
  onSaved: (copy: HomeCopy) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title="编辑首页文案"
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving) return;
          if (!draft.title.trim()) {
            setError("请填写主标题");
            return;
          }
          setSaving(true);
          setError("");
          try {
            onSaved(await api<HomeCopy>("/api/home-copy", "PUT", draft));
          } catch (e) {
            setError(e instanceof Error ? e.message : "保存失败，请重试");
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="field-label">
          上方小字
          <input
            value={draft.eyebrow}
            maxLength={80}
            disabled={saving}
            onChange={(e) => setDraft({ ...draft, eyebrow: e.target.value })}
          />
        </label>
        <label className="field-label">
          主标题
          <input
            value={draft.title}
            maxLength={120}
            required
            disabled={saving}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label className="field-label">
          说明文字
          <textarea
            aria-label="说明文字"
            value={draft.description}
            maxLength={240}
            rows={3}
            disabled={saving}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </label>
        <p className="muted small-text">上方小字和说明文字可以留空。</p>
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions home-copy-actions">
          <button
            type="button"
            className="text-button"
            disabled={saving}
            onClick={() => {
              setDraft({ ...defaultHomeCopy });
              setError("");
            }}
          >
            恢复默认
          </button>
          <button type="button" className="button" disabled={saving} onClick={onClose}>
            取消
          </button>
          <button type="submit" className="button primary" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
