import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import sharp from "sharp";
import { initialize } from "../src/lib/db";
import {
  ImageError,
  imageMarkdown,
  prepareImage,
  saveImage,
  type ImageStore,
} from "../src/lib/images";

const png = (color = "red", width = 20, height = 30) =>
  sharp({ create: { width, height, channels: 4, background: color } })
    .png()
    .toBuffer();
async function fixture() {
  const client = createClient({ url: ":memory:" });
  await initialize(client);
  const objects = new Map<string, Buffer>();
  let writes = 0;
  const store: ImageStore = {
    client,
    limit: 1_000_000,
    put: async (id, data) => {
      writes++;
      objects.set(id, data);
    },
    remove: async (id) => {
      objects.delete(id);
    },
  };
  return { client, objects, store, writes: () => writes };
}
test("images are re-encoded, sized within bounds, deduplicated, and return safe Markdown", async () => {
  const f = await fixture();
  try {
    const input = await png("red", 40, 3000);
    const saved = await saveImage(input, f.store);
    assert.equal(saved.height, 2400);
    assert.ok(saved.width <= 2400);
    assert.equal((await sharp(f.objects.get(saved.id)!).metadata()).format, "webp");
    assert.deepEqual(await saveImage(input, f.store), saved);
    assert.equal(f.writes(), 1);
    assert.equal((await f.client.execute("SELECT * FROM images")).rows.length, 1);
    assert.equal(
      Number((await f.client.execute("SELECT SUM(size) total FROM images")).rows[0].total),
      saved.size,
    );
    const markdown = imageMarkdown(saved.url, "Figure [1]\n<script>");
    assert.ok(markdown.includes("Figure \\[1\\] \\<script\\>"));
    assert.ok(!markdown.includes("\n"));
    assert.ok(markdown.endsWith(`](${saved.url})`));
  } finally {
    f.client.close();
  }
});
test("invalid formats, malformed raster images and exhausted capacity do not create objects", async () => {
  await assert.rejects(
    prepareImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ImageError,
  );
  await assert.rejects(prepareImage(Buffer.from("<html>not an image</html>")), ImageError);
  await assert.rejects(prepareImage(Buffer.from([255, 216, 255, 0])), ImageError);
  await assert.rejects(prepareImage(Buffer.alloc(20_000_001)), ImageError);
  const f = await fixture();
  try {
    f.store.limit = 1;
    await assert.rejects(
      saveImage(await png(), f.store),
      (e: unknown) => e instanceof ImageError && e.status === 413,
    );
    assert.equal(f.writes(), 0);
    assert.equal((await f.client.execute("SELECT * FROM images")).rows.length, 0);
  } finally {
    f.client.close();
  }
});
test("a failed upload releases quota after object cleanup, and can be retried", async () => {
  const f = await fixture();
  try {
    const actualPut = f.store.put;
    f.store.put = async (id, data) => {
      await actualPut(id, data);
      throw new Error("ambiguous network failure with a secret");
    };
    const input = await png();
    await assert.rejects(
      saveImage(input, f.store),
      (e: unknown) => e instanceof ImageError && !e.message.includes("secret"),
    );
    assert.equal(f.objects.size, 0);
    assert.equal((await f.client.execute("SELECT * FROM images")).rows.length, 0);
    assert.equal((await f.client.execute("SELECT * FROM image_uploads")).rows.length, 0);
    f.store.put = actualPut;
    await saveImage(input, f.store);
    assert.equal((await f.client.execute("SELECT * FROM images")).rows.length, 1);
  } finally {
    f.client.close();
  }
});
test("uncertain cleanup keeps quota reserved; retry recovers without charging twice", async () => {
  const f = await fixture();
  try {
    const put = f.store.put;
    f.store.put = async (id, data) => {
      await put(id, data);
      throw new Error("failed");
    };
    f.store.remove = async () => {
      throw new Error("cleanup unavailable");
    };
    const input = await png();
    await assert.rejects(saveImage(input, f.store), ImageError);
    const before = Number(
      (await f.client.execute("SELECT SUM(size) total FROM images")).rows[0].total,
    );
    f.store.put = put;
    await saveImage(input, f.store);
    assert.equal(
      Number((await f.client.execute("SELECT SUM(size) total FROM images")).rows[0].total),
      before,
    );
    assert.equal(
      (await f.client.execute("SELECT state FROM image_uploads")).rows[0].state,
      "complete",
    );
  } finally {
    f.client.close();
  }
});
test("concurrent uploads of identical content do not return an unfinished image", async () => {
  const f = await fixture();
  let release!: () => void, started!: () => void;
  const pending = new Promise<void>((r) => {
    release = r;
  });
  const uploading = new Promise<void>((r) => {
    started = r;
  });
  try {
    const put = f.store.put;
    f.store.put = async (id, data) => {
      started();
      await pending;
      await put(id, data);
    };
    const input = await png();
    const first = saveImage(input, f.store);
    await uploading;
    await assert.rejects(
      saveImage(input, f.store),
      (e: unknown) => e instanceof ImageError && e.status === 409,
    );
    release();
    await first;
    assert.equal(f.writes(), 1);
  } finally {
    release();
    f.client.close();
  }
});
