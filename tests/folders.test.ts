import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initialize } from "../src/lib/db";
import { deleteFolder, folderTree } from "../src/lib/folders";
import { newDocument } from "../src/lib/model";

test("deleting a topic moves descendants and archived notes without changing content or neighboring topics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "papertrail-folders-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  try {
    await initialize(client);
    const parent = "测试_%";
    const docs = [
      { ...newDocument("note", parent), markdown: "保留正文", revision: 3 },
      {
        ...newDocument("note", `${parent}/子主题`),
        markdown: "保留图片 ![](/api/images?id=x)",
        deletedAt: "2026-09-09",
        revision: 2,
      },
      { ...newDocument("note", `${parent}其他`), markdown: "相似前缀应保持不变", revision: 1 },
      { ...newDocument("paper", parent), markdown: "论文不受主题删除影响", revision: 1 },
    ];
    await client.batch(
      [
        ...docs.map((d) => ({
          sql: "INSERT INTO documents VALUES (?,?,?,?)",
          args: [d.id, JSON.stringify(d), d.revision, d.updatedAt],
        })),
        ...[parent, `${parent}/子主题`, `${parent}其他`].map((f) => ({
          sql: "INSERT INTO folders VALUES (?)",
          args: [f],
        })),
      ],
      "write",
    );
    const result = await deleteFolder(client, parent);
    assert.equal(result.movedCount, 2);
    assert.ok(result.folders.includes("未分类"));
    assert.ok(!result.folders.includes(`${parent}/子主题`));
    assert.ok(result.folders.includes(`${parent}其他`));
    for (let i = 0; i < 2; i++) {
      const moved = result.documents.find((d) => d.id === docs[i].id)!;
      assert.equal(moved.folder, "未分类");
      assert.equal(moved.markdown, docs[i].markdown);
      assert.equal(moved.deletedAt, docs[i].deletedAt);
      assert.equal(moved.revision, docs[i].revision + 1);
    }
    const unchanged = await client.execute({
      sql: "SELECT data FROM documents WHERE id IN (?,?)",
      args: [docs[2].id, docs[3].id],
    });
    assert.ok(unchanged.rows.every((r) => JSON.parse(String(r.data)).revision === 1));
    assert.equal((await client.execute("SELECT COUNT(*) AS n FROM versions")).rows[0].n, 2);
    await assert.rejects(deleteFolder(client, "未分类"));
    await assert.rejects(deleteFolder(client, ""));
  } finally {
    client.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("implicit parent topics and empty topics can be removed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "papertrail-empty-topic-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  try {
    await initialize(client);
    await client.execute("INSERT INTO folders VALUES ('父主题/空子主题')");
    assert.deepEqual(folderTree(["父主题/空子主题"]), ["父主题", "父主题/空子主题"]);
    const result = await deleteFolder(client, "父主题");
    assert.equal(result.movedCount, 0);
    assert.deepEqual(result.folders, []);
  } finally {
    client.close();
    await rm(dir, { recursive: true, force: true });
  }
});
