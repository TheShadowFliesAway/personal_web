"use client";
import { useRef, useState, type RefObject } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Download,
  Upload,
  History,
  Trash2,
  Code2,
  Pilcrow,
  Check,
  LoaderCircle,
  Network,
  Plus,
  X,
  FileText,
  Link2,
  RotateCcw,
} from "lucide-react";
import type { Document, ResearchRoute } from "@/lib/model";
import { safeFilename, statusLabels } from "@/lib/model";
import { useAutosave } from "./use-autosave";
import { api, Modal, Tag, download, dateLabel } from "./ui";
import BlockEditor from "./block-editor";
import TagPicker from "./tag-picker";
import FolderPicker from "./folder-picker";
type Props = {
  document: Document;
  documents: Document[];
  routes: ResearchRoute[];
  folders: string[];
  onSaved: (d: Document) => void;
  onOpen: (id: string) => void;
  onBack: () => void;
  onRoute: (id: string) => void;
  notify: (s: string) => void;
  beforeNavigate: RefObject<(() => Promise<boolean>) | null>;
};
export default function DocumentView(p: Props) {
  const {
    value: doc,
    change,
    flush,
    state,
    error,
  } = useAutosave(p.document, "/api/documents", p.onSaved, p.beforeNavigate);
  const [mode, setMode] = useState<"blocks" | "markdown">("blocks");
  const [editorKey, setEditorKey] = useState(0);
  const [history, setHistory] = useState<
    { id: number; document: Document; createdAt: string }[] | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [relate, setRelate] = useState(false);
  const [relationQuery, setRelationQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const readOnly = Boolean(doc.deletedAt);
  let fence: string | null = null;
  const headings = doc.markdown.split("\n").filter((line) => {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (match) {
      if (!fence) fence = match[1];
      else if (match[1][0] === fence[0] && match[1].length >= fence.length) fence = null;
      return false;
    }
    return !fence && /^#{1,3} /.test(line);
  });
  const exportMarkdown = () =>
    download(
      `# ${doc.title || "未命名"}\n\n${doc.url ? `论文链接：${doc.url}\n\n` : ""}${doc.markdown}`,
      `${safeFilename(doc.title)}.md`,
    );
  return (
    <div className="document-page">
      <div className="document-toolbar">
        <button className="text-button" onClick={p.onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <div className={`save-indicator ${state}`} role="status">
          {state === "saved" ? (
            <Check size={14} />
          ) : state === "saving" ? (
            <LoaderCircle size={14} className="spin" />
          ) : null}
          {{ saved: "已保存", pending: "待保存…", saving: "正在保存…", error: "保存失败" }[state]}
        </div>
        <div className="toolbar-spacer" />
        <button
          className="icon-button"
          aria-label="导出 Markdown"
          title="导出 Markdown"
          onClick={exportMarkdown}
        >
          <Download size={18} />
        </button>
        <button
          className="icon-button"
          aria-label="历史版本"
          title="历史版本"
          onClick={async () => {
            if (!(await flush())) return;
            try {
              setHistory(await api(`/api/versions?id=${doc.id}`));
            } catch (e) {
              p.notify((e as Error).message);
            }
          }}
        >
          <History size={18} />
        </button>
        <button
          className="icon-button danger-hover"
          disabled={readOnly}
          aria-label="移到回收站"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={17} />
        </button>
      </div>
      {error && (
        <div className="save-error" role="alert">
          {error}
          <button onClick={() => void flush()}>重试保存</button>
          <button onClick={exportMarkdown}>导出当前正文</button>
        </div>
      )}
      {readOnly && (
        <div className="inline-notice">
          这份内容在回收站中。
          <button
            className="text-button"
            onClick={async () => {
              change({ deletedAt: null });
              if (await flush()) p.notify("已恢复");
            }}
          >
            <RotateCcw size={14} />
            恢复内容
          </button>
        </div>
      )}
      <div className="document-layout">
        <article className="document-article">
          <div className="document-kicker">
            <FileText size={17} />
            {doc.kind === "paper" ? "PAPER NOTE" : "LEARNING NOTE"}
            {doc.year && <span>/ {doc.year}</span>}
          </div>
          <input
            className="document-title"
            aria-label="文章标题"
            value={doc.title}
            onChange={(e) => change({ title: e.target.value })}
            placeholder="未命名"
            disabled={readOnly}
            maxLength={300}
          />
          <textarea
            className="document-summary"
            aria-label="一句话总结"
            rows={2}
            value={doc.summary}
            placeholder="用一句话，留下你的理解…"
            onChange={(e) => change({ summary: e.target.value })}
            disabled={readOnly}
            maxLength={2000}
          />
          <div className="document-properties">
            {doc.kind === "paper" && (
              <div>
                <span>记录状态</span>
                <select
                  aria-label="文章记录状态"
                  value={doc.status}
                  disabled={readOnly}
                  onChange={(e) => change({ status: e.target.value as Document["status"] })}
                >
                  {Object.entries(statusLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {doc.kind === "paper" && (
              <>
                <div>
                  <span>论文链接</span>
                  <div className="property-link">
                    <input
                      aria-label="论文链接"
                      value={doc.url}
                      placeholder="https://arxiv.org/abs/…"
                      disabled={readOnly}
                      onChange={(e) => change({ url: e.target.value })}
                    />
                    {/^https?:\/\//i.test(doc.url) && (
                      <a href={doc.url} target="_blank" rel="noreferrer" aria-label="打开论文原文">
                        <ArrowUpRight size={16} />
                      </a>
                    )}
                  </div>
                </div>
                <div>
                  <span>发表年份</span>
                  <input
                    aria-label="发表年份"
                    value={doc.year}
                    placeholder="例如 2023"
                    disabled={readOnly}
                    onChange={(e) => change({ year: e.target.value })}
                    maxLength={10}
                  />
                </div>
              </>
            )}
            {doc.kind === "note" && (
              <div>
                <span>学习主题</span>
                <FolderPicker
                  value={doc.folder}
                  folders={p.folders}
                  disabled={readOnly}
                  onChange={(folder) => change({ folder })}
                />
              </div>
            )}
            <div>
              <span>标签</span>
              <TagPicker
                value={doc.tags}
                disabled={readOnly}
                onChange={(tags) => change({ tags })}
              />
            </div>
          </div>
          <div className="editor-tabs">
            <div>
              <button
                className={mode === "blocks" ? "active" : ""}
                onClick={() => {
                  if (mode !== "blocks") {
                    setMode("blocks");
                    setEditorKey((k) => k + 1);
                  }
                }}
              >
                <Pilcrow size={16} />
                块编辑
              </button>
              <button
                className={mode === "markdown" ? "active" : ""}
                onClick={() => setMode("markdown")}
              >
                <Code2 size={16} />
                Markdown
              </button>
            </div>
            <button
              className="text-button small-text"
              disabled={readOnly}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} />
              导入 .md
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 1_000_000) {
                  p.notify("Markdown 文件请小于 1 MB");
                  return;
                }
                const text = await file.text();
                const combined = doc.markdown ? `${doc.markdown}\n\n${text}` : text;
                change({ markdown: combined, blocks: null });
                setEditorKey((k) => k + 1);
                p.notify("Markdown 已追加到正文末尾");
                e.target.value = "";
              }}
            />
          </div>
          {mode === "blocks" ? (
            <div className="editor-surface">
              <BlockEditor
                key={editorKey}
                markdown={doc.markdown}
                blocks={doc.blocks}
                readOnly={readOnly}
                onChange={(markdown, blocks) => change({ markdown, blocks })}
                onError={p.notify}
              />
            </div>
          ) : (
            <div className="markdown-editor">
              <p className="editor-hint">
                原始 Markdown · 行内公式用 $…$，独立公式用 $$…$$，切回块编辑查看渲染
              </p>
              <textarea
                aria-label="Markdown 正文"
                spellCheck={false}
                value={doc.markdown}
                disabled={readOnly}
                onChange={(e) => change({ markdown: e.target.value, blocks: null })}
                placeholder="## 核心思路\n\n从这里开始记录…"
              />
            </div>
          )}
          <div className="editor-bottom">
            <span>{doc.markdown.length.toLocaleString()} 字符</span>
            <span>输入 / 插入区块 · 代码块支持 Python / LaTeX</span>
          </div>
        </article>
        <aside className="document-aside">
          <div className="aside-section">
            <h3>文章目录</h3>
            {headings.length ? (
              headings.map((h, i) => (
                <button
                  key={i}
                  className={`toc-item level-${h.match(/^#+/)![0].length}`}
                  onClick={() => {
                    const title = h.replace(/^#+ /, "");
                    const el = [
                      ...window.document.querySelectorAll(
                        ".bn-editor h1,.bn-editor h2,.bn-editor h3",
                      ),
                    ].find((e) => e.textContent === title);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                    else
                      window.document
                        .querySelector(".markdown-editor")
                        ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  {h.replace(/^#+ /, "")}
                </button>
              ))
            ) : (
              <p>添加标题后，目录会出现在这里。</p>
            )}
          </div>
          <div className="aside-section">
            <h3>所在研究路线</h3>
            {p.routes
              .filter((r) => r.nodes.some((n) => n.paperId === doc.id))
              .map((r) => (
                <button className="aside-link" key={r.id} onClick={() => p.onRoute(r.id)}>
                  <Network size={15} />
                  {r.title}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            {!p.routes.some((r) => r.nodes.some((n) => n.paperId === doc.id)) && (
              <p>
                {doc.kind === "paper"
                  ? "在研究路线中添加这篇论文，建立它与其他工作的联系。"
                  : "学习笔记可以通过下方关联内容连接论文。"}
              </p>
            )}
          </div>
          <div className="aside-section">
            <h3>
              关联内容
              <button
                className="icon-button"
                disabled={readOnly}
                aria-label="关联内容"
                onClick={() => setRelate(true)}
              >
                <Plus size={15} />
              </button>
            </h3>
            {p.documents
              .filter((d) => doc.relatedIds.includes(d.id) || d.relatedIds.includes(doc.id))
              .map((d) => (
                <div className="related-row" key={d.id}>
                  <button className="aside-link" onClick={() => p.onOpen(d.id)}>
                    <Link2 size={14} />
                    {d.title}
                  </button>
                  {doc.relatedIds.includes(d.id) && (
                    <button
                      className="icon-button"
                      disabled={readOnly}
                      aria-label={`取消关联 ${d.title}`}
                      onClick={() =>
                        change({ relatedIds: doc.relatedIds.filter((id) => id !== d.id) })
                      }
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            {!p.documents.some(
              (d) => doc.relatedIds.includes(d.id) || d.relatedIds.includes(doc.id),
            ) && <p>连接相关论文或基础知识笔记。</p>}
          </div>
          <div className="aside-meta">
            创建于 {dateLabel(doc.createdAt)}
            <br />
            编辑于 {dateLabel(doc.updatedAt)}
          </div>
        </aside>
      </div>
      {confirmDelete && (
        <Modal title="移到回收站？" onClose={() => setConfirmDelete(false)}>
          <p>「{doc.title || "未命名"}」会保留在回收站，可以随时恢复。路线中的引用仍然保留。</p>
          <div className="modal-actions">
            <button className="button" onClick={() => setConfirmDelete(false)}>
              取消
            </button>
            <button
              className="button danger"
              onClick={async () => {
                change({ deletedAt: new Date().toISOString() });
                if (await flush()) {
                  setConfirmDelete(false);
                  p.onBack();
                  p.notify("已移到回收站");
                }
              }}
            >
              移到回收站
            </button>
          </div>
        </Modal>
      )}
      {history && (
        <Modal title="历史版本" onClose={() => setHistory(null)}>
          <p className="muted small-text">连续编辑约每 5 分钟保留一个快照，最多保留 20 个版本。</p>
          {history.length ? (
            history.map((v) => (
              <div className="version-row" key={v.id}>
                <div>
                  <strong>{new Date(v.createdAt).toLocaleString("zh-CN")}</strong>
                  <small>
                    {v.document.title} · {v.document.markdown.length} 字符
                  </small>
                </div>
                <button
                  className="button small"
                  onClick={() =>
                    download(v.document.markdown, `${safeFilename(v.document.title)}-v${v.id}.md`)
                  }
                >
                  导出
                </button>
                <button
                  className="button small"
                  disabled={readOnly}
                  onClick={() => {
                    change({
                      ...v.document,
                      id: doc.id,
                      revision: doc.revision,
                      deletedAt: doc.deletedAt,
                    });
                    setEditorKey((k) => k + 1);
                    setHistory(null);
                    p.notify("历史版本已载入，正在保存");
                  }}
                >
                  恢复
                </button>
              </div>
            ))
          ) : (
            <div className="empty">
              <p>还没有历史版本。修改并保存后会自动保留。</p>
            </div>
          )}
        </Modal>
      )}
      {relate && (
        <Modal title="关联论文或笔记" onClose={() => setRelate(false)}>
          <input
            className="standalone-input"
            autoFocus
            placeholder="搜索标题…"
            value={relationQuery}
            onChange={(e) => setRelationQuery(e.target.value)}
          />
          <div className="search-results">
            {p.documents
              .filter(
                (d) =>
                  d.id !== doc.id &&
                  !doc.relatedIds.includes(d.id) &&
                  d.title.toLowerCase().includes(relationQuery.toLowerCase()),
              )
              .map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    change({ relatedIds: [...doc.relatedIds, d.id] });
                    setRelate(false);
                  }}
                >
                  <FileText size={18} />
                  <strong>{d.title || "未命名"}</strong>
                  <Tag>{d.kind === "paper" ? "论文" : "笔记"}</Tag>
                  <Plus size={16} />
                </button>
              ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
