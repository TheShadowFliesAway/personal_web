import { z } from "zod";

export const documentSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(["paper", "note"]),
  title: z.string().max(300),
  summary: z.string().max(2000),
  markdown: z.string().max(1_000_000),
  blocks: z.array(z.unknown()).max(10000).nullable(),
  tags: z.array(z.string().max(50)).max(30),
  status: z.enum(["unread", "reading", "read"]),
  year: z.string().max(10),
  url: z
    .string()
    .max(2000)
    .refine((v) => !v || /^https?:\/\//i.test(v), "仅支持 http / https 链接"),
  folder: z.string().max(200),
  favorite: z.boolean(),
  relatedIds: z.array(z.string().max(100)).max(100),
  deletedAt: z.string().nullable(),
  updatedAt: z.string(),
  createdAt: z.string(),
  revision: z.number().int().min(0),
});
export const routeSchema = z
  .object({
    id: z.string().min(1).max(100),
    title: z.string().min(1).max(200),
    description: z.string().max(2000),
    nodes: z
      .array(
        z.object({
          id: z.string().max(100),
          paperId: z.string().max(100),
          position: z.object({ x: z.number().finite(), y: z.number().finite() }),
        }),
      )
      .max(1000),
    edges: z
      .array(
        z.object({
          id: z.string().max(100),
          source: z.string().max(100),
          target: z.string().max(100),
          label: z.string().max(200),
        }),
      )
      .max(3000),
    updatedAt: z.string(),
    revision: z.number().int().min(0),
  })
  .superRefine((route, ctx) => {
    const ids = new Set(route.nodes.map((n) => n.id));
    if (ids.size !== route.nodes.length) ctx.addIssue({ code: "custom", message: "节点不能重复" });
    if (new Set(route.nodes.map((n) => n.paperId)).size !== route.nodes.length)
      ctx.addIssue({ code: "custom", message: "同一路线中的论文不能重复" });
    const pairs = new Set<string>();
    for (const e of route.edges) {
      const pair = `${e.source}/${e.target}`;
      if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target || pairs.has(pair))
        ctx.addIssue({ code: "custom", message: "无效或重复的连线" });
      pairs.add(pair);
    }
  });
export type Document = z.infer<typeof documentSchema>;
export type ResearchRoute = z.infer<typeof routeSchema>;
export type Workspace = { documents: Document[]; routes: ResearchRoute[]; folders: string[] };
export const statusLabels = { unread: "未开始记录", reading: "记录中", read: "记录完成" };
export function newDocument(kind: Document["kind"], folder = "未分类"): Document {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    kind,
    title: "",
    summary: "",
    markdown: "",
    blocks: null,
    tags: [],
    status: "unread",
    year: "",
    url: "",
    folder,
    favorite: false,
    relatedIds: [],
    deletedAt: null,
    updatedAt: now,
    createdAt: now,
    revision: 0,
  };
}
export function safeFilename(title: string) {
  return (title || "未命名").replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 100);
}
