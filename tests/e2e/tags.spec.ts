import { test, expect } from "@playwright/test";
test("paper recording status and reusable tags persist; deletion protects used tags", async ({
  page,
  request,
}) => {
  const workspace = await (await request.get("/api/workspace")).json();
  expect(workspace.demo).toBe(true);
  const original = workspace.documents.find(
    (d: { kind: string; deletedAt: string | null }) => d.kind === "paper" && !d.deletedAt,
  );
  const tag = `测试标签-${Date.now()}`;
  const headers = { Origin: "http://localhost:3000" };
  try {
    await page.goto(`/#document/${original.id}`);
    await page.getByRole("combobox", { name: "文章记录状态" }).selectOption({ label: "记录完成" });
    await page.getByRole("button", { name: "添加标签", exact: true }).click();
    await page.getByRole("textbox", { name: "搜索标签" }).fill(tag);
    await page.getByRole("button", { name: `新建「${tag}」`, exact: true }).click();
    await expect(page.getByRole("button", { name: `移除标签 ${tag}`, exact: true })).toBeVisible();
    await expect(page.locator(".save-indicator")).toHaveText("已保存");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "文章记录状态" })).toHaveValue("read");
    await expect(page.getByRole("button", { name: `移除标签 ${tag}`, exact: true })).toBeVisible();
    expect((await request.delete("/api/tags", { headers, data: { name: tag } })).status()).toBe(
      409,
    );
    await page.getByRole("button", { name: `移除标签 ${tag}`, exact: true }).click();
    await expect(page.locator(".save-indicator")).toHaveText("已保存");
    await page.getByRole("button", { name: "添加标签", exact: true }).click();
    await page.getByRole("textbox", { name: "搜索标签" }).fill(tag);
    await page.getByRole("checkbox", { name: tag, exact: true }).click();
    await expect(page.getByRole("checkbox", { name: tag, exact: true })).toBeChecked();
    await page.getByRole("checkbox", { name: tag, exact: true }).click();
    await expect(page.locator(".save-indicator")).toHaveText("已保存");
    await page.getByRole("button", { name: "管理标签", exact: true }).click();
    await page.getByRole("button", { name: `删除标签 ${tag}`, exact: true }).click();
    await page.getByRole("button", { name: "确认删除标签", exact: true }).click();
    await expect(page.getByRole("button", { name: `删除标签 ${tag}`, exact: true })).toHaveCount(0);
    const tags = await (await request.get("/api/tags")).json();
    expect(tags.some((t: { name: string }) => t.name === tag)).toBe(false);
  } finally {
    const current = (await (await request.get("/api/workspace")).json()).documents.find(
      (d: { id: string }) => d.id === original.id,
    );
    await request.put("/api/documents", {
      headers,
      data: { ...original, revision: current.revision },
    });
    await request.delete("/api/tags", { headers, data: { name: tag } });
  }
});

test("new note dialog supports multi-select tags on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "写学习笔记", exact: true }).first().click();
  await page.getByRole("button", { name: "添加标签", exact: true }).click();
  const options = page.getByRole("checkbox");
  await options.nth(0).click();
  await options.nth(1).click();
  await expect(page.locator(".tag-chip")).toHaveCount(2);
  await expect(page.locator('input[name="tags"]')).not.toHaveValue("[]");
  await page.getByRole("textbox", { name: "搜索标签" }).press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "取消", exact: true }).click();
});
