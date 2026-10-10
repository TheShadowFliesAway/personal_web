import { createHash, randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { db } from "./db";
import { storage } from "./storage";

export class ImageError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const MAX_IMAGE_SOURCE_BYTES = 20_000_000;
export const MAX_IMAGE_BYTES = 3_000_000;
export function imageStorageReady() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME,
  );
}
export function requireImageStorage() {
  if (!imageStorageReady()) throw new ImageError("图片存储尚未配置，请先连接 R2。", 503);
}
function rasterSignature(input: Buffer) {
  return (
    input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    input.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
    ["GIF87a", "GIF89a"].includes(input.subarray(0, 6).toString("ascii")) ||
    (input.subarray(0, 4).toString("ascii") === "RIFF" &&
      input.subarray(8, 12).toString("ascii") === "WEBP") ||
    (input.subarray(4, 8).toString("ascii") === "ftyp" &&
      ["avif", "avis"].includes(input.subarray(8, 12).toString("ascii")))
  );
}
export async function prepareImage(input: Buffer) {
  if (!input.length || input.length > MAX_IMAGE_SOURCE_BYTES)
    throw new ImageError("原始图片必须在 20 MB 以内。", 413);
  // Reject SVG/PDF/HTML before invoking any vector/document decoder.
  if (!rasterSignature(input))
    throw new ImageError(
      "仅支持 PNG、JPEG、WebP、GIF 和 AVIF 图片；PDF 请先提取插图，SVG 请先转成 PNG。",
    );
  try {
    const { data, info } = await sharp(input, { limitInputPixels: 40_000_000, animated: false })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .timeout({ seconds: 10 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > MAX_IMAGE_BYTES)
      throw new ImageError("图片压缩后仍超过 3 MB，请缩小后重试。", 413);
    return { data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof ImageError) throw error;
    throw new ImageError("无法解码图片，图片可能损坏或超过 4000 万像素限制。");
  }
}
export type ImageStore = {
  client: Client;
  limit: number;
  put: (id: string, bytes: Buffer) => Promise<void>;
  remove: (id: string) => Promise<void>;
};
function productionStore(client: Client): ImageStore {
  requireImageStorage();
  const s3 = storage(),
    bucket = process.env.R2_BUCKET_NAME;
  const configured = Number(process.env.IMAGE_STORAGE_LIMIT_MB || 1024);
  return {
    client,
    limit: (Number.isFinite(configured) && configured > 0 ? configured : 1024) * 1024 * 1024,
    put: async (id, bytes) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `images/${id}.webp`,
          Body: bytes,
          ContentType: "image/webp",
        }),
        { abortSignal: AbortSignal.timeout(15_000) },
      );
    },
    remove: async (id) => {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: `images/${id}.webp` }), {
        abortSignal: AbortSignal.timeout(10_000),
      });
    },
  };
}
export async function saveImage(input: Buffer, store?: ImageStore) {
  if (!store) requireImageStorage();
  const { data, width, height } = await prepareImage(input);
  const backend = store || productionStore(await db());
  // A stable content-derived UUID deduplicates retries, including refreshed file download URLs.
  const hash = createHash("sha256").update(data).digest("hex").slice(0, 32);
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
  const result = {
    id,
    url: `/api/images?id=${id}`,
    size: data.length,
    width,
    height,
    mimeType: "image/webp",
  };
  const lease = randomUUID(),
    now = Date.now(),
    c = backend.client;
  const tx = await c.transaction("write");
  try {
    const [image, upload] = await tx.batch([
      { sql: "SELECT id FROM images WHERE id=?", args: [id] },
      { sql: "SELECT state,expires FROM image_uploads WHERE id=?", args: [id] },
    ]);
    if (image.rows[0] && (!upload.rows[0] || upload.rows[0].state === "complete")) {
      await tx.commit();
      return result;
    }
    if (upload.rows[0]?.state === "uploading" && Number(upload.rows[0].expires) > now)
      throw new ImageError("同一张图片正在保存，请稍后重试。", 409);
    if (!image.rows[0]) {
      const used = await tx.execute("SELECT COALESCE(SUM(size),0) AS bytes FROM images");
      if (Number(used.rows[0].bytes) + data.length > backend.limit)
        throw new ImageError("已达到图片容量上限，请调整容量或清理存储。", 413);
      await tx.execute({
        sql: "INSERT INTO images VALUES (?,?,?)",
        args: [id, data.length, new Date().toISOString()],
      });
    }
    await tx.execute({
      sql: "INSERT INTO image_uploads VALUES (?,'uploading',?,?) ON CONFLICT(id) DO UPDATE SET state='uploading',lease=excluded.lease,expires=excluded.expires",
      args: [id, lease, now + 120_000],
    });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
  try {
    await backend.put(id, data);
    const done = await c.execute({
      sql: "UPDATE image_uploads SET state='complete',expires=0 WHERE id=? AND lease=?",
      args: [id, lease],
    });
    if (!done.rowsAffected) throw new Error("Upload lease expired");
    return result;
  } catch {
    const current = await c.execute({
      sql: "SELECT lease FROM image_uploads WHERE id=?",
      args: [id],
    });
    if (current.rows[0]?.lease === lease) {
      let removed = false;
      try {
        await backend.remove(id);
        removed = true;
      } catch {
        /* Retain quota if object cleanup is uncertain. */
      }
      const cleanup = await c.transaction("write");
      try {
        if (removed) {
          await cleanup.execute({
            sql: "DELETE FROM images WHERE id=? AND EXISTS (SELECT 1 FROM image_uploads WHERE id=? AND lease=?)",
            args: [id, id, lease],
          });
          await cleanup.execute({
            sql: "DELETE FROM image_uploads WHERE id=? AND lease=?",
            args: [id, lease],
          });
        } else
          await cleanup.execute({
            sql: "UPDATE image_uploads SET state='failed',expires=0 WHERE id=? AND lease=?",
            args: [id, lease],
          });
        await cleanup.commit();
      } catch (e) {
        await cleanup.rollback();
        throw e;
      } finally {
        cleanup.close();
      }
    }
    throw new ImageError("图片保存失败，请检查 R2 配置并重试；重试同一图片不会重复占用容量。", 503);
  }
}
export function imageMarkdown(url: string, alt: string) {
  // Escape user text so it cannot close the image syntax or inject extra blocks.
  const safe = alt.replace(/[\r\n\u0000-\u001f]/g, " ").replace(/[\\\[\]<>]/g, (c) => `\\${c}`);
  return `![${safe}](${url})`;
}
