# iliang nav

[English](README.en.md) · [MIT 许可证](LICENSE)

**iliang nav** 是一个可自托管的个人书签导航和管理工作台。使用 Next.js、React、TypeScript、Tailwind CSS 和 SQLite。前台可展示公开书签，管理后台仅限管理员登录。

## 功能

- 多级分类、多标签、站内搜索，支持 `#标签`，卡片和列表两种视图。
- 首页管理书签与常用入口，支持拖拽排序、卡片菜单、深浅模式及多套配色。
- 导入和导出浏览器书签；本地 SQLite 快照与可选 WebDAV 定时备份。
- 可选 AI 收藏草稿、摘要、标签与分类建议，支持 OpenAI 兼容文本 API。你确认后才会保存。
- 可选 MCP 外部管理；支持可撤销 Bearer Token 和 OAuth 2.0 Client Credentials。详见[外部接口](docs/external-api.md)，也可在后台「系统 → API 手册」查看。

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

## 书签导入与导出

在后台「整理 → 导入导出」切换「导入」或「导出」标签。导入合并到现有书签库，不会替换整个数据库。

| 格式 | 适用场景 |
| --- | --- |
| JSON | 完整书签库备份，保留多级分类及顺序、书签顺序、标签和可见性等书签数据。不包含账户、密钥、SQLite 运行文件或本地图标文件。 |
| CSV | 每行一条书签，包含网址、标题、简介、分类路径、标签、备用网址、可见性、排序、添加时间和图标属性。适合在表格软件中整理。 |
| HTML | Netscape 书签格式。用于和 Chrome、Edge、Firefox、Safari 的书签 HTML 文件互导；浏览器不识别本项目的隐私和排序扩展字段。 |

导出文件可能包含私有书签，请妥善保管。需要整站备份时请使用 SQLite 快照，不要用书签导出替代。

## 首页问候与天气

在「设置 → 站点信息」填写「首页昵称」，首页按上海时区显示问候语，例如「早上好，设计师」。同一页面可配置天气地点名称和大致经纬度。留空关闭天气；启用后，服务器将配置的坐标发送给 [Open-Meteo](https://open-meteo.com/) 查询天气，不获取访客定位。使用第三方服务请遵守其使用条款。

## 使用 GHCR 预构建镜像

GitHub Actions 在推送 `v*` 版本标签后构建并试运行镜像，再发布到 [GHCR](https://github.com/leon-521/iliang-nav/pkgs/container/iliang-nav)。当前支持 Linux x86-64（`linux/amd64`），每次发布使用固定版本标签，不提供 `latest`。

1. 下载仓库中的 `docker-compose.ghcr.yml` 和 `.env.example`。将后者复制为 `.env`，按下方说明生成 `AUTH_SECRET` 并设置 `PUBLIC_BASE_URL`。
2. 在同一目录执行：

   ```bash
   docker compose -f docker-compose.ghcr.yml pull
   docker compose -f docker-compose.ghcr.yml up -d --no-build
   docker compose -f docker-compose.ghcr.yml exec nav node scripts/create-admin.mts
   ```

   最后一条仅首次需要。访问 [首页](http://localhost:3000/)。升级前备份 `./data/`，在 `.env` 设置 `ILIANG_NAV_IMAGE_TAG` 为目标发布标签，再运行 `pull` 和 `up`。如收到 `denied`，请先在 GitHub Packages 确认镜像已公开，或以有权读取该包的账号登录 GHCR。

## Docker Compose 部署

需要 Docker Engine（或 Docker Desktop）及 Compose v2。以下命令在项目目录执行。

1. 克隆仓库：`git clone https://github.com/leon-521/iliang-nav.git`，然后 `cd iliang-nav`。
2. 复制环境模板：`cp .env.example .env`（PowerShell：`Copy-Item .env.example .env`）。用 `openssl rand -hex 32` 生成随机值并填入 `AUTH_SECRET`。本机试用保留 `PUBLIC_BASE_URL=http://localhost:3000`；公网部署填写你的 HTTPS 域名。不要提交 `.env`。
3. 构建并启动，容器会自动迁移数据库：

   ```bash
   docker compose up -d --build
   docker compose logs -f nav
   ```

   服务就绪后可用 Ctrl+C 退出日志，不会停止容器。
4. 创建管理员（首次启动才需要；再次运行会更新账号并使旧会话失效）：

   ```bash
   docker compose exec nav node scripts/create-admin.mts
   ```

5. 打开 [本机首页](http://localhost:3000/) 或 [后台](http://localhost:3000/dashboard)。默认端口只绑定宿主机回环地址。若对外提供服务，请通过 HTTPS 反向代理转发到本机 3000 端口。

**更新与停机**：先备份 `./data/` 并安全保存 `.env`；运行 `git pull --ff-only`、`docker compose up -d --build` 更新。`docker compose down` 停止服务，不删除 `./data/` 中的数据。请勿手动删除该目录。

## 版本检查

后台「概览 → 项目信息」从 GitHub [VERSION.md](VERSION.md) 读取仓库版本，与当前安装版本比较。仓库版本更高时显示「有新版本可用」；检查结果短暂缓存，查询失败显示「无法确认」，不会自动升级。

## 部署与安全

- 生产环境用 HTTPS，设置 `PUBLIC_BASE_URL` 为自己的公开地址；容器使用独立数据卷，避免服务重建后丢失数据库。
- AI、MCP、WebDAV 由管理员在设置中配置。确认 AI 请求会向配置的供应商发送说明中列出的数据；WebDAV 快照可能包含私有书签，远端文件未另行加密。只使用可信服务。
- 升级前备份数据库、必要的图标与独立配置文件；SQLite 快照不包含外置图标和独立凭据文件。保持加密配置使用的密钥稳定，勿公开 `.env`、Token、数据库或备份。
- 运行 `npm run build` 检查生产构建。端到端测试使用 `npm test`，需要先构建、安装 Playwright Chromium，并在支持 Bash 的环境中运行。

## 许可

项目源代码采用 [MIT](LICENSE)。第三方依赖分别遵循各自的许可证。
