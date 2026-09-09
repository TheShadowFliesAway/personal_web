import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
import { defaultHomeCopy } from "../src/lib/home-copy";
import { demoWorkspace } from "../src/lib/seed";

test("JSON restore preserves relations and refuses an existing database", async () => {
  const dir = await mkdtemp(join(tmpdir(), "papertrail-restore-"));
  const file = join(dir, "backup.json");
  const url = `file:${join(dir, "restored.db")}`;
  try {
    await writeFile(
      file,
      JSON.stringify({
        format: "papertrail-v1",
        ...demoWorkspace(),
        tagLibrary: ["可复用的空标签"],
        imageManifest: [],
        versions: [],
      }),
    );
    const run = () =>
      spawnSync(process.execPath, ["--import", "tsx", "scripts/restore-backup.ts", file], {
        env: {
          ...process.env,
          DEMO_MODE: "false",
          TURSO_DATABASE_URL: url,
          TURSO_AUTH_TOKEN: "local-test-only",
        },
        encoding: "utf8",
      });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const client = createClient({ url });
    const docs = await client.execute("SELECT COUNT(*) AS n FROM documents");
    assert.equal(Number(docs.rows[0].n), 7);
    const route = await client.execute("SELECT data FROM routes WHERE id='vlm'");
    assert.equal(JSON.parse(String(route.rows[0].data)).edges.length, 4);
    const settings = await client.execute("SELECT value FROM settings WHERE key='home-copy'");
    assert.deepEqual(JSON.parse(String(settings.rows[0].value)), defaultHomeCopy);
    const tags = await client.execute("SELECT name FROM tags");
    assert.deepEqual(
      tags.rows.map((r) => r.name),
      ["可复用的空标签"],
    );
    client.close();
    const second = run();
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /不是空的/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
