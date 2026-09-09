import { recentVisits } from "@/lib/visits";
import { guard } from "@/lib/auth";
import { workspace, db, isDemo } from "@/lib/db";
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const c = await db();
  const images = await c.execute(
    "SELECT COALESCE(SUM(size),0) AS bytes,COUNT(*) AS count FROM images",
  );
  return Response.json(
    {
      ...(await workspace()),
      demo: isDemo(),
      recentVisits: await recentVisits(c),
      images: {
        bytes: Number(images.rows[0].bytes),
        count: Number(images.rows[0].count),
        configured: Boolean(process.env.R2_BUCKET_NAME),
        limitMB: Number(process.env.IMAGE_STORAGE_LIMIT_MB || 1024),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
