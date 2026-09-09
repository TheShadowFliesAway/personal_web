import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { initialize, ConflictError } from "../src/lib/db";
import { newDocument } from "../src/lib/model";
import { emptyTrash } from "../src/lib/trash";
test("empty trash checks confirmation and atomically cleans references, versions and visits", async () => {
  const c = createClient({ url: ":memory:" });
  try {
    await initialize(c);
    const gone = {
      ...newDocument("paper"),
      deletedAt: new Date().toISOString(),
      tags: ["保留标签"],
    };
    const kept = { ...newDocument("note"), relatedIds: [gone.id] };
    for (const d of [gone, kept]) {
      await c.execute({
        sql: "INSERT INTO documents VALUES (?,?,?,?)",
        args: [d.id, JSON.stringify(d), d.revision, d.updatedAt],
      });
      await c.execute({
        sql: "INSERT INTO versions(document_id,data,created_at) VALUES (?,?,?)",
        args: [d.id, JSON.stringify(d), d.updatedAt],
      });
    }
    const route = {
      id: "test-route",
      title: "测试",
      description: "",
      revision: 0,
      updatedAt: kept.updatedAt,
      nodes: [
        { id: "gone", paperId: gone.id },
        { id: "kept", paperId: kept.id },
      ],
      edges: [{ id: "edge", source: "gone", target: "kept" }],
    };
    await c.execute({
      sql: "INSERT INTO routes VALUES (?,?,?,?)",
      args: [route.id, JSON.stringify(route), 0, route.updatedAt],
    });
    await c.execute({
      sql: "INSERT INTO visits VALUES (?, '2026-09-09',1,?)",
      args: [gone.id, gone.updatedAt],
    });
    await assert.rejects(emptyTrash(c, [{ id: gone.id, revision: 99 }]), ConflictError);
    assert.equal((await c.execute("SELECT * FROM documents")).rows.length, 2);
    const result = await emptyTrash(c, [{ id: gone.id, revision: 0 }]);
    assert.deepEqual(result.deletedIds, [gone.id]);
    assert.deepEqual(result.documents[0].relatedIds, []);
    assert.equal(result.documents[0].revision, 1);
    assert.equal(result.routes[0].nodes.length, 1);
    assert.equal(result.routes[0].edges.length, 0);
    assert.equal(result.routes[0].revision, 1);
    assert.equal((await c.execute("SELECT * FROM documents")).rows.length, 1);
    const versions = await c.execute("SELECT data FROM versions");
    assert.equal(versions.rows.length, 1);
    assert.deepEqual(JSON.parse(String(versions.rows[0].data)).relatedIds, []);
    assert.equal((await c.execute("SELECT * FROM visits")).rows.length, 0);
    assert.equal((await c.execute("SELECT name FROM tags")).rows[0].name, "保留标签");
  } finally {
    c.close();
  }
});
