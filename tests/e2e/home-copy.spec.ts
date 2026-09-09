import { test, expect } from "@playwright/test";

test("home copy persists across reloads and can be cancelled or reset", async ({
  page,
  request,
}) => {
  const workspace = await (await request.get("/api/workspace")).json();
  expect(workspace.demo).toBe(true);
  const original = workspace.homeCopy;
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "编辑首页文案" }).click();
    await page.getByLabel("主标题", { exact: true }).fill("我的知识花园");
    await page.getByLabel("上方小字", { exact: true }).fill("MY NOTES");
    await page.getByLabel("说明文字", { exact: true }).fill("慢慢记录，常常回看。");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("我的知识花园");
    await expect(page.locator(".home-copy")).toContainText("MY NOTES");
    const backup = await (await request.get("/api/export")).json();
    expect(backup.homeCopy.title).toBe("我的知识花园");
    await page.getByRole("button", { name: "编辑首页文案" }).click();
    await page.getByRole("button", { name: "恢复默认", exact: true }).click();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("我的知识花园");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "编辑首页文案" }).click();
    await expect(page.getByLabel("主标题", { exact: true })).toBeVisible();
    await page.getByLabel("上方小字", { exact: true }).fill("");
    await page.getByLabel("说明文字", { exact: true }).fill("");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".home-copy .eyebrow")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const invalid = await request.put("/api/home-copy", {
      headers: { Origin: new URL(page.url()).origin },
      data: { ...original, title: "   " },
    });
    expect(invalid.status()).toBe(400);
  } finally {
    const restored = await request.put("/api/home-copy", {
      headers: { Origin: new URL(page.url()).origin },
      data: original,
    });
    expect(restored.ok()).toBe(true);
  }
});
