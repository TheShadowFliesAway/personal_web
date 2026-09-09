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
