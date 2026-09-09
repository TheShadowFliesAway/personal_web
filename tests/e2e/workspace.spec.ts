import { test, expect } from "@playwright/test";
import { newDocument } from "../../src/lib/model";
test.beforeEach(async ({ request }) => {
  const res = await request.get("/api/workspace");
  expect((await res.json()).demo, "E2E tests must only run against the demo workspace").toBe(true);
});

test("topic deletion confirms descendants, preserves unsaved notes, and persists after reload", async ({
  page,
  request,
}) => {
  const parent = `待删除主题 ${Date.now()}`;
  const folder = `${parent}/子主题`;
  const doc = {
    ...newDocument("note", folder),
    title: `主题删除验证 ${Date.now()}`,
    markdown: "原始内容",
  };
  const headers = { Origin: "http://localhost:3000" };
  expect((await request.put("/api/documents", { headers, data: doc })).status()).toBe(200);
  await page.goto(`/#document/${doc.id}`);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await page.getByRole("textbox", { name: "Markdown 正文" }).fill("删除主题之前的最新理解");
  await page.getByRole("button", { name: "管理学习主题", exact: true }).click();
  await page.getByRole("button", { name: `删除主题 ${parent}`, exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("1 个子主题");
  await expect(page.getByRole("dialog")).toContainText("1 篇笔记");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("button", { name: `删除主题 ${parent}`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `删除主题 ${parent}`, exact: true }).click();
  await page.getByRole("button", { name: "确认删除主题" }).click();
  await expect(page.getByRole("button", { name: `删除主题 ${parent}`, exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "管理主题", exact: true }).click();
  await expect(page.getByRole("button", { name: `删除主题 ${folder}`, exact: true })).toHaveCount(
    0,
  );
  const data = await (await request.get("/api/workspace")).json();
  const saved = data.documents.find((d: { id: string }) => d.id === doc.id);
  expect(saved.folder).toBe("未分类");
  expect(saved.markdown).toBe("删除主题之前的最新理解");
  expect(
    (
      await request.delete("/api/folders", {
        headers: { Origin: "https://untrusted.example" },
        data: { name: "未分类" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await request.delete("/api/folders", { headers, data: { name: "未分类" } })).status(),
  ).toBe(400);
});
const title = `测试笔记 ${Date.now()}`;
test("write Markdown, save, reload, search, trash, and restore", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "让知识，连成自己的路。" })).toBeVisible();
  await page.getByRole("button", { name: /今天，又学到了什么/ }).click();
  await page.getByRole("textbox", { name: "标题", exact: true }).fill(title);
  await page.getByRole("button", { name: "创建并开始" }).click();
  await expect(page.getByRole("textbox", { name: "文章标题" })).toHaveValue(title);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Markdown 正文" })
    .fill("## 自动化验证\n\n跨设备需要可靠的云端保存。\n\n```python\nprint('hello')\n```\n");
  await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
  await page.getByRole("button", { name: "块编辑", exact: true }).click();
  await expect(page.locator(".bn-editor h2")).toHaveText("自动化验证");
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "全局搜索" }).click();
  await page.getByPlaceholder("搜索论文、笔记、代码或标签…").fill(title);
  await page.locator(".search-results button").filter({ hasText: title }).click();
  await expect(page.locator(".bn-editor")).toContainText("跨设备需要可靠的云端保存");
  await page.getByRole("button", { name: "收藏", exact: true }).click();
  await expect(page.getByRole("button", { name: "取消收藏" })).toBeVisible();
  await page.getByRole("button", { name: "移到回收站", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "移到回收站", exact: true }).click();
  await page.getByRole("button", { name: "回收站", exact: true }).click();
  await page
    .locator(".document-row")
    .filter({ hasText: title })
    .getByRole("button", { name: "恢复", exact: true })
    .click();
  await expect(page.locator(".document-row").filter({ hasText: title })).toHaveCount(0);
});
test("route supports branching, graph, list, and persisted relation labels", async ({ page }) => {
  await page.goto("/");
  await page.locator(".nav-item").filter({ hasText: "研究路线" }).click();
  await page.getByRole("button", { name: "新建路线" }).click();
  const route = `测试路线 ${Date.now()}`;
  await page.getByRole("textbox", { name: "标题", exact: true }).fill(route);
  await page.getByRole("button", { name: "创建并开始" }).click();
  for (const name of ["CLIP", "BLIP", "BLIP-2"]) {
    await page.getByRole("button", { name: "添加论文", exact: true }).first().click();
    await page.getByPlaceholder("搜索论文标题或标签…").fill(name);
    await page
      .getByRole("dialog")
      .locator(".search-results button")
      .filter({ has: page.getByText(name, { exact: true }) })
      .click();
  }
  await expect(page.locator(".graph-paper")).toHaveCount(3);
  for (const target of ["BLIP", "BLIP-2"]) {
    await page.getByRole("button", { name: "添加关联" }).click();
    await page.getByLabel("起点", { exact: true }).selectOption({ label: "CLIP" });
    await page.getByLabel("后续论文").selectOption({ label: target });
    await page.getByRole("button", { name: "建立关联" }).click();
    await page.getByRole("textbox", { name: "关系说明" }).fill(`通向 ${target}`);
    await page.getByRole("button", { name: "关闭关系编辑" }).click();
  }
  await page.getByRole("button", { name: "关联列表" }).click();
  await expect(page.locator(".route-list-edge")).toHaveCount(2);
  await page.getByRole("button", { name: "全部路线" }).click();
  await page.reload();
  await page.locator(".nav-item").filter({ hasText: "研究路线" }).click();
  await page.locator(".route-tile").filter({ hasText: route }).click();
  await expect(page.locator(".graph-paper")).toHaveCount(3);
  await page.getByRole("button", { name: "关联列表" }).click();
  await expect(page.getByRole("textbox", { name: "关系说明" }).first()).toHaveValue("通向 BLIP");
});
test("API rejects stale writes and cross-origin writes", async ({ request }) => {
  const data = await (await request.get("/api/workspace")).json();
  const doc = data.documents.find((d: { id: string }) => d.id === "clip");
  const headers = { Origin: "http://localhost:3000" };
  expect((await request.put("/api/documents", { headers, data: doc })).status()).toBe(200);
  expect((await request.put("/api/documents", { headers, data: doc })).status()).toBe(409);
  expect(
    (
      await request.put("/api/documents", {
        headers: { Origin: "https://other.example" },
        data: doc,
      })
    ).status(),
  ).toBe(403);
});
test("mobile navigation and layouts fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "让知识，连成自己的路。" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.locator(".nav-item").filter({ hasText: "论文库" }).click();
  await page.locator(".row-main").filter({ hasText: "BLIP-2" }).click();
  await expect(page.getByRole("textbox", { name: "文章标题" })).toHaveValue("BLIP-2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("block editing, Markdown import, formula preview and history", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /今天，又学到了什么/ }).click();
  const name = `块编辑验证 ${Date.now()}`;
  await page.getByRole("textbox", { name: "标题", exact: true }).fill(name);
  await page.getByRole("button", { name: "创建并开始" }).click();
  const editor = page.locator(".bn-editor");
  await editor.click();
  await page.keyboard.type("A thought worth keeping.");
  await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
  await page.reload();
  await expect(editor).toContainText("A thought worth keeping.");
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Markdown 正文" })).toContainText(
    "A thought worth keeping.",
  );
  await page
    .getByRole("textbox", { name: "Markdown 正文" })
    .fill("## Formula\n\n```latex\nE = mc^2\n```\n");
  await page.getByRole("button", { name: "块编辑", exact: true }).click();
  await expect(page.locator(".katex").first()).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "import.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("## Imported\n\nImported content."),
  });
  await expect(editor).toContainText("Imported content.");
  await page.getByRole("button", { name: "历史版本" }).click();
  await expect(page.locator(".version-row").first()).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "恢复", exact: true }).first().click();
  await expect(editor).not.toContainText("Imported content.");
});
