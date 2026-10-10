# 从注册账号到上线

适用于已经注册 GitHub、Vercel、Turso、Cloudflare 的个人账号。无需租赁服务器；先使用免费托管和数据库额度，仅图片超额时按量计费。

## 1. GitHub 仓库

当前目标仓库为 `TheShadowFliesAway/personal_web`。建议在仓库 Settings → General → Danger Zone → Change repository visibility 中改为 Private。私有仓库与网站登录权限是两件事，应用已经另外实现登录。

将本项目提交并推送到仓库。`.env.local`、密钥、演示数据库、截图和测试产物均在 `.gitignore` 中。不要把真实笔记当作示例提交。

## 2. Turso 数据库

1. 在 Turso 控制台点击 **Create Database**，名称可用 `papertrail`，保留 Free 套餐。
2. 选择区域时，优先与 Vercel 后端函数的区域接近。界面可用区域会变化，创建时记录所选区域。
3. 打开数据库详情，找到 Database URL（类似 `libsql://…turso.io`）。
4. 为这个数据库生成有读写权限的 **Database Token**。不要用整个账号的管理 API Token 替代。
5. URL 对应 `TURSO_DATABASE_URL`，Token 对应 `TURSO_AUTH_TOKEN`。记录令牌到期时间，过期前更换并重新部署。

程序首次连接会自动创建数据表，无需手动录入 SQL。正式库初始为空，不包含演示论文。

参考：[Turso 数据库授权](https://docs.turso.tech/sdk/authorization)、[TypeScript SDK](https://docs.turso.tech/sdk/ts/quickstart)。

## 3. 生成个人登录凭据

在项目目录运行：

```bash
npm run auth:setup
```

输入自己的密码两次。脚本输出：

- `ADMIN_PASSWORD_HASH`：密码的加盐哈希。
- `SESSION_SECRET`：随机会话签名密钥。

把输出填入 Vercel 环境变量即可。无需把密码或这些值发送到聊天中。

## 4. Vercel 导入项目

1. 在你截图里的 **Import Git Repository** 下选择 GitHub，授权访问这个仓库。
2. 导入 `personal_web`，Framework Preset 使用 **Next.js**，Node.js 选择 **22.x**，构建命令保留 `npm run build`。
3. 填入以下环境变量后部署：

| 名称                  | 值                     |
| --------------------- | ---------------------- |
| `DEMO_MODE`           | `false`                |
| `TURSO_DATABASE_URL`  | 第 2 步的 Database URL |
| `TURSO_AUTH_TOKEN`    | 第 2 步的数据库 Token  |
| `ADMIN_PASSWORD_HASH` | 第 3 步生成的哈希      |
| `SESSION_SECRET`      | 第 3 步生成的随机密钥  |

4. Production 环境连接正式数据库。若启用 Preview，建议为它单独创建测试库、存储桶和登录凭据，不与正式数据共用。
5. 点击 Deploy。部署完成后先验证登录、新建笔记、修改正文、刷新恢复。

环境变量修改后需要重新部署才能生效。此时即使还没配置 R2，也能正常使用论文、笔记和路线；图片上传会提示尚未连接。

## 5. Cloudflare R2 图片存储

1. 控制台进入 **Storage & databases → R2 Object Storage**，按页面流程开通 R2。R2 需要订阅，页面可能要求配置付款方式；无需购买 Cloudflare Pro。
2. 创建存储桶，例如 `papertrail-images`，使用 **Standard** 存储类型。
3. 保持存储桶私有，不启用公开 `r2.dev` 访问，也不需要绑定域名。
4. 在 R2 的 API Tokens 页面创建对象读写凭据，只允许访问这个桶。
5. 保存生成的 **Access Key ID** 和 **Secret Access Key**，以及 Cloudflare Account ID。R2 的 S3 凭据与普通 Cloudflare API Token 不同。
6. 在 Vercel 增加：

| 名称                     | 值                                 |
| ------------------------ | ---------------------------------- |
| `R2_ACCOUNT_ID`          | Cloudflare Account ID              |
| `R2_ACCESS_KEY_ID`       | S3 Access Key ID                   |
| `R2_SECRET_ACCESS_KEY`   | S3 Secret Access Key               |
| `R2_BUCKET_NAME`         | `papertrail-images` 或实际桶名     |
| `IMAGE_STORAGE_LIMIT_MB` | `1024`，默认限制应用上传量到 1 GiB |

7. 重新部署，在笔记中粘贴一张截图，保存后刷新，验证图片仍显示。

当前实现由同源后端处理压缩后的小图片，因此不需要给 R2 配置跨域上传 CORS。后端会重新解码，转换为 WebP，避免直接提供任意上传内容。

参考：[R2 开通](https://developers.cloudflare.com/r2/get-started/)、[S3 凭据](https://developers.cloudflare.com/r2/get-started/s3/)、[R2 API Token](https://developers.cloudflare.com/r2/api/tokens/)。

## 6. 备份与恢复

在「设置与备份」下载 JSON；在 R2 控制台或 S3 兼容工具中另外备份 `images/` 文件。图片清单不等于图片本身。

恢复到**新建的空数据库**：

1. 将新数据库的环境变量放入本机 `.env.local`，不要指向正在使用的正式库。
2. 执行 `npm run backup:restore -- /绝对路径/papertrail-backup.json`。
3. 脚本会拒绝覆盖已有论文或路线的数据库。
4. 把图片按原来的 `images/<id>.webp` 路径恢复到 R2，并更新 Vercel 环境变量、重新部署。

## 7. 使用成本与检查

以当前单人使用、无 PDF、图片较少的需求，预计可在免费额度内起步。100 元是年度预算目标，不是服务商自动封顶承诺。保留默认图片限额，关注账单与额度变化，不启用无关付费功能。

上线检查：退出登录后，正文、搜索、导出和图片接口均应拒绝读取；登录后新增、编辑、路线关联、图片和备份应可用。再换一台设备确认内容一致。

若在中国大陆使用，分别检查网站访问、登录、数据库请求和图片加载速度。注册平台控制台能打开，不代表部署网站在所有网络下都稳定。自定义域名也不保证解决网络问题。

参考：[Vercel Hobby](https://vercel.com/docs/plans/hobby)、[Turso 价格](https://turso.tech/pricing)、[R2 价格](https://developers.cloudflare.com/r2/pricing/)、[Vercel 大陆访问说明](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)。

## 8. 连接 ChatGPT：远程 MCP

此功能直接运行在现有 Vercel 应用上，共用 Turso；不需要额外服务器，也不需要 OpenAI API Key。ChatGPT 负责生成笔记内容，MCP 负责将用户要求的内容写入网站。请求会消耗现有 Vercel/Turso 配额；不额外调用付费模型 API。

### 配置顺序

1. 将包含本功能的代码推送到 Vercel 绑定的生产分支，等待部署完成。MCP 默认关闭，不影响现有网站。
2. 本机运行 `npm run mcp:setup`，生成独立的客户端 ID 和密钥。保存到密码管理器，不提交到 Git，也不用发给 AI。
3. 先在 Vercel Production 设置下表前四项（`MCP_ENABLED`、`MCP_ORIGIN`、`MCP_CLIENT_ID`、`MCP_CLIENT_SECRET`），重新部署。此时可先不设置 `MCP_REDIRECT_URIS`：发现接口和工具列表可用，私人数据与实际授权仍被阻止。
4. 在 ChatGPT「设置 → 插件 → 添加 → 创建自定义 MCP 服务器」填写：
   - 名称：`Papertrail`
   - MCP 地址：`https://你的正式域名/api/mcp`
   - 认证：OAuth
   - OAuth Client ID / Secret：第 2 步生成的值。
   - 复制界面提供的**完整 OAuth 回调地址**。如果界面没有显示，可先创建插件并发起连接；跳转到本网站并登录后，未完成配置的授权页会显示本次请求携带的回调地址。核对确实来自你刚发起的 ChatGPT 连接后再填写，不会自动信任请求中的地址。
5. 在 Vercel 项目 Settings → Environment Variables 补全以下变量，**仅选择 Production**：

| 变量                | 值                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `MCP_ENABLED`       | `true`                                                                                   |
| `MCP_ORIGIN`        | `https://personal-web-ruddy-psi.vercel.app`，如已换域名则填实际固定域名；不带 `/api/mcp` |
| `MCP_CLIENT_ID`     | 第 2 步的 `papertrail-chatgpt`                                                           |
| `MCP_CLIENT_SECRET` | 第 2 步生成的随机密钥                                                                    |
| `MCP_REDIRECT_URIS` | ChatGPT 显示的完整回调 URL；多个实际需要的地址用英文逗号分隔，无通配符                   |

6. 重新部署，使环境变量生效。登录网站，进入「设置与备份 → 管理 MCP 连接」，确认显示“MCP 已启用”。
7. 回到 ChatGPT 保存/刷新 MCP 工具列表并连接。它会跳转到网站；输入**网站的个人访问密码**，核对授权内容后点“允许连接”。客户端密钥不是登录密码。
8. 在对话中选择这个插件，先测试：“列出我最近的 5 篇论文笔记”。再让它创建一篇测试笔记，回网站刷新核对内容、标签和数学公式。

如果创建界面没有客户端 ID/Secret 输入项，请展开 OAuth 高级设置。本实现使用私人、预配置的 OAuth 客户端，不开放动态客户端注册；不能选择“无认证”来替代。不同客户端若使用不同回调地址，需要明确加入允许列表后重新部署。

### 已提供的工具

- `search_notes` / `get_note`：搜索、分页列出、读取论文和学习笔记。
- `list_organization`：复用标签与学习主题路径，如 `编程与工具/PyTorch`。
- `create_note` / `update_note`：保存 Markdown、来源链接、代码、公式、标签和记录状态。
- `list_routes` / `get_route`：查看研究路线及论文关系。
- `create_route` / `update_route`：引用已有论文，生成含分支/汇合的有向无环路线；自动布局。更新会重新排列节点位置。

示例：

> 先搜索已有的 CLIP、BLIP、BLIP-2 笔记，避免重复。为缺失的论文创建中文笔记，保存 arXiv 链接、核心模块代码和公式；对不确定的信息明确标注。再创建一条 VLM 研究路线，用关系标签解释这些论文的联系。写入前让我核对你的内容。

论文状态 `unread / reading / read` 对应“未开始记录 / 记录中 / 记录完成”。学习笔记不显示记录状态。

### 数据与授权行为

- 只有获得授权的工具调用能读取私人数据；工具名称和输入格式允许公开发现。现有网页登录 Cookie 不作为 MCP Bearer Token 使用，演示模式也不绕过 MCP 授权。
- `notes:read` 是读取权限，`notes:write` 是创建/更新权限。没有删除、清空回收站、执行代码、任意 SQL 或图片上传工具。
- OAuth 使用授权码 + PKCE S256。授权码 5 分钟、访问令牌 1 小时、刷新令牌 30 天有效；刷新时轮换令牌。数据库只保存令牌哈希。
- 在网站「设置与备份 → 管理 MCP 连接」可撤销全部授权。要关闭功能，将 `MCP_ENABLED=false` 后重新部署。更换客户端密钥后，也建议撤销旧授权再连接。
- 每次写操作有 `requestId`，同一操作重试不会重复创建。更换参数需使用新的 `requestId`。更新需要最新 `expectedRevision`，冲突时重新读取、合并内容。
- MCP 每次更新笔记都会保存历史版本（仍保留最近 20 份）。只改标题、标签等会保留富文本区块；修改 Markdown 正文时以 Markdown 重建区块，Markdown 无法表达的富文本样式可能丢失。
- MCP 不自动读取论文链接或判断事实正确性。ChatGPT 需要自行研究并给出来源；路线关系应区分技术继承、启发和对比。
- 导出备份不含 OAuth 凭据或请求重试记录。恢复新数据库后，需要重新连接 ChatGPT。

### 排查与开发验证

- `/connections` 显示未启用：检查 5 项 MCP 变量是否在 Production，修改后是否重新部署。
- “客户端或回调地址未配置”：核对 Client ID 和完整回调 URL，包括路径、大小写和末尾斜杠。
- “授权资源地址不匹配”：ChatGPT 配置的 MCP URL 必须等于 `MCP_ORIGIN` + `/api/mcp`，不能使用随机预览部署地址。
- 401 或要求重新连接：访问令牌失效/已撤销，重新授权；不要把网站 Cookie 或 Turso Token 当作 MCP 令牌。
- 私人页面不会公开；Vercel 的额外 Deployment Protection 如果拦截了公网 MCP/OAuth 请求，ChatGPT 也无法连接。正式域名需要能从公网到达这些端点，数据仍由本应用 OAuth 保护。
- 本地验证：`npm run build && npm run test:mcp`。脚本用独立临时数据库和 3102 端口，覆盖真实 MCP SDK 调用、OAuth、权限、版本冲突和幂等写入，不连接正式数据库。

参考：[OpenAI 自定义 MCP 服务器](https://developers.openai.com/api/docs/guides/custom-mcp-server)、[OAuth 接入要求](https://developers.openai.com/plugins/build/auth)。

补充回归测试：`MCP_TEST_INCOMPLETE=1 npm run test:mcp` 验证尚未配置回调地址时能发现服务，同时仍然拒绝读取、写入和授权。
