import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteFolder, UNCATEGORIZED } from "@/lib/folders";
export async function POST(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const { name } = await request.json().catch(() => ({}));
  if (typeof name !== "string" || !name.trim() || name.length > 200)
    return Response.json({ error: "请填写主题名称" }, { status: 400 });
  await (
    await db()
  ).execute({ sql: "INSERT OR IGNORE INTO folders VALUES (?)", args: [name.trim()] });
  return Response.json({ name: name.trim() });
}

export async function DELETE(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const name = body?.name;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 200 ||
    name.trim() === UNCATEGORIZED
  ) {
    return Response.json({ error: "请选择有效主题，“未分类”不能删除" }, { status: 400 });
  }
  try {
    return Response.json(await deleteFolder(await db(), name.trim()));
  } catch {
    return Response.json({ error: "删除主题失败，内容未更改，请重试" }, { status: 500 });
  }
}
