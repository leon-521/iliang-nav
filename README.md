# iliang nav

[English](README.en.md) · [MIT 许可证](LICENSE)

**iliang nav** 是一个可自托管的个人书签导航和管理工作台。使用 Next.js、React、TypeScript、Tailwind CSS 和 SQLite。前台可展示公开书签，管理后台仅限管理员登录。

## 功能

- 多级分类、多标签、站内搜索，支持 `#标签`，卡片和列表两种视图。
- 首页管理书签与常用入口，支持拖拽排序、卡片菜单、深浅模式及多套配色。
- 导入和导出浏览器书签；本地 SQLite 快照与可选 WebDAV 定时备份。
- 可选 AI 收藏草稿、摘要、标签与分类建议，支持 OpenAI 兼容文本 API。你确认后才会保存。
- 可选 MCP 外部管理；支持可撤销 Bearer Token 和 OAuth 2.0 Client Credentials。详见[外部接口](docs/external-api.md)。

## 本地启动

需要 Node.js 24（LTS）和 npm。SQLite 原生依赖在没有预编译包的平台上，可能需要 Python 和 C/C++ 构建工具。

```bash
git clone https://github.com/leon-521/iliang-nav.git
cd iliang-nav
npm ci
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
node -p "require('node:crypto').randomBytes(48).toString('base64url')"
```

将生成的随机值填入 `.env` 的 `AUTH_SECRET`（至少 32 字符）。然后执行：

```bash
node --env-file=.env scripts/migrate.mjs
node --env-file=.env --import tsx scripts/create-admin.mts
npm run dev -- --hostname 127.0.0.1
```

按提示创建管理员（新密码为 6–12 个字符）。访问 [首页](http://localhost:3000/) 或 [后台](http://localhost:3000/dashboard)。项目未提供默认账号。SQLite 默认存放在 `data/`，不要提交运行数据。

## 部署与安全

- 生产环境用 HTTPS，设置 `PUBLIC_BASE_URL` 为自己的公开地址；容器使用独立数据卷，避免服务重建后丢失数据库。
- Docker Compose 会构建镜像并绑定本机 3000 端口；部署到公网请配反向代理。创建管理员可在宿主机装好依赖后，针对同一个挂载目录执行上面的管理员脚本。若用自定义数据库路径，确保脚本与服务指向同一个库。
- AI、MCP、WebDAV 由管理员在设置中配置。确认 AI 请求会向配置的供应商发送说明中列出的数据；WebDAV 快照可能包含私有书签，远端文件未另行加密。只使用可信服务。
- 升级前备份数据库、必要的图标与独立配置文件；SQLite 快照不包含外置图标和独立凭据文件。保持加密配置使用的密钥稳定，勿公开 `.env`、Token、数据库或备份。
- 运行 `npm run build` 检查生产构建。端到端测试使用 `npm test`，需要先构建、安装 Playwright Chromium，并在支持 Bash 的环境中运行。

## 许可

项目源代码采用 [MIT](LICENSE)。第三方依赖分别遵循各自的许可证。
