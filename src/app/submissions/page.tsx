import { authenticated } from "@/lib/auth";
import { canViewSubmissions } from "@/lib/submissions-access";
import SubmissionsPage from "@/components/submissions-page";
export const dynamic = "force-dynamic";
export const metadata = { title: "论文投稿 · Papertrail" };
export default async function Page() {
  return <SubmissionsPage admin={await authenticated()} unlocked={await canViewSubmissions()} />;
}
