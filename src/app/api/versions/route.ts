import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") || "";
  const result = await (
    await db()
  ).execute({
    sql: "SELECT id,data,created_at FROM versions WHERE document_id=? ORDER BY id DESC LIMIT 20",
    args: [id],
  });
  return Response.json(
    result.rows.map((r) => ({
      id: r.id,
      document: JSON.parse(String(r.data)),
      createdAt: r.created_at,
    })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
