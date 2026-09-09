import { test, expect } from "@playwright/test";

test("notes have topics instead of reading status in all views; papers retain status", async ({
  page,
  request,
}) => {
  const workspace = await (await request.get("/api/workspace")).json();
  expect(workspace.demo).toBe(true);
  const notes = workspace.documents.filter(
    (d: { kind: string; deletedAt: string | null }) => d.kind === "note" && !d.deletedAt,
  );
  const paper = workspace.documents.find(
    (d: { kind: string; deletedAt: string | null }) => d.kind === "paper" && !d.deletedAt,
  );
  await page.goto("/#papers");
  await page.getByRole("combobox", { name: "记录状态", exact: true }).selectOption("reading");
  await page.locator(".nav-item").filter({ hasText: "学习笔记" }).click();
  await expect(page.getByRole("combobox", { name: "记录状态", exact: true })).toHaveCount(0);
  await expect(page.locator(".document-row")).toHaveCount(notes.length);
  await expect(page.locator(".document-list .status")).toHaveCount(0);
  await expect(page.locator(".list-header")).toContainText("学习主题");
  await page.getByRole("button", { name: "卡片视图" }).click();
  await expect(page.locator(".paper-card")).toHaveCount(notes.length);
  await expect(page.locator(".paper-card .status")).toHaveCount(0);
  await expect(page.locator(".paper-card .paper-year").first()).toContainText("NOTE /");
  await page.goto(`/#document/${notes[0].id}`);
  await expect(page.getByRole("combobox", { name: "学习主题", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "文章记录状态" })).toHaveCount(0);
  await page.goto(`/#document/${paper.id}`);
  await expect(page.getByRole("combobox", { name: "文章记录状态" })).toBeVisible();
});

test("home prioritizes recent writing and keeps reading progress within the paper panel", async ({
  page,
  request,
}) => {
  const workspace = await (await request.get("/api/workspace")).json();
  expect(workspace.demo).toBe(true);
  const recent = workspace.documents
    .filter((d: { deletedAt: string | null }) => !d.deletedAt)
    .sort((a: { updatedAt: string }, b: { updatedAt: string }) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "最近编辑", exact: true })).toBeVisible();
  await expect(page.locator(".home-recent-item strong").first()).toHaveText(
    recent[0].title || "未命名",
  );
  await expect(page.locator(".home-recent .status")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "论文记录进度", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "写学习笔记", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toContainText("写一篇学习笔记");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator(".home-recent-item").first().click();
  await expect(page.getByRole("textbox", { name: "文章标题" })).toHaveValue(recent[0].title);
});
