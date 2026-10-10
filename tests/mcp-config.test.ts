import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/lib/mcp/oauth";

test("MCP configuration diagnostics identify missing fields without exposing values", () => {
  const original = { ...process.env };
  const secret = "private-test-value-do-not-display".repeat(2);
  try {
    Object.assign(process.env, {
      NODE_ENV: "production",
      MCP_ENABLED: "true",
      TURSO_DATABASE_URL: "file:test.db",
      TURSO_AUTH_TOKEN: secret,
      ADMIN_PASSWORD_HASH: secret,
      SESSION_SECRET: secret,
      MCP_ORIGIN: "https://example.com",
      MCP_CLIENT_ID: "test",
      MCP_CLIENT_SECRET: secret,
      MCP_REDIRECT_URIS: "https://example.com/callback",
    });
    assert.equal(config().resource, "https://example.com/api/mcp");
    process.env.MCP_REDIRECT_URIS = "";
    assert.throws(() => config(), /MCP_REDIRECT_URIS/);
    process.env.MCP_REDIRECT_URIS = secret;
    assert.throws(
      () => config(),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes("MCP_REDIRECT_URIS"));
        assert.ok(!error.message.includes(secret));
        return true;
      },
    );
    process.env.MCP_ORIGIN = secret;
    assert.throws(
      () => config(),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes("MCP_ORIGIN"));
        assert.ok(!error.message.includes(secret));
        return true;
      },
    );
    process.env.MCP_ENABLED = "true ";
    assert.throws(() => config(), /MCP_ENABLED/);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});
