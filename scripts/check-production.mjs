import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
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
    "Production checks passed: closed demo, private APIs, login, secure cookie, tampering, rate limiting, empty cloud workspace, missing R2.",
  );
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  for (const suffix of ["", "-wal", "-shm"]) await rm(database + suffix, { force: true });
}
