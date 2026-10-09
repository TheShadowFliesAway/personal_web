import { randomBytes } from "node:crypto";
console.log(
  "将下面两项填入 Vercel Production 环境变量，以及 ChatGPT 的 OAuth 客户端配置。不要提交到 Git 或发送到聊天中。\n",
);
console.log("MCP_CLIENT_ID=papertrail-chatgpt");
console.log(`MCP_CLIENT_SECRET=${randomBytes(32).toString("base64url")}`);
