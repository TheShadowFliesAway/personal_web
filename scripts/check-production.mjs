import { spawn } from "node:child_process";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import assert from "node:assert/strict";

const password = randomBytes(20).toString("hex");
const salt = randomBytes(16).toString("hex");
const database = `.data/auth-test-${Date.now()}.db`;
await mkdir(".data", { recursive: true });
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", "3101", "-H", "127.0.0.1"],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DEMO_MODE: "true",
      MCP_ENABLED: "false",
      TURSO_DATABASE_URL: `file:${database}`,
      TURSO_AUTH_TOKEN: "test-token",
      ADMIN_PASSWORD_HASH: `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
      SESSION_SECRET: randomBytes(48).toString("hex"),
      R2_BUCKET_NAME: "",
    },
    stdio: ["ignore", "ignore", "pipe"],
  },
);
const base = "http://127.0.0.1:3101";
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(base);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  assert.ok(ready, "Production server should start");
  assert.equal((await fetch(`${base}/api/mcp`)).status, 503, "MCP disabled by default");
  const html = await (await fetch(base)).text();
  assert.ok(html.includes("个人访问密码"), "Production ignores DEMO_MODE and shows login");
  for (const path of [
    "workspace",
    "export",
    "versions?id=clip",
    "images?id=00000000-0000-0000-0000-000000000000",
  ])
    assert.equal(
      (await fetch(`${base}/api/${path}`)).status,
      401,
      `${path} must require authentication`,
    );
  const origin = { Origin: base, "Content-Type": "application/json" };
  assert.equal(
    (
      await fetch(`${base}/api/auth`, {
        method: "POST",
        headers: { ...origin, Origin: "https://untrusted.example" },
        body: JSON.stringify({ password }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/api/auth`, {
        method: "POST",
        headers: origin,
        body: JSON.stringify({ password: "incorrect" }),
      })
    ).status,
    401,
  );
  const login = await fetch(`${base}/api/auth`, {
    method: "POST",
    headers: origin,
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.ok(
    cookie.includes("HttpOnly") &&
      cookie.includes("Secure") &&
      cookie.toLowerCase().includes("samesite=strict"),
  );
  const headers = { ...origin, Cookie: cookie.split(";")[0] };
  const workspace = await (await fetch(`${base}/api/workspace`, { headers })).json();
  assert.deepEqual(workspace.documents, [], "Real workspace starts empty");
  assert.equal(workspace.demo, false);
  assert.equal(
    (await fetch(`${base}/api/images`, { method: "POST", headers })).status,
    503,
    "Missing R2 fails clearly",
  );
  assert.equal(
    (await fetch(`${base}/api/workspace`, { headers: { Cookie: headers.Cookie + "tampered" } }))
      .status,
    401,
  );
  // Submission viewers are independent from the private workspace session.
  assert.equal((await fetch(`${base}/api/submissions`)).status, 401);
  assert.ok((await (await fetch(`${base}/submissions`)).text()).includes("查看口令"));
  const access = (code, hdr = origin) =>
    fetch(`${base}/api/submissions/access`, {
      method: "POST",
      headers: hdr,
      body: JSON.stringify({ code }),
    });
  assert.equal((await access("wrong")).status, 401);
  assert.equal(
    (await access("zjx", { ...origin, Origin: "https://untrusted.example" })).status,
    403,
  );
  const view = await access("zjx");
  assert.equal(view.status, 200);
  const viewerCookie = view.headers.get("set-cookie").split(";")[0];
  const viewer = { ...origin, Cookie: viewerCookie };
  assert.equal((await fetch(`${base}/api/submissions`, { headers: viewer })).status, 200);
  for (const path of [
    "workspace",
    "export",
    "documents",
    "images?id=00000000-0000-0000-0000-000000000000",
  ])
    if (path !== "documents")
      assert.equal((await fetch(`${base}/api/${path}`, { headers: viewer })).status, 401);
  assert.equal(
    (
      await fetch(`${base}/api/workspace`, {
        headers: {
          Cookie: viewerCookie.replace("papertrail_submissions_view", "papertrail_session"),
        },
      })
    ).status,
    401,
    "Viewer token cannot become admin token",
  );
  const now = new Date().toISOString();
  const paper = {
    id: randomUUID(),
    title: "Submission integration test",
    authors: "Researcher",
    summary: "",
    paperGithub: "https://github.com/example/paper",
    overleaf: "https://www.overleaf.com/project/example",
    codeGithub: "",
    paperUrl: "",
    links: [],
    notes: "A note",
    revision: 0,
    createdAt: now,
    updatedAt: now,
    history: [
      {
        id: randomUUID(),
        venue: "Conference A",
        status: "rejected",
        submittedAt: "2026-01-01",
        decisionAt: "2026-03-01",
        notes: "Revise",
      },
      {
        id: randomUUID(),
        venue: "Conference B",
        status: "submitted",
        submittedAt: "2026-04-01",
        decisionAt: "",
        notes: "",
      },
    ],
  };
  const saveSubmission = (value, hdr = headers) =>
    fetch(`${base}/api/submissions`, { method: "PUT", headers: hdr, body: JSON.stringify(value) });
  assert.equal((await saveSubmission(paper, viewer)).status, 401);
  assert.equal(
    (await saveSubmission(paper, { ...headers, Origin: "https://untrusted.example" })).status,
    403,
  );
  assert.equal((await saveSubmission({ ...paper, overleaf: "javascript:alert(1)" })).status, 400);
  assert.equal(
    (
      await saveSubmission({
        ...paper,
        history: paper.history.map((h) => ({ ...h, status: "submitted", decisionAt: "" })),
      })
    ).status,
    400,
  );
  const created = await saveSubmission(paper);
  assert.equal(created.status, 200);
  const saved = await created.json();
  assert.equal(saved.revision, 1);
  assert.equal((await saveSubmission(paper)).status, 409);
  assert.ok(
    !(await (await fetch(`${base}/submissions`)).text()).includes(paper.title),
    "Locked HTML must not include private records",
  );
  const list = await fetch(`${base}/api/submissions`, { headers: viewer });
  assert.ok(list.headers.get("cache-control").includes("no-store"));
  assert.equal((await list.json()).submissions[0].history.length, 2);
  const changed = await saveSubmission({
    ...saved,
    history: saved.history.map((h, i) =>
      i === 1 ? { ...h, status: "accepted", decisionAt: "2026-05-01" } : h,
    ),
  });
  assert.equal(changed.status, 200);
  assert.equal(
    (await (await fetch(`${base}/api/export`, { headers })).json()).submissions[0].history[1]
      .status,
    "accepted",
  );
  const removeSubmission = (revision, hdr) =>
    fetch(`${base}/api/submissions`, {
      method: "DELETE",
      headers: hdr,
      body: JSON.stringify({ id: paper.id, revision }),
    });
  assert.equal((await removeSubmission(2, viewer)).status, 401);
  assert.equal((await removeSubmission(1, headers)).status, 409);
  assert.equal((await removeSubmission(2, headers)).status, 200);
  assert.equal(
    (await fetch(`${base}/api/submissions`, { headers: { Cookie: viewerCookie + "bad" } })).status,
    401,
  );
  for (let i = 0; i < 10; i++)
    await fetch(`${base}/api/auth`, {
      method: "POST",
      headers: origin,
      body: JSON.stringify({ password: "incorrect" }),
    });
  assert.equal(
    (
      await fetch(`${base}/api/auth`, {
        method: "POST",
        headers: origin,
        body: JSON.stringify({ password: "incorrect" }),
      })
    ).status,
    429,
    "Login limit persists in database",
  );
  console.log(
    "Production checks passed: closed demo, private APIs, login, secure cookie, tampering, rate limiting, empty cloud workspace, missing R2, submission access isolation/CRUD/history/conflicts/export.",
  );
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  for (const suffix of ["", "-wal", "-shm"]) await rm(database + suffix, { force: true });
}
