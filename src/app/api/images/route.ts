import { guard } from "@/lib/auth";
import { ImageError, imageStorageReady, MAX_IMAGE_BYTES, saveImage } from "@/lib/images";
import { storage } from "@/lib/storage";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  if (!imageStorageReady())
    return Response.json(
      { error: "图片存储尚未配置。连接 R2 后即可粘贴、上传图片。" },
      { status: 503 },
    );
  if (Number(request.headers.get("content-length")) > 3_500_000)
    return Response.json({ error: "图片过大，请先压缩到 3 MB 以内" }, { status: 413 });
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || file.size > MAX_IMAGE_BYTES)
      return Response.json({ error: "请选择 3 MB 以内的图片" }, { status: 400 });
    return Response.json(await saveImage(Buffer.from(await file.arrayBuffer())));
  } catch (error) {
    if (error instanceof ImageError)
      return Response.json({ error: error.message }, { status: error.status });
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
