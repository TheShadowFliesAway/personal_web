import { guard } from "@/lib/auth";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  if (!process.env.R2_BUCKET_NAME)
    return Response.json(
      { error: "图片存储尚未配置。连接 R2 后即可粘贴、上传图片。" },
      { status: 503 },
    );
  if (Number(request.headers.get("content-length")) > 3_500_000)
    return Response.json({ error: "图片过大，请先压缩到 3 MB 以内" }, { status: 413 });
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || file.size > 3_000_000)
      return Response.json({ error: "请选择 3 MB 以内的图片" }, { status: 400 });
    const output = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({ width: 2400, withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
    const c = await db();
    const id = crypto.randomUUID();
    const configured = Number(process.env.IMAGE_STORAGE_LIMIT_MB || 1024);
    const limit = (Number.isFinite(configured) && configured > 0 ? configured : 1024) * 1024 * 1024;
    const tx = await c.transaction("write");
    try {
      const used = await tx.execute("SELECT COALESCE(SUM(size),0) AS bytes FROM images");
      if (Number(used.rows[0].bytes) + output.length > limit) {
        await tx.rollback();
        return Response.json(
          { error: "已达到图片容量上限，请调整容量或清理存储" },
          { status: 413 },
        );
      }
      await tx.execute({
        sql: "INSERT INTO images VALUES (?,?,?)",
        args: [id, output.length, new Date().toISOString()],
      });
      await tx.commit();
    } finally {
      tx.close();
    }
    try {
      await storage().send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: `images/${id}.webp`,
          Body: output,
          ContentType: "image/webp",
        }),
      );
    } catch (e) {
      await c.execute({ sql: "DELETE FROM images WHERE id=?", args: [id] });
      throw e;
    }
    return Response.json({ url: `/api/images?id=${id}`, size: output.length });
  } catch {
    return Response.json({ error: "图片上传失败，请确认图片格式及 R2 配置" }, { status: 400 });
  }
}
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 400 });
  try {
    const url = await getSignedUrl(
      storage(),
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: `images/${id}.webp` }),
      { expiresIn: 300 },
    );
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("图片存储尚未连接", { status: 503 });
  }
}
