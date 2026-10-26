import { guard } from "@/lib/auth";
import { workspace, db } from "@/lib/db";
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const c = await db();
  const [images, versions, submissions] = await c.batch(
    [
      "SELECT * FROM images",
      "SELECT document_id,data,created_at FROM versions",
      "SELECT data FROM submissions",
    ],
    "read",
  );
  return new Response(
    JSON.stringify(
      {
        format: "papertrail-v1",
        exportedAt: new Date().toISOString(),
        ...(await workspace()),
        imageManifest: images.rows,
        submissions: submissions.rows.map((r) => JSON.parse(String(r.data))),
        versions: versions.rows.map((r) => ({
          documentId: r.document_id,
          document: JSON.parse(String(r.data)),
          createdAt: r.created_at,
        })),
      },
      null,
      2,
    ),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="papertrail-backup.json"',
        "Cache-Control": "no-store",
      },
    },
  );
}
