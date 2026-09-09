import { z } from "zod";

export const homeCopySchema = z.object({
  eyebrow: z.string().trim().max(80),
  title: z.string().trim().min(1, "请填写主标题").max(120),
  description: z.string().trim().max(240),
});
export type HomeCopy = z.infer<typeof homeCopySchema>;
export const defaultHomeCopy: HomeCopy = {
  eyebrow: "A SPACE FOR YOUR THOUGHTS",
  title: "让知识，连成自己的路。",
  description: "继续上次的思考，或记下今天的新发现。",
};
