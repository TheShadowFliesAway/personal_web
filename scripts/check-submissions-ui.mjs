import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const base = "http://127.0.0.1:3103";
const database = `.data/submission-ui-${Date.now()}.db`;
const password = randomBytes(20).toString("hex"),
  salt = randomBytes(16).toString("hex");
await mkdir(".data", { recursive: true });
await mkdir("artifacts/submissions", { recursive: true });
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", "3103", "-H", "127.0.0.1"],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DEMO_MODE: "false",
      TURSO_DATABASE_URL: `file:${database}`,
      TURSO_AUTH_TOKEN: "test",
      ADMIN_PASSWORD_HASH: `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
      SESSION_SECRET: randomBytes(48).toString("hex"),
      MCP_ENABLED: "false",
      R2_BUCKET_NAME: "",
    },
    stdio: "ignore",
  },
);
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(base);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  await page.goto(base);
  await expect(page.getByRole("link", { name: "查看论文投稿" })).toBeVisible();
  await page.getByLabel("个人访问密码").fill(password);
  await page.getByRole("button", { name: "进入学习空间" }).click();
  await expect(page.getByRole("button", { name: "写学习笔记" }).first()).toBeVisible();
  await page.goto(`${base}/submissions`);
  await page.getByRole("button", { name: "添加论文", exact: true }).click();
  await page
    .getByLabel("论文标题 *", { exact: true })
    .fill("Learning Visual Representations for Robust Robot Manipulation");
  await page.getByLabel("作者", { exact: true }).fill("ZJX et al.");
  await page
    .getByLabel("论文简介", { exact: true })
    .fill("从视觉表示到机器人策略，记录这篇论文的每一轮修改与投稿进展。");
  await page.getByLabel("论文 GitHub", { exact: true }).fill("https://github.com/example/paper");
  await page
    .getByLabel("Overleaf", { exact: true })
    .fill("https://www.overleaf.com/project/example");
  await page.getByLabel("代码 GitHub", { exact: true }).fill("https://github.com/example/code");
  await page.getByRole("button", { name: "添加一轮投稿" }).click();
  await page.getByLabel("会议 / 期刊 *", { exact: true }).fill("ICLR 2026");
  await page.getByLabel("状态", { exact: true }).selectOption("rejected");
  await page.getByLabel("投稿日期", { exact: true }).fill("2025-09-20");
  await page.getByLabel("结果日期", { exact: true }).fill("2026-01-25");
  await page.getByLabel("本轮备注", { exact: true }).fill("补充消融实验，完善真实场景评估。");
  await page.getByRole("button", { name: "添加一轮投稿" }).click();
  await page.getByLabel("会议 / 期刊 *", { exact: true }).last().fill("CoRL 2026");
  await page.getByLabel("投稿日期", { exact: true }).last().fill("2026-05-10");
  await page.getByRole("button", { name: "保存论文" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".submission-card")).toHaveCount(1);
  await page.getByText("投稿历程", { exact: false }).click();
  await expect(page.locator(".submission-history li")).toHaveCount(2);
  await page.screenshot({ path: "artifacts/submissions/desktop.png", fullPage: true });
  await page.getByRole("button", { name: /^编辑 Learning/ }).click();
  await page.getByLabel("状态", { exact: true }).last().selectOption("accepted");
  await page.getByRole("button", { name: "保存论文" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".submission-card-top > .submission-status")).toHaveText("中稿");
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const view = await visitor.newPage();
  await view.goto(`${base}/submissions`);
  await expect(view.locator(".submission-card")).toHaveCount(0);
  await view.getByLabel("查看口令", { exact: true }).fill("bad");
  await view.getByRole("button", { name: "进入投稿页面" }).click();
  await expect(view.locator(".submission-gate [role=alert]")).toContainText("口令不正确");
  await view.getByLabel("查看口令", { exact: true }).fill("zjx");
  await view.getByRole("button", { name: "进入投稿页面" }).click();
  await expect(view.locator(".submission-card")).toHaveCount(1);
  await expect(view.getByRole("button", { name: /^编辑 Learning/ })).toHaveCount(0);
  await view.getByText("投稿历程", { exact: false }).click();
  await view.screenshot({ path: "artifacts/submissions/mobile.png", fullPage: true });
  expect(await view.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await view.reload();
  await expect(view.locator(".submission-card")).toHaveCount(1);
  await view.getByRole("button", { name: "退出查看" }).click();
  await expect(view.getByLabel("查看口令", { exact: true })).toBeVisible();
  console.log(
    "Submission UI checks passed: homepage entry, editor, rounds, status update, shared-code gate, view-only controls, session persistence and mobile layout.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  for (const suffix of ["", "-wal", "-shm"]) await rm(database + suffix, { force: true });
}
