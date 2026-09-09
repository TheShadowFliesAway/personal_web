import { test, expect } from "@playwright/test";
test("recently frequent replaces favorites and tracks direct document opens across reloads", async ({
  page,
  request,
}) => {
  const initial = await (await request.get("/api/workspace")).json();
  expect(initial.demo).toBe(true);
  const doc = initial.documents.find((d: { deletedAt: string | null }) => !d.deletedAt);
  await page.goto(`/#document/${doc.id}`);
  await expect(page.getByRole("button", { name: "收藏", exact: true })).toHaveCount(0);
  await expect
    .poll(async () => {
      const data = await (await request.get("/api/workspace")).json();
      return data.recentVisits.some((v: { id: string }) => v.id === doc.id);
    })
    .toBe(true);
  await page.locator(".nav-item").filter({ hasText: "近期常看" }).click();
  await expect(page.getByRole("heading", { name: /^近期常看/, level: 1 })).toBeVisible();
  await expect(page.locator(".document-list")).toContainText(doc.title);
  await page.reload();
  await expect(page.locator(".document-list")).toContainText(doc.title);
  await page.goto("/#favorites");
  await expect(page.getByRole("heading", { name: /^近期常看/, level: 1 })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("region", { name: "近期常看" })).toContainText(doc.title);
});
