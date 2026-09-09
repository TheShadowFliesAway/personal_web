import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
const ask = (prompt) =>
  new Promise((resolve) => {
    muted = false;
    rl.question(prompt, (answer) => {
      muted = false;
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
try {
  const password = await ask("设置网站登录密码（至少 12 个字符，输入不回显）：");
  const repeat = await ask("再次输入密码：");
  if (password.length < 12) throw new Error("密码至少需要 12 个字符");
  if (password !== repeat) throw new Error("两次密码不一致");
  const salt = randomBytes(16).toString("hex");
  console.log("\n将下列两项分别放入 Vercel 环境变量。不要提交到 Git，也不要发到聊天中。\n");
  console.log(`ADMIN_PASSWORD_HASH=${salt}:${scryptSync(password, salt, 64).toString("hex")}`);
  console.log(`SESSION_SECRET=${randomBytes(48).toString("hex")}`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
