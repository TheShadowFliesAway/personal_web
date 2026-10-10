import { spawn } from "node:child_process";
import { randomBytes, scryptSync, createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createClient } from "@libsql/client";

const base = "http://127.0.0.1:3102",
  resource = `${base}/api/mcp`;
const database = `.data/mcp-test-${Date.now()}.db`;
const password = randomBytes(20).toString("hex"),
  salt = randomBytes(16).toString("hex");
const clientId = "papertrail-test",
  clientSecret = randomBytes(32).toString("hex");
const incomplete = process.env.MCP_TEST_INCOMPLETE === "1";
const redirectUri = "https://example.com/oauth/callback";
await mkdir(".data", { recursive: true });
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", "3102", "-H", "127.0.0.1"],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DEMO_MODE: "true",
      TURSO_DATABASE_URL: `file:${database}`,
      TURSO_AUTH_TOKEN: "test",
      ADMIN_PASSWORD_HASH: `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
      SESSION_SECRET: randomBytes(48).toString("hex"),
      R2_BUCKET_NAME: "",
      MCP_ENABLED: "true",
      MCP_ORIGIN: base,
      MCP_CLIENT_ID: clientId,
      MCP_CLIENT_SECRET: clientSecret,
      MCP_REDIRECT_URIS: incomplete ? "" : redirectUri,
    },
    stdio: ["ignore", "ignore", "pipe"],
  },
);
let stderr = "";
server.stderr.on("data", (d) => {
  stderr += d.toString();
});
const clients = [];
const hash = (s) => createHash("sha256").update(s).digest("hex");
const db = createClient({ url: `file:${database}` });
const form = (path, values, headers = {}) =>
  fetch(`${base}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(values),
  });
const tokenRequest = (values) =>
  form("/oauth/token", { client_id: clientId, client_secret: clientSecret, ...values });
async function connect(token) {
  const client = new Client({ name: "integration-test", version: "1.0.0" });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    }),
  );
  return client;
}
const call = async (client, name, args = {}) => {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, `${name}: ${JSON.stringify(result)}`);
  return JSON.parse(result.content[0].text);
};
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(base);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  assert.ok(ready, stderr);
  assert.equal(
    (await fetch(`${base}/api/workspace`)).status,
    401,
    "Demo must not bypass production login",
  );
  const metadata = await (
    await fetch(`${base}/.well-known/oauth-protected-resource/api/mcp`)
  ).json();
  assert.equal(metadata.resource, resource);
  assert.deepEqual(
    (await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json())
      .code_challenge_methods_supported,
    ["S256"],
  );
  assert.equal((await fetch(resource)).status, 401);
  assert.equal(
    (await fetch(resource, { method: "POST", headers: { Origin: "https://evil.example" } })).status,
    403,
  );
  const anon = await connect();
  const discovered = (await anon.listTools()).tools;
  assert.equal(discovered.length, 11);
  assert.deepEqual(discovered.find((t) => t.name === "create_note")._meta.securitySchemes, [
    { type: "oauth2", scopes: ["notes:write"] },
  ]);
  const wireList = await (
    await fetch(resource, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 42, method: "tools/list" }),
    })
  ).json();
  assert.deepEqual(wireList.result.tools.find((t) => t.name === "create_note").securitySchemes, [
    { type: "oauth2", scopes: ["notes:write"] },
  ]);
  const uploadTool = wireList.result.tools.find((t) => t.name === "upload_image");
  assert.deepEqual(uploadTool._meta["openai/fileParams"], ["file"]);
  assert.deepEqual(uploadTool.inputSchema.properties.file.required.sort(), [
    "download_url",
    "file_id",
  ]);
  assert.deepEqual(Object.keys(uploadTool.inputSchema.properties.file.properties).sort(), [
    "download_url",
    "file_id",
    "file_name",
    "mime_type",
  ]);
  assert.equal(uploadTool.annotations.openWorldHint, true);
  assert.equal(
    (
      await anon.callTool({
        name: "import_image",
        arguments: { url: "https://example.com/image.png" },
      })
    ).isError,
    true,
  );
  const noAuth = await anon.callTool({ name: "search_notes", arguments: {} });
  assert.equal(noAuth.isError, true);
  assert.ok(noAuth._meta["mcp/www_authenticate"]);
  const login = await fetch(`${base}/api/auth`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  if (incomplete) {
    const page = await (await fetch(`${base}/connections`, { headers: { Cookie: cookie } })).text();
    assert.ok(page.includes("服务发现已就绪"));
    assert.ok(page.includes("MCP_REDIRECT_URIS"));
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
    });
    const authPage = await (
      await fetch(`${base}/oauth/authorize?${query}`, { headers: { Cookie: cookie } })
    ).text();
    assert.ok(authPage.includes("本次客户端请求携带的回调地址"));
    assert.ok(authPage.includes(redirectUri));
    assert.ok(
      !authPage.includes('name="ticket"'),
      "No consent/code can be issued before callback configuration",
    );
    assert.equal(
      (await tokenRequest({ grant_type: "authorization_code", code: "invalid" })).status,
      503,
    );
    assert.equal(
      (
        await form(
          "/api/mcp/authorize",
          { ticket: "invalid", decision: "allow" },
          { Cookie: cookie, Origin: base },
        )
      ).status,
      503,
    );
    assert.equal(
      (
        await anon.callTool({
          name: "create_note",
          arguments: {
            requestId: "denied-create-01",
            kind: "paper",
            title: "private",
            markdown: "test",
          },
        })
      ).isError,
      true,
    );
    console.log(
      "MCP bootstrap checks passed: missing callback allows discovery and tool listing, but blocks private reads, writes, consent and token issuance.",
    );
  } else {
    let screenshotsTaken = false;
    async function authorize(scope = "notes:read notes:write") {
      const verifier = randomBytes(32).toString("base64url");
      const query = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        code_challenge_method: "S256",
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        resource,
        scope,
        state: "state-roundtrip",
      });
      const unauthorized = await (await fetch(`${base}/oauth/authorize?${query}`)).text();
      assert.ok(unauthorized.includes("个人访问密码"));
      const bad = new URLSearchParams(query);
      bad.set("redirect_uri", "https://evil.example");
      assert.ok(
        (
          await (
            await fetch(`${base}/oauth/authorize?${bad}`, { headers: { Cookie: cookie } })
          ).text()
        ).includes("客户端或回调地址未配置"),
      );
      if (process.env.MCP_SCREENSHOTS && !screenshotsTaken) {
        const { chromium } = await import("@playwright/test");
        const browser = await chromium.launch({
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/google-chrome",
          args: ["--no-sandbox"],
        });
        try {
          const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
          await page.goto(`${base}/oauth/authorize?${query}`);
          await page.getByLabel("个人访问密码").fill(password);
          await page.getByRole("button", { name: "进入学习空间" }).click();
          await page.getByRole("heading", { name: "授权连接私人笔记" }).waitFor();
          await mkdir("artifacts", { recursive: true });
          await page.screenshot({ path: "artifacts/mcp-consent.png", fullPage: true });
          await page.goto(`${base}/connections`);
          await page.getByRole("heading", { name: "ChatGPT 连接" }).waitFor();
          await page.screenshot({ path: "artifacts/mcp-connections.png", fullPage: true });
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto(`${base}/oauth/authorize?${query}`);
          await page.getByRole("heading", { name: "授权连接私人笔记" }).waitFor();
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            "Consent fits mobile viewport",
          );
          await page.screenshot({ path: "artifacts/mcp-consent-mobile.png", fullPage: true });
          await page.route("https://example.com/**", (route) =>
            route.fulfill({ body: "OAuth return" }),
          );
          await page.getByRole("button", { name: "取消", exact: true }).click();
          await page.waitForURL((url) => url.origin === "https://example.com");
          assert.equal(new URL(page.url()).searchParams.get("error"), "access_denied");
          screenshotsTaken = true;
        } finally {
          await browser.close();
        }
      }
      const html = await (
        await fetch(`${base}/oauth/authorize?${query}`, { headers: { Cookie: cookie } })
      ).text();
      const ticket = html.match(/name="ticket" value="([^"]+)"/)?.[1];
      assert.ok(ticket, "Consent form renders ticket");
      const approval = { ticket, decision: "allow" };
      assert.equal(
        (
          await form("/api/mcp/authorize", approval, {
            Cookie: cookie,
            Origin: "https://evil.example",
          })
        ).status,
        403,
      );
      const approved = await form("/api/mcp/authorize", approval, { Cookie: cookie, Origin: base });
      assert.equal(approved.status, 303);
      assert.equal(
        (await form("/api/mcp/authorize", approval, { Cookie: cookie, Origin: base })).status,
        400,
        "Consent replay rejected",
      );
      const location = new URL(approved.headers.get("location"));
      assert.equal(location.searchParams.get("state"), "state-roundtrip");
      const params = {
        grant_type: "authorization_code",
        code: location.searchParams.get("code"),
        code_verifier: verifier,
        redirect_uri: redirectUri,
        resource,
      };
      assert.equal((await tokenRequest({ ...params, client_secret: "bad" })).status, 401);
      assert.equal(
        (await tokenRequest({ ...params, code_verifier: randomBytes(32).toString("base64url") }))
          .status,
        400,
      );
      assert.equal(
        (await tokenRequest({ ...params, resource: "https://evil.example/api/mcp" })).status,
        400,
      );
      const response = await tokenRequest(params);
      assert.equal(response.status, 200);
      const tokens = await response.json();
      assert.equal((await tokenRequest(params)).status, 400, "Code replay rejected");
      return tokens;
    }
    const tokens = await authorize();
    const client = await connect(tokens.access_token);
    assert.deepEqual((await call(client, "search_notes")).notes, []);
    const markdown =
      "# CLIP\n\n行内 $h_A=[1,0]$\n\n$$\\mathrm{sim}(x,y)$$\n\n```python\nprint('hello')\n```\n";
    const args = {
      requestId: "create-clip-0001",
      kind: "paper",
      title: "CLIP",
      markdown,
      url: "https://arxiv.org/abs/2103.00020",
      tags: ["VLM"],
      status: "reading",
    };
    const missingStorage = await client.callTool({
      name: "import_image",
      arguments: { url: "https://example.com/image.png" },
    });
    assert.equal(missingStorage.isError, true);
    assert.ok(missingStorage.content[0].text.includes("R2"));
    const clip = await call(client, "create_note", args);
    assert.deepEqual(
      await call(client, "create_note", args),
      clip,
      "Write retry returns original receipt",
    );
    assert.equal(
      (await client.callTool({ name: "create_note", arguments: { ...args, title: "different" } }))
        .isError,
      true,
    );
    assert.equal((await call(client, "get_note", { id: clip.id })).markdown, markdown);
    const blip = await call(client, "create_note", {
      ...args,
      requestId: "create-blip-0001",
      title: "BLIP",
      markdown: "BLIP 笔记",
    });
    const blip2 = await call(client, "create_note", {
      ...args,
      requestId: "create-blip2-0001",
      title: "BLIP-2",
      markdown: "BLIP-2 笔记",
    });
    const note = await call(client, "create_note", {
      requestId: "create-study-0001",
      kind: "note",
      title: "PyTorch",
      markdown: "学习",
      folder: "编程与工具/PyTorch",
      tags: ["工具"],
    });
    const org = await call(client, "list_organization");
    assert.ok(org.tags.includes("VLM"));
    assert.ok(org.folders.includes("编程与工具/PyTorch"));
    assert.equal(
      (await call(client, "search_notes", { query: "CLIP", tag: "VLM", kind: "paper" })).notes
        .length,
      1,
    );
    assert.equal((await call(client, "search_notes", { limit: 2 })).nextOffset, 2);
    const routeArgs = {
      requestId: "create-route-0001",
      title: "VLM",
      description: "示例关系",
      paperIds: [clip.id, blip.id, blip2.id],
      relations: [
        { source: clip.id, target: blip.id, label: "对比学习" },
        { source: clip.id, target: blip2.id, label: "另一分支" },
      ],
    };
    const route = await call(client, "create_route", routeArgs);
    const graph = await call(client, "get_route", { id: route.id });
    assert.equal(graph.nodes[1].position.x, graph.nodes[2].position.x);
    assert.notEqual(graph.nodes[1].position.y, graph.nodes[2].position.y);
    assert.equal((await call(client, "list_routes")).routes.length, 1);
    await call(client, "update_route", {
      ...routeArgs,
      requestId: "update-route-0001",
      id: route.id,
      expectedRevision: 1,
      title: "VLM 发展路线",
    });
    assert.equal(
      (
        await client.callTool({
          name: "create_route",
          arguments: {
            ...routeArgs,
            requestId: "invalid-route-001",
            paperIds: [note.id],
            relations: [],
          },
        })
      ).isError,
      true,
    );
    assert.equal(
      (
        await client.callTool({
          name: "create_route",
          arguments: {
            ...routeArgs,
            requestId: "cyclic-route-001",
            relations: [...routeArgs.relations, { source: blip.id, target: clip.id }],
          },
        })
      ).isError,
      true,
    );
    // Simulate rich editor data, ensuring metadata edits keep blocks and Markdown writes clear them.
    const row = await db.execute({ sql: "SELECT data FROM documents WHERE id=?", args: [clip.id] });
    const rich = JSON.parse(row.rows[0].data);
    rich.blocks = [{ type: "paragraph", content: "old" }];
    await db.execute({
      sql: "UPDATE documents SET data=? WHERE id=?",
      args: [JSON.stringify(rich), clip.id],
    });
    await call(client, "update_note", {
      requestId: "update-clip-0001",
      id: clip.id,
      expectedRevision: 1,
      patch: { summary: "metadata" },
    });
    assert.deepEqual(
      JSON.parse(
        (await db.execute({ sql: "SELECT data FROM documents WHERE id=?", args: [clip.id] }))
          .rows[0].data,
      ).blocks,
      rich.blocks,
    );
    const edited = await call(client, "update_note", {
      requestId: "update-clip-0002",
      id: clip.id,
      expectedRevision: 2,
      patch: { markdown: markdown + "补充内容" },
    });
    assert.equal(edited.revision, 3);
    const saved = JSON.parse(
      (await db.execute({ sql: "SELECT data FROM documents WHERE id=?", args: [clip.id] })).rows[0]
        .data,
    );
    assert.equal(saved.blocks, null);
    assert.equal(
      Number(
        (
          await db.execute({
            sql: "SELECT COUNT(*) n FROM versions WHERE document_id=?",
            args: [clip.id],
          })
        ).rows[0].n,
      ),
      2,
      "Every MCP update has history",
    );
    assert.equal(
      (
        await client.callTool({
          name: "update_note",
          arguments: {
            requestId: "stale-clip-0001",
            id: clip.id,
            expectedRevision: 1,
            patch: { title: "stale" },
          },
        })
      ).isError,
      true,
    );
    const readonly = await authorize("notes:read");
    const reader = await connect(readonly.access_token);
    const deniedImage = await reader.callTool({
      name: "upload_image",
      arguments: { file: { download_url: "https://example.com/image.png", file_id: "file-test" } },
    });
    assert.equal(deniedImage.isError, true);
    assert.ok(deniedImage._meta["mcp/www_authenticate"]);
    assert.ok((await call(reader, "search_notes")).notes.length);
    assert.equal(
      (
        await reader.callTool({
          name: "create_note",
          arguments: { ...args, requestId: "forbidden-write1" },
        })
      ).isError,
      true,
    );
    const refresh = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      resource,
    });
    assert.equal(refresh.status, 200);
    const rotated = await refresh.json();
    assert.equal(
      (await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }))
        .status,
      400,
    );
    const renewed = await connect(rotated.access_token);
    await call(renewed, "search_notes");
    assert.equal(
      (
        await form("/oauth/revoke", {
          token: rotated.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
        })
      ).status,
      200,
    );
    const rpc = (token) =>
      fetch(resource, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
    assert.equal((await rpc(tokens.access_token)).status, 401);
    assert.equal((await rpc(rotated.access_token)).status, 401);
    const secretRows = await db.execute("SELECT hash,data FROM mcp_credentials");
    assert.ok(!JSON.stringify(secretRows.rows).includes(readonly.access_token));
    await db.execute({
      sql: "UPDATE mcp_credentials SET expires=0 WHERE hash=?",
      args: [hash(readonly.access_token)],
    });
    assert.equal((await rpc(readonly.access_token)).status, 401, "Expired access token rejected");
    const exported = await (
      await fetch(`${base}/api/export`, { headers: { Cookie: cookie } })
    ).text();
    assert.ok(!exported.includes("mcp_credentials") && !exported.includes(clientSecret));
    assert.equal(
      (await form("/api/mcp/connections", {}, { Cookie: cookie, Origin: base })).status,
      303,
    );
    assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM mcp_credentials")).rows[0].n), 0);
    console.log(
      "MCP checks passed: real SDK, OAuth login/consent/PKCE, replay/CSRF/redirect rejection, scopes, refresh/revoke/expiry, private data, note/route CRUD, branches, revisions, idempotency and history.",
    );
  }
} catch (e) {
  console.error(stderr);
  throw e;
} finally {
  for (const client of clients) await client.close().catch(() => {});
  db.close();
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  for (const suffix of ["", "-wal", "-shm"]) await rm(database + suffix, { force: true });
}
