import { z } from "zod";

const link = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "链接必须是完整的 http / https 地址");
const date = z.union([z.literal(""), z.iso.date()]);
export const submissionStatuses = {
  submitted: "在投",
  resubmitting: "转投",
  rejected: "拒稿",
  draft: "待投",
  accepted: "中稿",
} as const;
export const submissionSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1, "请填写论文标题").max(300),
    authors: z.string().max(500),
    summary: z.string().max(3000),
    paperGithub: link,
    overleaf: link,
    codeGithub: link,
    paperUrl: link,
    links: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(100),
          url: link.refine(Boolean, "请填写链接"),
        }),
      )
      .max(20),
    // Explicit order represents submission rounds; dates can remain unknown.
    history: z
      .array(
        z.object({
          id: z.uuid(),
          venue: z.string().trim().min(1, "请填写投稿会议或期刊").max(200),
          status: z.enum(["submitted", "resubmitting", "rejected", "draft", "accepted"]),
          submittedAt: date,
          decisionAt: date,
          notes: z.string().max(3000),
        }),
      )
      .max(100),
    notes: z.string().max(10000),
    revision: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.history.map((h) => h.id)).size !== p.history.length)
      ctx.addIssue({ code: "custom", message: "投稿记录不能重复" });
    p.history.forEach((h, i) => {
      if (h.status === "submitted" && i !== p.history.length - 1)
        ctx.addIssue({ code: "custom", message: "请先更新上一轮投稿结果，再添加新一轮投稿" });
      if (h.submittedAt && h.decisionAt && h.decisionAt < h.submittedAt)
        ctx.addIssue({ code: "custom", message: "结果日期不能早于投稿日期" });
      if (!["rejected", "accepted"].includes(h.status) && h.decisionAt)
        ctx.addIssue({ code: "custom", message: "只有拒稿或中稿记录才能填写结果日期" });
    });
  });
export type Submission = z.infer<typeof submissionSchema>;
export function currentSubmission(p: Submission) {
  return p.history.at(-1);
}
export function newSubmission(): Submission {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "",
    authors: "",
    summary: "",
    paperGithub: "",
    overleaf: "",
    codeGithub: "",
    paperUrl: "",
    links: [],
    history: [],
    notes: "",
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}
