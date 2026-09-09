import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPassword, hashPassword, signSession, verifySession } from "../src/lib/auth";
import { documentSchema, newDocument, routeSchema } from "../src/lib/model";
import { isDemo } from "../src/lib/db";
test("passwords are salted and verified without storing plaintext", () => {
  const hash = hashPassword("test-private-password");
  assert.ok(checkPassword("test-private-password", hash));
  assert.ok(!checkPassword("wrong", hash));
  assert.ok(!checkPassword("wrong", "broken"));
  assert.notEqual(hash, hashPassword("test-private-password"));
});
test("sessions reject tampering, expiration, and wrong signing key", () => {
  const key = "test-secret-abcdefghijklmnopqrstuvwxyz";
  const session = signSession(key);
  assert.ok(verifySession(session, key));
  assert.ok(!verifySession(session, "wrong"));
  assert.ok(!verifySession(session + "x", key));
  assert.ok(!verifySession(signSession(key, Date.now() - 1), key));
  assert.ok(!verifySession("NaN.invalid.signature", key));
});
test("production can never enable the unauthenticated demo", () => {
  const env = process.env as Record<string, string | undefined>;
  const oldNode = env.NODE_ENV,
    oldDemo = env.DEMO_MODE;
  env.NODE_ENV = "production";
  env.DEMO_MODE = "true";
  assert.equal(isDemo(), false);
  env.NODE_ENV = oldNode;
  env.DEMO_MODE = oldDemo;
});
test("document validation rejects executable links and unbounded fields", () => {
  const doc = newDocument("paper");
  assert.ok(documentSchema.safeParse(doc).success);
  assert.ok(!documentSchema.safeParse({ ...doc, url: "javascript:alert(1)" }).success);
  assert.ok(!documentSchema.safeParse({ ...doc, title: "x".repeat(301) }).success);
});
test("research routes allow branches and merges but reject dangling or duplicate links", () => {
  const route = {
    id: "r",
    title: "VLM",
    description: "",
    updatedAt: "now",
    revision: 0,
    nodes: ["a", "b", "c", "d"].map((id) => ({ id, paperId: id, position: { x: 0, y: 0 } })),
    edges: [
      { id: "1", source: "a", target: "b", label: "branch" },
      { id: "2", source: "a", target: "c", label: "branch" },
      { id: "3", source: "b", target: "d", label: "merge" },
      { id: "4", source: "c", target: "d", label: "merge" },
    ],
  };
  assert.ok(routeSchema.safeParse(route).success);
  assert.ok(
    !routeSchema.safeParse({
      ...route,
      edges: [{ id: "x", source: "a", target: "missing", label: "" }],
    }).success,
  );
  assert.ok(!routeSchema.safeParse({ ...route, edges: [route.edges[0], route.edges[0]] }).success);
});
