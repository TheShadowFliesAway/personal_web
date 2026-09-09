import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { initialize } from "../src/lib/db";
import { newDocument } from "../src/lib/model";
import { recentVisits, recordVisit } from "../src/lib/visits";
test("visits deduplicate, rank within 30 days, exclude invalid documents and leave editing metadata unchanged", async () => {
  const c = createClient({ url: ":memory:" });
  try {
    await initialize(c);
    const d = newDocument("paper");
    await c.execute({
      sql: "INSERT INTO documents VALUES (?,?,?,?)",
      args: [d.id, JSON.stringify(d), 0, d.updatedAt],
    });
    assert.equal(await recordVisit(c, d.id), true);
    await recordVisit(c, d.id);
    assert.equal((await recentVisits(c))[0].count, 1);
    assert.equal(await recordVisit(c, "missing"), false);
    const old = new Date(Date.now() - 3600000).toISOString();
    await c.execute({ sql: "UPDATE visits SET last_viewed_at=?", args: [old] });
    await recordVisit(c, d.id);
    assert.equal((await recentVisits(c))[0].count, 2);
    await c.execute({
      sql: "INSERT INTO visits VALUES ('expired','2000-01-01',100,'2000-01-01T00:00:00Z')",
      args: [],
    });
    assert.equal((await recentVisits(c)).length, 1);
    const saved = await c.execute({ sql: "SELECT data FROM documents WHERE id=?", args: [d.id] });
    assert.deepEqual(JSON.parse(String(saved.rows[0].data)), d);
    await c.execute({
      sql: "UPDATE documents SET data=? WHERE id=?",
      args: [JSON.stringify({ ...d, deletedAt: new Date().toISOString() }), d.id],
    });
    assert.equal(await recordVisit(c, d.id), false);
  } finally {
    c.close();
  }
});
