import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isConfigured, isDemo } from "./db";
export const COOKIE = "papertrail_session";
export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function checkPassword(password: string, encoded: string) {
  const [salt, hash] = encoded.split(":");
  if (!salt || !hash || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
export function signSession(secret: string, expires = Date.now() + 7 * 86400_000) {
  const payload = `${expires}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}
export function verifySession(token: string, secret: string) {
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || Number(parts[0]) <= Date.now()) return false;
  const signature = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest("hex");
  return (
    parts[2].length === signature.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(parts[2]))
  );
}
export async function authenticated() {
  if (isDemo()) return true;
  if (!isConfigured()) return false;
  const token = (await cookies()).get(COOKIE)?.value;
  return Boolean(token && verifySession(token, process.env.SESSION_SECRET!));
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      url.host === (request.headers.get("host") || new URL(request.url).host)
    );
  } catch {
    return false;
  }
}
export async function guard(request: Request, mutation = false) {
  if (!(await authenticated())) return Response.json({ error: "请先登录" }, { status: 401 });
  if (mutation && !sameOrigin(request))
    return Response.json({ error: "请求来源无效" }, { status: 403 });
  return null;
}
