import { test, expect } from "@playwright/test";

test("topic names expand children and filter notes; arrows only toggle", async ({
  page,
  request,
}) => {
  const workspace = await (await request.get("/api/workspace")).json();
  expect(workspace.demo).toBe(true);
  await page.goto("/");
  const tree = page.getByRole("navigation", { name: "学习主题目录" });
  await tree.getByRole("button", { name: "兴趣爱好", exact: true }).click();
  await expect(tree.getByRole("button", { name: "音乐", exact: true })).toBeVisible();
  await expect(tree.getByRole("button", { name: "兴趣爱好", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const expected = workspace.documents.filter(
    (d: { kind: string; deletedAt: string | null; folder: string }) =>
      d.kind === "note" &&
      !d.deletedAt &&
      (d.folder === "兴趣爱好" || d.folder.startsWith("兴趣爱好/")),
  );
  await expect(page.locator(".document-row")).toHaveCount(expected.length);
  await tree.getByRole("button", { name: "音乐", exact: true }).click();
  await expect(tree.getByRole("button", { name: "音乐", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await tree.getByRole("button", { name: "收起主题 兴趣爱好", exact: true }).click();
  await expect(tree.getByRole("button", { name: "音乐", exact: true })).toHaveCount(0);
  await tree.getByRole("button", { name: "展开主题 兴趣爱好", exact: true }).press("Enter");
  await expect(tree.getByRole("button", { name: "音乐", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(tree.getByRole("button", { name: "展开主题 未分类", exact: true })).toHaveCount(0);
});

test("implicit parents and deeply nested topics expand without navigation", async ({ page }) => {
  await page.route("**/api/workspace", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.folders.push("测试目录/子主题/更深一层");
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  const tree = page.getByRole("navigation", { name: "学习主题目录" });
  await tree.getByRole("button", { name: "展开主题 测试目录", exact: true }).click();
  await tree.getByRole("button", { name: "展开主题 测试目录/子主题", exact: true }).click();
  await expect(tree.getByRole("button", { name: "更深一层", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近编辑", exact: true })).toBeVisible();
});
