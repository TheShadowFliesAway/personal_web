import { test, expect } from "@playwright/test";
import { newDocument } from "../../src/lib/model";

test("topic picker stays anchored, supports keyboard selection, and saves immediately", async ({
  page,
  request,
}) => {
  expect((await (await request.get("/api/workspace")).json()).demo).toBe(true);
  const note = { ...newDocument("note", "编程与工具/PyTorch"), title: `选择器验证 ${Date.now()}` };
  expect(
    (
      await request.put("/api/documents", {
        headers: { Origin: "http://localhost:3000" },
        data: note,
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/#document/${note.id}`);
  const trigger = page.getByRole("combobox", { name: "学习主题", exact: true });
  await trigger.click();
  const menu = page.locator(".folder-picker-menu");
  await expect(menu).toBeVisible();
  expect(await page.locator("datalist").count()).toBe(0);
  const anchorBox = (await trigger.boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  expect(Math.abs(anchorBox.x - menuBox.x)).toBeLessThan(2);
  expect(Math.abs(anchorBox.width - menuBox.width)).toBeLessThan(2);
  expect(menuBox.y).toBeGreaterThanOrEqual(anchorBox.y + anchorBox.height);
  const search = page.getByRole("combobox", { name: "搜索学习主题" });
  await search.fill("兴趣爱好/音乐");
  await search.press("Enter");
  await expect(trigger).toContainText("兴趣爱好 / 音乐");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
  await page.reload();
  await expect(trigger).toContainText("兴趣爱好 / 音乐");
  await trigger.click();
  await search.fill("不要保存这个搜索");
  await search.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toContainText("兴趣爱好 / 音乐");
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(menu).toBeVisible();
  const mobileMenu = (await menu.boundingBox())!;
  expect(mobileMenu.x).toBeGreaterThanOrEqual(0);
  expect(mobileMenu.x + mobileMenu.width).toBeLessThanOrEqual(390);
  expect(mobileMenu.y + mobileMenu.height).toBeLessThanOrEqual(844);
  await page.getByRole("option", { name: "未分类", exact: true }).click();
  await expect(trigger).toContainText("未分类");
});

test("new-note dialog can create a topic without submitting the form prematurely", async ({
  page,
  request,
}) => {
  expect((await (await request.get("/api/workspace")).json()).demo).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /今天，又学到了什么/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "标题", exact: true })
    .fill(`新笔记选择器 ${Date.now()}`);
  const topic = `选择器主题 ${Date.now()}/子主题`;
  await dialog.getByRole("combobox", { name: "学习主题", exact: true }).click();
  const search = dialog.getByRole("combobox", { name: "搜索学习主题" });
  await search.fill(topic);
  await search.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "学习主题", exact: true })).toContainText(
    topic.replaceAll("/", " / "),
  );
  await dialog.getByRole("button", { name: "创建并开始" }).click();
  await expect(page.getByRole("combobox", { name: "学习主题", exact: true })).toContainText(
    topic.replaceAll("/", " / "),
  );
  await page.reload();
  await expect(page.getByRole("combobox", { name: "学习主题", exact: true })).toContainText(
    topic.replaceAll("/", " / "),
  );
});
