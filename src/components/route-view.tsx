"use client";
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  applyNodeChanges,
  type Node,
  type NodeProps,
  type NodeChange,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  ArrowUpRight,
  Plus,
  Network,
  List,
  Trash2,
  Check,
  X,
  GitBranch,
  MousePointer2,
} from "lucide-react";
import type { Document, ResearchRoute } from "@/lib/model";
import { useAutosave } from "./use-autosave";
import { Status, Modal, api, Empty, download } from "./ui";
type PaperNodeType = Node<{ doc?: Document; onOpen: (id: string) => void }, "paper">;
function PaperNode({ data, selected }: NodeProps<PaperNodeType>) {
  const d = data.doc;
  return (
    <div className={`graph-paper ${selected ? "selected" : ""} ${d?.deletedAt ? "archived" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="graph-node-meta">
        <span>{d?.year || "PAPER"}</span>
        {d && <Status status={d.status} />}
      </div>
      <button className="nodrag graph-title" onClick={() => d && data.onOpen(d.id)}>
        {d?.title || "未命名论文"}
        <ArrowUpRight size={15} />
      </button>
      <p>{d?.deletedAt ? "已移到回收站" : d?.summary || "点击标题打开阅读笔记"}</p>
      <div className="graph-node-tags">
        {d?.tags.slice(0, 2).map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { paper: PaperNode };
type Props = {
  route: ResearchRoute;
  documents: Document[];
  onSaved: (r: ResearchRoute) => void;
  onOpen: (id: string) => void;
  onBack: () => void;
  onDelete: () => void;
  notify: (s: string) => void;
  beforeNavigate: RefObject<(() => Promise<boolean>) | null>;
};
export default function RouteView(p: Props) {
  const {
    value: route,
    change,
    flush,
    state,
    error,
    getCurrent,
  } = useAutosave(p.route, "/api/routes", p.onSaved, p.beforeNavigate);
  const [mode, setMode] = useState<"graph" | "list">("graph");
  const [add, setAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [connection, setConnection] = useState(false);
  const nodesFromRoute = useCallback(
    (): PaperNodeType[] =>
      route.nodes.map((n) => ({
        id: n.id,
        type: "paper",
        position: n.position,
        data: { doc: p.documents.find((d) => d.id === n.paperId), onOpen: p.onOpen },
      })),
    [route.nodes, p.documents, p.onOpen],
  );
  const [nodes, setNodes] = useState<PaperNodeType[]>(nodesFromRoute);
  useEffect(() => {
    setNodes((old) =>
      nodesFromRoute().map((n) => ({ ...n, selected: old.find((x) => x.id === n.id)?.selected })),
    );
  }, [nodesFromRoute]);
  const edges = useMemo(
    () =>
      route.edges.map((e) => ({
        ...e,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#7caaa0" },
        style: { stroke: "#89b2a7", strokeWidth: 1.6 },
        labelStyle: { fill: "#71867e", fontSize: 11 },
        labelBgStyle: { fill: "#fafbf9", fillOpacity: 0.95 },
        labelBgPadding: [8, 5] as [number, number],
        selected: e.id === edgeId,
      })),
    [route.edges, edgeId],
  );
  const onConnect = (c: Connection) => {
    if (
      !c.source ||
      !c.target ||
      c.source === c.target ||
      route.edges.some((e) => e.source === c.source && e.target === c.target)
    ) {
      p.notify("请选择不同的论文，且不要重复创建已有关系");
      return;
    }
    const id = crypto.randomUUID();
    change({
      edges: [...route.edges, { id, source: c.source, target: c.target, label: "关联阅读" }],
    });
    setEdgeId(id);
    setConnection(false);
  };
  const currentEdge = route.edges.find((e) => e.id === edgeId);
  return (
    <div className="route-page">
      <div className="document-toolbar">
        <button className="text-button" onClick={p.onBack}>
          <ArrowLeft size={16} />
          全部路线
        </button>
        <div className={`save-indicator ${state}`}>
          <Check size={14} />
          {{ saved: "已保存", pending: "待保存…", saving: "正在保存…", error: "保存失败" }[state]}
        </div>
        <div className="toolbar-spacer" />
        <button
          className="icon-button danger-hover"
          aria-label="删除路线"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={17} />
        </button>
      </div>
      {error && (
        <div className="save-error" role="alert">
          {error}
          <button onClick={() => void flush()}>重试</button>
          <button
            onClick={() =>
              download(JSON.stringify(route, null, 2), "route-backup.json", "application/json")
            }
          >
            导出当前路线
          </button>
        </div>
      )}
      <div className="route-heading">
        <div>
          <div className="eyebrow">RESEARCH PATH / {route.nodes.length} PAPERS</div>
          <input
            className="route-title"
            aria-label="路线标题"
            value={route.title}
            onChange={(e) => change({ title: e.target.value })}
          />
          <input
            className="route-description"
            aria-label="路线描述"
            value={route.description}
            placeholder="这条路线想探索什么？"
            onChange={(e) => change({ description: e.target.value })}
          />
        </div>
        <button className="button primary" onClick={() => setAdd(true)}>
          <Plus size={16} />
          添加论文
        </button>
      </div>
      <div className="route-controls">
        <div className="editor-tabs compact">
          <div>
            <button className={mode === "graph" ? "active" : ""} onClick={() => setMode("graph")}>
              <Network size={16} />
              路线图
            </button>
            <button className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>
              <List size={16} />
              关联列表
            </button>
          </div>
        </div>
        <div className="route-actions">
          <button
            className="text-button"
            disabled={route.nodes.length < 2}
            onClick={() => setConnection(true)}
          >
            <GitBranch size={15} />
            添加关联
          </button>
          {selectedNode && (
            <button
              className="text-button danger-text"
              onClick={() => {
                change({
                  nodes: route.nodes.filter((n) => n.id !== selectedNode),
                  edges: route.edges.filter(
                    (e) => e.source !== selectedNode && e.target !== selectedNode,
                  ),
                });
                setSelectedNode(null);
              }}
            >
              <X size={15} />
              移出路线
            </button>
          )}
        </div>
      </div>
      {mode === "graph" ? (
        <div className="graph-container">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(changes: NodeChange<PaperNodeType>[]) =>
              setNodes((n) => applyNodeChanges(changes, n))
            }
            onNodeDragStop={(_, node) =>
              change({
                nodes: route.nodes.map((n) =>
                  n.id === node.id ? { ...n, position: node.position } : n,
                ),
              })
            }
            onConnect={onConnect}
            onNodeClick={(_, n) => {
              setSelectedNode(n.id);
              setEdgeId(null);
            }}
            onPaneClick={() => {
              setSelectedNode(null);
              setEdgeId(null);
            }}
            onEdgeClick={(_, e) => {
              setEdgeId(e.id);
              setSelectedNode(null);
            }}
            fitView
            fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={1.5}
            deleteKeyCode={null}
            ariaLabelConfig={{
              "controls.zoomIn.ariaLabel": "放大路线",
              "controls.zoomOut.ariaLabel": "缩小路线",
              "controls.fitView.ariaLabel": "适应画布",
            }}
          >
            <Background gap={24} size={1} color="#dfe5df" />
            <Controls showInteractive={false} />
            <MiniMap nodeColor="#c6ded5" maskColor="rgba(249,250,247,.65)" pannable zoomable />
          </ReactFlow>
          {!route.nodes.length && (
            <div className="graph-empty">
              <Empty
                title="从第一篇论文开始"
                text="添加论文，然后拖动节点两侧的圆点建立关联。"
                action={
                  <button className="button primary" onClick={() => setAdd(true)}>
                    <Plus size={16} />
                    添加论文
                  </button>
                }
              />
            </div>
          )}
          <div className="graph-help">
            <MousePointer2 size={13} />
            拖动节点整理布局 · 圆点连线 · 点击连线编辑关系
          </div>
          {currentEdge && (
            <div className="edge-popover">
              <div>
                <strong>编辑关系</strong>
                <button
                  className="icon-button"
                  aria-label="关闭关系编辑"
                  onClick={() => setEdgeId(null)}
                >
                  <X size={15} />
                </button>
              </div>
              <input
                aria-label="关系说明"
                value={currentEdge.label}
                onChange={(e) =>
                  change({
                    edges: route.edges.map((x) =>
                      x.id === currentEdge.id ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
                placeholder="例如：改进训练目标"
                maxLength={200}
              />
              <button
                className="text-button danger-text"
                onClick={() => {
                  change({ edges: route.edges.filter((e) => e.id !== currentEdge.id) });
                  setEdgeId(null);
                }}
              >
                <Trash2 size={14} />
                删除关联
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="route-list">
          <p className="muted small-text">每篇论文展示它的后续关联，分支与汇合都可在这里编辑。</p>
          {route.nodes.map((n) => {
            const doc = p.documents.find((d) => d.id === n.paperId);
            return (
              <div className="route-list-item" key={n.id}>
                <div>
                  <button className="text-button" onClick={() => p.onOpen(n.paperId)}>
                    <FileIcon />
                    {doc?.title || "未命名"}
                    <ArrowUpRight size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`移出 ${doc?.title}`}
                    onClick={() =>
                      change({
                        nodes: route.nodes.filter((x) => x.id !== n.id),
                        edges: route.edges.filter((e) => e.source !== n.id && e.target !== n.id),
                      })
                    }
                  >
                    <X size={15} />
                  </button>
                </div>
                {route.edges
                  .filter((e) => e.source === n.id)
                  .map((e) => (
                    <div className="route-list-edge" key={e.id}>
                      <span>
                        ↳{" "}
                        {
                          p.documents.find(
                            (d) => d.id === route.nodes.find((n) => n.id === e.target)?.paperId,
                          )?.title
                        }
                      </span>
                      <input
                        aria-label="关系说明"
                        value={e.label}
                        onChange={(ev) =>
                          change({
                            edges: route.edges.map((x) =>
                              x.id === e.id ? { ...x, label: ev.target.value } : x,
                            ),
                          })
                        }
                      />
                      <button
                        className="icon-button"
                        aria-label="删除关联"
                        onClick={() => change({ edges: route.edges.filter((x) => x.id !== e.id) })}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                {!route.edges.some((e) => e.source === n.id) && (
                  <small className="muted">暂时没有后续关联</small>
                )}
              </div>
            );
          })}
        </div>
      )}
      {add && (
        <Modal title="从论文库添加" onClose={() => setAdd(false)}>
          <input
            className="standalone-input"
            autoFocus
            placeholder="搜索论文标题或标签…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="search-results">
            {p.documents
              .filter(
                (d) =>
                  d.kind === "paper" &&
                  !d.deletedAt &&
                  !route.nodes.some((n) => n.paperId === d.id) &&
                  `${d.title} ${d.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()),
              )
              .map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    change({
                      nodes: [
                        ...route.nodes,
                        {
                          id: crypto.randomUUID(),
                          paperId: d.id,
                          position: {
                            x: route.nodes.length
                              ? Math.max(...route.nodes.map((n) => n.position.x)) + 300
                              : 100,
                            y: 160,
                          },
                        },
                      ],
                    });
                    setAdd(false);
                  }}
                >
                  <FileIcon />
                  <span>
                    <strong>{d.title || "未命名"}</strong>
                    <small>{d.summary}</small>
                  </span>
                  <Plus size={18} />
                </button>
              ))}
          </div>
          <p className="muted small-text">这里只引用已有论文。新论文请先在论文库中创建。</p>
        </Modal>
      )}
      {connection && (
        <Modal title="连接两篇论文" onClose={() => setConnection(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              onConnect({
                source: String(f.get("source")),
                target: String(f.get("target")),
                sourceHandle: null,
                targetHandle: null,
              });
            }}
          >
            <label className="field-label">
              起点
              <select name="source" aria-label="起点">
                {route.nodes.map((n) => (
                  <option value={n.id} key={n.id}>
                    {p.documents.find((d) => d.id === n.paperId)?.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              后续论文
              <select aria-label="后续论文" name="target" defaultValue={route.nodes[1]?.id}>
                {route.nodes.map((n) => (
                  <option value={n.id} key={n.id}>
                    {p.documents.find((d) => d.id === n.paperId)?.title}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small-text">
              同一个起点可连接多篇论文，形成分支；不同起点也可以汇合。
            </p>
            <div className="modal-actions">
              <button className="button primary">建立关联</button>
            </div>
          </form>
        </Modal>
      )}
      {confirmDelete && (
        <Modal title="删除这条研究路线？" onClose={() => setConfirmDelete(false)}>
          <p>路线与其中的连线会被删除，论文和笔记仍保留在论文库中。</p>
          <div className="modal-actions">
            <button className="button" onClick={() => setConfirmDelete(false)}>
              取消
            </button>
            <button
              className="button danger"
              onClick={async () => {
                if (!(await flush())) return;
                try {
                  await api("/api/routes", "DELETE", {
                    id: route.id,
                    revision: getCurrent().revision,
                  });
                  p.onDelete();
                } catch (e) {
                  p.notify((e as Error).message);
                }
              }}
            >
              删除路线
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function FileIcon() {
  return <Network size={17} />;
}
