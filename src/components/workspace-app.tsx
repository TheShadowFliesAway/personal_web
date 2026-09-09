"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Search,
  House,
  Network,
  NotebookPen,
  Plus,
  Settings,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Clock3,
  Folder,
  Trash2,
  LogOut,
  Menu,
  X,
  Download,
  Cloud,
  FileText,
  LayoutGrid,
  List,
  GraduationCap,
} from "lucide-react";
import {
  type Document,
  type ResearchRoute,
  type Workspace,
  newDocument,
  statusLabels,
} from "@/lib/model";
import { api, Modal, Empty, PaperCard, Status, Tag, dateLabel } from "./ui";
import TopicTree from "./topic-tree";
import TagPicker from "./tag-picker";
import HomePage from "./home-page";
import FolderManager from "./folder-manager";
import FolderPicker from "./folder-picker";
import { withinFolder } from "@/lib/folders";
const DocumentView = dynamic(() => import("./document-view"), {
  ssr: false,
  loading: () => <div className="loading">正在准备编辑器…</div>,
});
const RouteView = dynamic(() => import("./route-view"), {
  ssr: false,
  loading: () => <div className="loading">正在铺开研究路线…</div>,
});
type View = "home" | "papers" | "routes" | "notes" | "frequent" | "trash" | "settings";
type Data = Workspace & {
  recentVisits: import("@/lib/visits").RecentVisit[];
  homeCopy: import("@/lib/home-copy").HomeCopy;
  images: { bytes: number; count: number; configured: boolean; limitMB: number };
};
export default function WorkspaceApp({ demo }: { demo: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("home");
  const [docId, setDocId] = useState<string | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [tag, setTag] = useState("all");
  const [folder, setFolder] = useState("all");
  const [grid, setGrid] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mobile, setMobile] = useState(false);
  const [create, setCreate] = useState<"paper" | "note" | "route" | "folder" | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [trashConfirmation, setTrashConfirmation] = useState<Document[] | null>(null);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [trashError, setTrashError] = useState("");
  const [manageFolders, setManageFolders] = useState(false);
  const beforeNavigate = useRef<(() => Promise<boolean>) | null>(null);
  const notify = useCallback((s: string) => setToast(s), []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const load = useCallback(() => {
    setLoadError("");
    api<Data>("/api/workspace")
      .then(setData)
      .catch((e) => setLoadError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    const restoreLocation = async () => {
      if (beforeNavigate.current && !(await beforeNavigate.current())) return;
      const [rawKind, encoded] = window.location.hash.slice(1).split("/");
      const kind = rawKind === "favorites" ? "frequent" : rawKind;
      let id = "";
      try {
        id = decodeURIComponent(encoded || "");
      } catch {
        return;
      }
      if (kind === "document" && id) {
        setDocId(id);
        setRouteId(null);
      } else if (kind === "route" && id) {
        setDocId(null);
        setRouteId(id);
        setView("routes");
      } else if (
        ["home", "papers", "routes", "notes", "frequent", "trash", "settings"].includes(kind)
      ) {
        setDocId(null);
        setRouteId(null);
        setView(kind as View);
      } else {
        setDocId(null);
        setRouteId(null);
        setView("home");
      }
    };
    void restoreLocation();
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const navigate = async (v: View, id?: string) => {
    if (beforeNavigate.current && !(await beforeNavigate.current())) return;
    window.history.pushState(
      null,
      "",
      v === "routes" && id ? `#route/${encodeURIComponent(id)}` : `#${v}`,
    );
    setView(v);
    setDocId(null);
    setRouteId(v === "routes" ? id || null : null);
    setQuery("");
    setMobile(false);
  };
  const openDoc = async (id: string) => {
    if (beforeNavigate.current && !(await beforeNavigate.current())) return;
    window.history.pushState(null, "", `#document/${encodeURIComponent(id)}`);
    setDocId(id);
    setRouteId(null);
    setSearchOpen(false);
    setMobile(false);
  };
  const updateDoc = useCallback(
    (d: Document) =>
      setData(
        (old) =>
          old && {
            ...old,
            documents: [d, ...old.documents.filter((x) => x.id !== d.id)],
            folders:
              d.kind === "note" && d.folder
                ? [...new Set([...old.folders, d.folder])].sort()
                : old.folders,
          },
      ),
    [],
  );
  const updateRoute = useCallback(
    (r: ResearchRoute) =>
      setData((old) => old && { ...old, routes: [r, ...old.routes.filter((x) => x.id !== r.id)] }),
    [],
  );
  const showCreate = (kind: typeof create) => {
    setFormError("");
    setCreate(kind);
  };
  const openFolderManager = async () => {
    if (beforeNavigate.current && !(await beforeNavigate.current())) return;
    // Close the editor before moving its document to a new topic.
    await navigate("notes");
    setManageFolders(true);
  };
  const viewedId = data?.documents.find((d) => d.id === docId && !d.deletedAt)?.id;
  useEffect(() => {
    if (!viewedId) return;
    api<import("@/lib/visits").RecentVisit[]>("/api/visits", "POST", { id: viewedId })
      .then((recentVisits) => setData((old) => old && { ...old, recentVisits }))
      .catch(() => notify("笔记已打开，但近期常看记录暂时未能同步"));
  }, [viewedId, notify]);
  if (!data)
    return (
      <div className="loading full">
        <div className="brand-mark">p.</div>
        {loadError ? (
          <>
            <p>{loadError}</p>
            <button className="button" onClick={load}>
              重试
            </button>
          </>
        ) : (
          <p>正在打开你的学习空间…</p>
        )}
      </div>
    );
  const docs = data.documents.filter((d) => !d.deletedAt),
    papers = docs.filter((d) => d.kind === "paper"),
    notes = docs.filter((d) => d.kind === "note");
  const currentDoc = data.documents.find((d) => d.id === docId);
  const currentRoute = data.routes.find((r) => r.id === routeId);
  const matches = (d: Document, q: string) =>
    `${d.title} ${d.summary} ${d.markdown} ${d.tags.join(" ")} ${d.folder} ${d.url}`
      .toLowerCase()
      .includes(q.toLowerCase());
  const frequent = data.recentVisits.flatMap((v) => docs.filter((d) => d.id === v.id));
  const visible = (
    view === "papers"
      ? papers
      : view === "notes"
        ? notes
        : view === "trash"
          ? data.documents.filter((d) => d.deletedAt)
          : frequent
  ).filter(
    (d) =>
      matches(d, query) &&
      (view !== "papers" || status === "all" || d.status === status) &&
      (tag === "all" || d.tags.includes(tag)) &&
      (view !== "notes" ||
        folder === "all" ||
        d.folder === folder ||
        d.folder.startsWith(folder + "/")),
  );
  const titles: Record<View, string> = {
    home: "最近学习",
    papers: "论文库",
    routes: "研究路线",
    notes: "学习笔记",
    frequent: "近期常看",
    trash: "回收站",
    settings: "设置与备份",
  };
  const navs: { key: View; label: string; icon: typeof House; count?: number }[] = [
    { key: "home", label: "最近学习", icon: House },
    { key: "papers", label: "论文库", icon: BookOpen, count: papers.length },
    { key: "routes", label: "研究路线", icon: Network, count: data.routes.length },
    { key: "notes", label: "学习笔记", icon: NotebookPen, count: notes.length },
  ];
  const renderRows = (items: Document[]) =>
    items.map((d) => (
      <div className="document-row" key={d.id}>
        <button className="row-main" onClick={() => openDoc(d.id)}>
          <span className={`document-icon ${d.kind}`}>
            {d.kind === "paper" ? <FileText size={19} /> : <NotebookPen size={19} />}
          </span>
          <span>
            <strong>{d.title || "未命名"}</strong>
            <small>{d.summary || (d.kind === "note" ? d.folder : "还没有一句话总结")}</small>
          </span>
        </button>
        <div className="row-tags">
          {d.tags.slice(0, 2).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
        {view === "trash" ? (
          <button
            className="button small"
            onClick={async () => {
              try {
                updateDoc(await api<Document>("/api/documents", "PUT", { ...d, deletedAt: null }));
                notify("已恢复");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            恢复
          </button>
        ) : view === "papers" ? (
          <Status status={d.status} />
        ) : (
          <span className="row-topic" title={view === "notes" ? d.folder : undefined}>
            {view === "notes"
              ? d.folder.split("/").at(-1) || "未分类"
              : d.kind === "paper"
                ? "论文笔记"
                : "学习笔记"}
          </span>
        )}
        <span className="row-date">{dateLabel(d.updatedAt)}</span>
        <button
          className="icon-button"
          aria-label={`打开 ${d.title}`}
          onClick={() => openDoc(d.id)}
        >
          <ArrowUpRight size={17} />
        </button>
      </div>
    ));
  return (
    <div className="app-shell">
      {mobile && <div className="sidebar-scrim" onClick={() => setMobile(false)} />}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <button className="brand" onClick={() => navigate("home")}>
          <span className="brand-mark">p.</span>
          <span>
            Papertrail<small>私人学习空间</small>
          </span>
        </button>
        <button className="search-trigger" onClick={() => setSearchOpen(true)}>
          <Search size={16} />
          <span>搜索你的知识库</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="nav-label">我的空间</div>
        <nav>
          {navs.map((n) => (
            <button
              key={n.key}
              className={`nav-item ${view === n.key && !docId ? "active" : ""}`}
              onClick={() => {
                setStatus("all");
                setTag("all");
                navigate(n.key);
              }}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.count !== undefined && <small>{n.count}</small>}
            </button>
          ))}
        </nav>
        <div className="nav-divider" />
        <button
          className={`nav-item ${view === "frequent" ? "active" : ""}`}
          onClick={() => {
            setStatus("all");
            setTag("all");
            navigate("frequent");
          }}
        >
          <Clock3 size={17} />
          <span>近期常看</span>
        </button>
        <div className="nav-label topic-label">
          学习主题
          <div className="topic-actions">
            <button
              className="icon-button"
              aria-label="管理学习主题"
              title="管理学习主题"
              onClick={openFolderManager}
            >
              <Settings size={14} />
            </button>
            <button
              className="icon-button"
              aria-label="新增主题"
              onClick={() => showCreate("folder")}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <TopicTree
          folders={[...data.folders, ...notes.map((d) => d.folder)]}
          selected={view === "notes" && folder !== "all" ? folder : null}
          onSelect={async (path) => {
            if (beforeNavigate.current && !(await beforeNavigate.current())) return false;
            await navigate("notes");
            setFolder(path);
            setStatus("all");
            setTag("all");
            return true;
          }}
        />
        <div className="sidebar-bottom">
          <div className="private-note">
            <LockIcon />
            <span>为自己积累，慢慢来。</span>
          </div>
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings size={17} />
            <span>设置与备份</span>
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setStatus("all");
              setTag("all");
              navigate("trash");
            }}
          >
            <Trash2 size={17} />
            <span>回收站</span>
          </button>
          <div className="user-profile">
            <div className="avatar">我</div>
            <div>
              <strong>我的学习空间</strong>
              <small>{demo ? "演示环境" : "仅自己可见"}</small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="打开菜单"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>我的空间</span>
            <ChevronRight size={13} />
            <button onClick={() => navigate(view)}>{titles[view]}</button>
            {(currentDoc || currentRoute) && (
              <>
                <ChevronRight size={13} />
                <strong>{currentDoc?.title || currentRoute?.title || "未命名"}</strong>
              </>
            )}
          </div>
          <div className="topbar-right">
            <span className="privacy-badge">
              <span />
              {demo ? "演示数据 · 仅供体验" : "私人空间"}
            </span>
            <button
              className="icon-button"
              aria-label="全局搜索"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={18} />
            </button>
          </div>
        </header>
        {currentDoc ? (
          <DocumentView
            key={currentDoc.id}
            document={currentDoc}
            documents={docs}
            routes={data.routes}
            folders={data.folders}
            onSaved={updateDoc}
            onOpen={openDoc}
            onBack={() => navigate(view)}
            onRoute={(id) => navigate("routes", id)}
            notify={notify}
            beforeNavigate={beforeNavigate}
          />
        ) : currentRoute ? (
          <RouteView
            key={currentRoute.id}
            route={currentRoute}
            documents={data.documents}
            onSaved={updateRoute}
            onOpen={openDoc}
            onBack={() => navigate("routes")}
            notify={notify}
            beforeNavigate={beforeNavigate}
            onDelete={() => {
              setData({ ...data, routes: data.routes.filter((r) => r.id !== currentRoute.id) });
              navigate("routes");
            }}
          />
        ) : (
          <main className="page-content">
            {view === "home" ? (
              <HomePage
                frequent={frequent}
                homeCopy={data.homeCopy}
                onHomeCopySaved={(homeCopy) =>
                  setData((current) => (current ? { ...current, homeCopy } : current))
                }
                documents={docs}
                routes={data.routes}
                onOpen={openDoc}
                onRoute={(id) => navigate("routes", id)}
                onCreate={showCreate}
                onNavigate={navigate}
              />
            ) : view === "routes" ? (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">CONNECT THE IDEAS</span>
                    <h1>研究路线</h1>
                    <p>沿着问题的演变，让论文之间产生连接。</p>
                  </div>
                  <button className="button primary" onClick={() => showCreate("route")}>
                    <Plus size={17} />
                    新建路线
                  </button>
                </div>
                <div className="route-cards">
                  {data.routes.map((r) => (
                    <button
                      className="route-tile"
                      key={r.id}
                      onClick={() => navigate("routes", r.id)}
                    >
                      <div className="card-top">
                        <span className="route-symbol">
                          <Network size={23} />
                        </span>
                        <ArrowUpRight size={20} />
                      </div>
                      <h2>{r.title}</h2>
                      <p>{r.description || "记录这条路线想要探索的问题。"}</p>
                      <div className="route-tile-nodes">
                        {r.nodes.slice(0, 3).map((n) => (
                          <Tag key={n.id}>
                            {papers.find((p) => p.id === n.paperId)?.title || "已归档"}
                          </Tag>
                        ))}
                      </div>
                      <div className="card-bottom">
                        <span>
                          {r.nodes.length} 篇论文 · {r.edges.length} 个关联
                        </span>
                        <small>{dateLabel(r.updatedAt)}</small>
                      </div>
                    </button>
                  ))}
                </div>
                {!data.routes.length && (
                  <Empty
                    title="让论文连成路线"
                    text="支持分支、汇合，以及同一篇论文加入多条路线。"
                  />
                )}
              </>
            ) : view === "settings" ? (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">MAKE IT YOURS</span>
                    <h1>设置与备份</h1>
                    <p>照顾好那些慢慢积累的理解。</p>
                  </div>
                </div>
                <div className="settings-grid">
                  <div className="settings-card">
                    <Cloud size={24} />
                    <h2>内容与图片</h2>
                    <p>
                      {papers.length} 篇论文 · {notes.length} 篇笔记 · {data.routes.length} 条路线
                    </p>
                    <div className="storage-bar">
                      <i
                        style={{
                          width: `${Math.min(100, (data.images.bytes / (data.images.limitMB * 1024 * 1024)) * 100)}%`,
                        }}
                      />
                    </div>
                    <small>
                      图片已用 {(data.images.bytes / 1024 / 1024).toFixed(1)} MB /{" "}
                      {data.images.limitMB} MB
                    </small>
                    <p className="muted">
                      {data.images.configured
                        ? "图片压缩后保存在私有存储中。"
                        : "尚未连接图片存储，文字与代码功能可以独立使用。"}
                    </p>
                    {demo && (
                      <div className="inline-notice">
                        当前为开发演示环境，数据与正式云端空间隔离。
                      </div>
                    )}
                  </div>
                  <div className="settings-card">
                    <Download size={24} />
                    <h2>导出知识库</h2>
                    <p>导出全部论文、笔记、路线、主题和历史版本，保留可迁移的数据副本。</p>
                    <a className="button" href="/api/export" download>
                      <Download size={16} />
                      导出 JSON 备份
                    </a>
                    <small className="block muted">
                      包含图片清单，不包含图片文件本身。图片请另外从 R2 备份。单篇笔记可导出
                      Markdown。
                    </small>
                  </div>
                  <div className="settings-card">
                    <BookOpen size={24} />
                    <h2>你的编辑器</h2>
                    <p>
                      支持块编辑与 Markdown 源码切换。输入 /
                      插入区块，拖拽左侧手柄调整顺序，选中文字设置格式。
                    </p>
                    <div className="shortcut-list">
                      <span>
                        全局搜索<kbd>Ctrl / ⌘ K</kbd>
                      </span>
                      <span>
                        保存当前文章<kbd>Ctrl / ⌘ S</kbd>
                      </span>
                      <span>
                        插入区块<kbd>/</kbd>
                      </span>
                    </div>
                  </div>
                  <div className="settings-card">
                    <LockIcon />
                    <h2>私人访问</h2>
                    <p>只为你自己保留的学习空间。登录密码通过部署环境配置，没有公开注册入口。</p>
                    <button
                      className="button"
                      disabled={demo}
                      onClick={async () => {
                        if (beforeNavigate.current && !(await beforeNavigate.current())) return;
                        await api("/api/auth", "DELETE");
                        window.location.reload();
                      }}
                    >
                      <LogOut size={16} />
                      退出登录
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">
                      {view === "papers"
                        ? "READ. THINK. CONNECT."
                        : view === "notes"
                          ? "STAY CURIOUS"
                          : view === "frequent"
                            ? "RECENTLY REVISITED"
                            : "YOUR SPACE"}
                    </span>
                    <h1>
                      {titles[view]}
                      <span className="heading-count">{visible.length}</span>
                    </h1>
                    <p>
                      {view === "papers"
                        ? "每一篇论文，都留下一点自己的理解。"
                        : view === "notes"
                          ? "知识、工具与兴趣，都有属于它们的位置。"
                          : view === "trash"
                            ? "删除的内容会保留在这里，随时可以恢复。"
                            : "自动整理近期反复打开的论文与学习笔记。"}
                    </p>
                  </div>
                  {view === "trash" && (
                    <button
                      className="button danger"
                      disabled={!data.documents.some((d) => d.deletedAt)}
                      onClick={() => {
                        setTrashError("");
                        setTrashConfirmation(data.documents.filter((d) => d.deletedAt));
                      }}
                    >
                      <Trash2 size={16} />
                      清空回收站
                    </button>
                  )}
                  {(view === "papers" || view === "notes") && (
                    <button
                      className="button primary"
                      onClick={() => showCreate(view === "papers" ? "paper" : "note")}
                    >
                      <Plus size={17} />
                      {view === "papers" ? "记录论文" : "新建笔记"}
                    </button>
                  )}
                </div>
                {view === "notes" && (
                  <div className="folder-chips">
                    <button
                      className={folder === "all" ? "selected" : ""}
                      onClick={() => setFolder("all")}
                    >
                      全部主题
                    </button>
                    {data.folders.map((f) => (
                      <button
                        key={f}
                        className={folder === f ? "selected" : ""}
                        onClick={() => setFolder(f)}
                      >
                        <Folder size={14} />
                        {f.replaceAll("/", " / ")}
                      </button>
                    ))}
                    <button onClick={() => showCreate("folder")}>
                      <Plus size={14} />
                      新主题
                    </button>
                    <button onClick={openFolderManager}>
                      <Settings size={14} />
                      管理主题
                    </button>
                  </div>
                )}
                {view === "frequent" && (
                  <p className="muted small-text">
                    最近 30 天按打开次数排序，同次数优先显示最近查看的笔记；30
                    分钟内重复打开只计一次。
                  </p>
                )}
                <div className="filter-bar">
                  <div className="list-search">
                    <Search size={16} />
                    <input
                      aria-label="搜索当前列表"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={view === "papers" ? "搜索论文、标签或正文…" : "搜索笔记…"}
                    />
                    {query && (
                      <button
                        className="icon-button"
                        aria-label="清空搜索"
                        onClick={() => setQuery("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {view === "papers" && (
                    <select
                      aria-label="记录状态"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">全部状态</option>
                      {Object.entries(statusLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    aria-label="标签筛选"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                  >
                    <option value="all">全部标签</option>
                    {[...new Set(docs.flatMap((d) => d.tags))].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <div className="view-toggle">
                    <button
                      className={!grid ? "selected" : ""}
                      aria-label="列表视图"
                      onClick={() => setGrid(false)}
                    >
                      <List size={17} />
                    </button>
                    <button
                      className={grid ? "selected" : ""}
                      aria-label="卡片视图"
                      onClick={() => setGrid(true)}
                    >
                      <LayoutGrid size={17} />
                    </button>
                  </div>
                </div>
                {visible.length ? (
                  grid && view !== "trash" ? (
                    <div className="paper-grid">
                      {visible.map((d) => (
                        <PaperCard key={d.id} doc={d} onOpen={() => openDoc(d.id)} />
                      ))}
                    </div>
                  ) : (
                    <div className="document-list">
                      <div className="list-header">
                        <span>标题与摘要</span>
                        <span>标签</span>
                        <span>
                          {view === "papers"
                            ? "记录状态"
                            : view === "notes"
                              ? "学习主题"
                              : view === "trash"
                                ? "操作"
                                : "内容类型"}
                        </span>
                        <span>最近编辑</span>
                        <span />
                      </div>
                      {renderRows(visible)}
                    </div>
                  )
                ) : (
                  <Empty
                    title={
                      query || tag !== "all" || (view === "papers" && status !== "all")
                        ? "没有找到匹配的内容"
                        : view === "trash"
                          ? "回收站是空的"
                          : view === "frequent"
                            ? "还没有近期查看记录"
                            : "从第一条记录开始"
                    }
                    text={
                      view === "frequent"
                        ? "打开论文或学习笔记后，这里会自动整理你近期常看的内容。"
                        : "你可以调整筛选条件，或新建一份记录。"
                    }
                  />
                )}
              </>
            )}
          </main>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {trashConfirmation && (
        <Modal
          title="彻底清空回收站？"
          onClose={() => {
            if (!emptyingTrash) setTrashConfirmation(null);
          }}
        >
          <p>
            将永久删除回收站中的全部 {trashConfirmation.length}{" "}
            篇内容及其历史版本，无法恢复。当前搜索或筛选不会缩小清空范围。
          </p>
          <p className="muted small-text">
            研究路线中的对应节点、连线和笔记关联会一并移除。图片文件暂时保留，避免影响其他笔记引用。
          </p>
          {trashError && <p role="alert">{trashError}</p>}
          <div className="modal-actions">
            <button
              className="button"
              disabled={emptyingTrash}
              onClick={() => setTrashConfirmation(null)}
            >
              取消
            </button>
            <button
              className="button danger"
              disabled={emptyingTrash}
              onClick={async () => {
                setEmptyingTrash(true);
                setTrashError("");
                try {
                  const result = await api<{
                    deletedIds: string[];
                    documents: Document[];
                    routes: ResearchRoute[];
                  }>("/api/trash", "DELETE", {
                    documents: trashConfirmation.map(({ id, revision }) => ({ id, revision })),
                  });
                  setData(
                    (old) =>
                      old && {
                        ...old,
                        documents: old.documents
                          .filter((d) => !result.deletedIds.includes(d.id))
                          .map((d) => result.documents.find((updated) => updated.id === d.id) || d),
                        routes: old.routes.map(
                          (r) => result.routes.find((updated) => updated.id === r.id) || r,
                        ),
                        recentVisits: old.recentVisits.filter(
                          (v) => !result.deletedIds.includes(v.id),
                        ),
                      },
                  );
                  setTrashConfirmation(null);
                  notify(`已彻底删除 ${result.deletedIds.length} 篇内容`);
                } catch (e) {
                  setTrashError((e as Error).message);
                } finally {
                  setEmptyingTrash(false);
                }
              }}
            >
              {emptyingTrash ? "正在清空…" : "确认永久删除"}
            </button>
          </div>
        </Modal>
      )}
      {manageFolders && (
        <FolderManager
          folders={data.folders}
          documents={data.documents}
          onClose={() => setManageFolders(false)}
          onChanged={(result) => {
            setData(
              (old) =>
                old && {
                  ...old,
                  folders: result.folders,
                  documents: old.documents.map(
                    (d) => result.documents.find((updated) => updated.id === d.id) || d,
                  ),
                },
            );
            if (folder !== "all" && !result.folders.some((f) => withinFolder(f, folder)))
              setFolder("all");
            notify(`主题已删除，${result.movedCount} 篇笔记已移到未分类`);
          }}
        />
      )}
      {searchOpen && (
        <Modal title="搜索知识库" onClose={() => setSearchOpen(false)}>
          <div className="global-search">
            <Search size={20} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索论文、笔记、代码或标签…"
            />
          </div>
          <div className="search-results">
            {docs
              .filter((d) => matches(d, search))
              .slice(0, 30)
              .map((d) => (
                <button key={d.id} onClick={() => openDoc(d.id)}>
                  <span className="document-icon">
                    {d.kind === "paper" ? <BookOpen size={18} /> : <NotebookPen size={18} />}
                  </span>
                  <span>
                    <strong>{d.title || "未命名"}</strong>
                    <small>{d.summary || d.folder}</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            {!docs.some((d) => matches(d, search)) && (
              <Empty title="还没有找到" text="试试更短的关键词。" />
            )}
          </div>
          <div className="modal-footer muted">搜索范围包括正文与代码 · Esc 关闭</div>
        </Modal>
      )}
      {create && (
        <Modal
          title={
            {
              paper: "记录一篇论文",
              note: "写一篇学习笔记",
              route: "创建研究路线",
              folder: "新建学习主题",
            }[create]
          }
          onClose={() => !busy && setCreate(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setFormError("");
              const f = new FormData(e.currentTarget);
              try {
                if (beforeNavigate.current && !(await beforeNavigate.current()))
                  throw new Error("请先保存当前内容");
                if (create === "folder") {
                  const result = await api<{ name: string }>("/api/folders", "POST", {
                    name: f.get("title"),
                  });
                  setData(
                    (old) =>
                      old && {
                        ...old,
                        folders: [...new Set([...old.folders, result.name])].sort(),
                      },
                  );
                  notify("主题已创建");
                } else if (create === "route") {
                  const r = await api<ResearchRoute>("/api/routes", "PUT", {
                    id: crypto.randomUUID(),
                    title: f.get("title"),
                    description: f.get("summary") || "",
                    nodes: [],
                    edges: [],
                    revision: 0,
                    updatedAt: new Date().toISOString(),
                  });
                  updateRoute(r);
                  await navigate("routes", r.id);
                } else {
                  const d = newDocument(create, String(f.get("folder") || "未分类"));
                  const result = await api<Document>("/api/documents", "PUT", {
                    ...d,
                    title: f.get("title"),
                    url: f.get("url") || "",
                    summary: f.get("summary") || "",
                    year: f.get("year") || "",
                    tags: JSON.parse(String(f.get("tags") || "[]")),
                  });
                  updateDoc(result);
                  setView(create === "paper" ? "papers" : "notes");
                  setRouteId(null);
                  window.history.pushState(null, "", `#document/${encodeURIComponent(result.id)}`);
                  setDocId(result.id);
                }
                setCreate(null);
              } catch (e) {
                setFormError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field-label">
              {create === "folder" ? "主题路径" : "标题"}
              <input
                name="title"
                autoFocus
                required
                maxLength={200}
                placeholder={
                  create === "paper"
                    ? "例如：BLIP-2"
                    : create === "route"
                      ? "例如：视觉语言模型"
                      : create === "folder"
                        ? "例如：编程与工具/PyTorch"
                        : "给今天的思考起个名字"
                }
              />
            </label>
            {create === "paper" && (
              <div className="form-row">
                <label className="field-label grow">
                  论文链接
                  <input name="url" type="url" placeholder="https://arxiv.org/abs/…" />
                </label>
                <label className="field-label year-input">
                  年份
                  <input name="year" placeholder="2023" maxLength={10} />
                </label>
              </div>
            )}
            {create !== "folder" && (
              <label className="field-label">
                {create === "route" ? "这条路线想探索什么？" : "一句话总结（选填）"}
                <textarea name="summary" rows={2} placeholder="留下一点线索，之后再慢慢补充。" />
              </label>
            )}
            {(create === "paper" || create === "note") && (
              <div className="field-label">
                标签
                <TagPicker name="tags" disabled={busy} />
              </div>
            )}
            {create === "note" && (
              <div className="field-label">
                学习主题
                <FolderPicker
                  name="folder"
                  folders={data.folders}
                  defaultValue={folder !== "all" ? folder : "未分类"}
                />
              </div>
            )}
            {create === "folder" && (
              <p className="muted small-text">使用 / 创建子主题，例如「兴趣爱好/音乐/乐理」。</p>
            )}
            {formError && (
              <p className="error-text" role="alert">
                {formError}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button"
                type="button"
                onClick={() => setCreate(null)}
                disabled={busy}
              >
                取消
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "正在创建…" : "创建并开始"}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
function LockIcon() {
  return <GraduationCap size={19} />;
}
