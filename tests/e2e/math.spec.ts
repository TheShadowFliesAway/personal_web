import { test, expect } from "@playwright/test";
test("Markdown display math renders, survives saving and supports plain-text paste", async ({
  page,
}) => {
  let saved: any;
  await page.route("**/api/workspace", async (route) => {
    const res = await route.fetch();
    const data = await res.json();
    saved ||= {
      ...data.documents[0],
      id: "math-fixture",
      markdown: "## 公式\n\n$$\n\\frac{a}{b}\n$$",
      blocks: null,
    };
    data.documents.push(saved);
    await route.fulfill({ response: res, json: data });
  });
  await page.route("**/api/documents", async (route) => {
    saved = { ...route.request().postDataJSON(), revision: saved.revision + 1 };
    await route.fulfill({ json: saved });
  });
  await page.route("**/api/visits", (route) => route.fulfill({ json: [] }));
  await page.goto("/#document/math-fixture");
  await expect(page.locator(".math-preview .katex")).toHaveCount(1);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await page.getByRole("textbox", { name: "Markdown 正文" }).fill("$$ E = mc^2 $$");
  await page.getByRole("button", { name: "块编辑", exact: true }).click();
  await expect(page.locator(".math-preview .katex")).toHaveCount(1);
  await expect(page.locator(".save-indicator")).toHaveText("已保存");
  await page.reload();
  await expect(page.locator(".math-preview .katex")).toHaveCount(1);
  // Start with an ordinary paragraph, then paste a math-containing Markdown document.
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await page.getByRole("textbox", { name: "Markdown 正文" }).fill("粘贴到这里");
  await page.getByRole("button", { name: "块编辑", exact: true }).click();
  const paragraph = page
    .locator('.bn-block-content[data-content-type="paragraph"] .bn-inline-content')
    .first();
  await paragraph.click();
  await page.keyboard.press("End");
  await paragraph.evaluate((el) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "\n\n$$\n\\sum_{i=1}^{n} x_i\n$$");
    el.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.locator(".math-preview .katex")).toHaveCount(1);
  await expect(page.locator(".save-indicator")).toHaveText("已保存");
  await page.reload();
  await expect(page.locator(".math-preview .katex")).toHaveCount(1);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await page.getByRole("textbox", { name: "Markdown 正文" }).fill("输入公式");
  await page.getByRole("button", { name: "块编辑", exact: true }).click();
  const typed = page
    .locator('.bn-block-content[data-content-type="paragraph"] .bn-inline-content')
    .first();
  await typed.fill("$$x^2+y^2=z^2$$");
  await expect(page.locator(".math-preview .katex")).toHaveCount(1);
  await expect(page.locator(".save-indicator")).toHaveText("已保存");
  await page.reload();
  await expect(page.locator(".math-preview .katex")).toHaveCount(1);
});
