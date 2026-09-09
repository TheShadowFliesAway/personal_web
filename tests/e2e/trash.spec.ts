import { test, expect } from "@playwright/test";
test("empty trash requires confirmation and clears the view only after success", async ({
  page,
}) => {
  let deleted = false;
  let calls = 0;
  await page.route("**/api/workspace", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.documents = data.documents.filter((d: { deletedAt: string | null }) => !d.deletedAt);
    if (!deleted)
      data.documents.push({
        ...data.documents[0],
        id: "trash-ui-fixture",
        title: "待清空测试内容",
        deletedAt: new Date().toISOString(),
        revision: 7,
      });
    await route.fulfill({ response, json: data });
  });
  await page.route("**/api/trash", async (route) => {
    calls++;
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().postDataJSON()).toEqual({
      documents: [{ id: "trash-ui-fixture", revision: 7 }],
    });
    deleted = true;
    await route.fulfill({ json: { deletedIds: ["trash-ui-fixture"], documents: [], routes: [] } });
  });
  await page.goto("/#trash");
  await page.getByRole("button", { name: "清空回收站", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("全部 1 篇");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(calls).toBe(0);
  await expect(page.locator(".document-list")).toContainText("待清空测试内容");
  await page.getByRole("button", { name: "清空回收站", exact: true }).click();
  await page.getByRole("button", { name: "确认永久删除", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "清空回收站", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "回收站是空的", exact: true })).toBeVisible();
  expect(calls).toBe(1);
});
