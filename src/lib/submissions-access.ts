import { cookies } from "next/headers";
import { authenticated, verifySession } from "./auth";
import { isConfigured } from "./db";
export const SUBMISSIONS_COOKIE = "papertrail_submissions_view";
export function submissionsSecret() {
  return `submissions-view:${process.env.SESSION_SECRET || "development-only"}`;
}
export async function canViewSubmissions() {
  if (!isConfigured()) return false;
  if (await authenticated()) return true;
  const token = (await cookies()).get(SUBMISSIONS_COOKIE)?.value;
  return Boolean(token && verifySession(token, submissionsSecret()));
}
