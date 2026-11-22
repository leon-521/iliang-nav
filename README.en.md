# iliang nav

[简体中文](README.md) · [MIT License](LICENSE)

**iliang nav** is a self-hosted bookmark dashboard built with Next.js, React, TypeScript, Tailwind CSS, and SQLite. It separates the public bookmark view from the authenticated administrator area.

## Features

- Nested categories, multiple tags per bookmark, site search with `#tag` filters, and card or list views.
- Homepage shortcuts and bookmarks with drag-and-drop ordering and context menus; multiple light and dark palettes.
- Browser bookmark import and export, local SQLite snapshots, and optional scheduled WebDAV backups.
- Optional AI-assisted bookmark drafts, summaries, tag extraction, and category suggestions via an OpenAI-compatible text API. Suggestions are not saved automatically.
- Optional external management through MCP with revocable bearer tokens or OAuth 2.0 Client Credentials. See the [MCP integration reference](docs/external-api.md).

## Local setup

Install Node.js 24 LTS and npm. On platforms without compatible prebuilt SQLite bindings, Python and a C/C++ toolchain may be needed.

```bash
git clone https://github.com/leon-521/iliang-nav.git
cd iliang-nav
npm ci
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
node -p "require('node:crypto').randomBytes(48).toString('base64url')"
```

Put the generated value in `AUTH_SECRET` in `.env` (at least 32 characters). Then run:

```bash
node --env-file=.env scripts/migrate.mjs
node --env-file=.env --import tsx scripts/create-admin.mts
npm run dev -- --hostname 127.0.0.1
```

Create your administrator when prompted (new passwords must contain 6–12 characters). There is no default account. Open the [homepage](http://localhost:3000/) or [administrator dashboard](http://localhost:3000/dashboard). SQLite data is stored in `data/` by default and should not be committed.

## Bookmark import and export

Upload a file under **Organize → Import** and review the preview. Download the desired format from **Settings → Export Bookmarks**. Imports merge into the existing library rather than replacing the database.

| Format | Use |
| --- | --- |
| JSON | Full bookmark-library backup, including nested categories and ordering, bookmark order, tags, and visibility. Excludes accounts, credentials, SQLite runtime files, and locally cached icon files. |
| CSV | One bookmark per row, including URL, title, description, category path, tags, alternate URL, visibility, sort order, creation date, and icon attributes. Intended for spreadsheet editing. |
| HTML | Netscape bookmark format for bookmark-file import/export with Chrome, Edge, Firefox, and Safari. Browsers do not preserve application-specific privacy and ordering fields. |

Exports can contain private bookmarks. Store them securely, and use a SQLite snapshot if you need an instance backup rather than a portable bookmark library.

## Homepage greeting and weather

Set the homepage nickname under **Settings → Site Information**. The greeting uses Shanghai time. The same panel lets you set an approximate location name and coordinates for weather; leave the location empty to disable it. When enabled, the server sends the configured coordinates to [Open-Meteo](https://open-meteo.com/) and never requests visitor geolocation. Follow the external provider's terms of use.

## Docker Compose deployment

Install Docker Engine (or Docker Desktop) with Compose v2. Run the commands from the project directory.

1. Clone with `git clone https://github.com/leon-521/iliang-nav.git`, then `cd iliang-nav`.
2. Copy the template: `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`). Generate a random secret with `openssl rand -hex 32` and put it in `AUTH_SECRET`. Keep `PUBLIC_BASE_URL=http://localhost:3000` for local use, or set it to your public HTTPS URL. Do not commit `.env`.
3. Build and start the container. Database migrations run automatically:

   ```bash
   docker compose up -d --build
   docker compose logs -f nav
   ```

   Press Ctrl+C to leave the logs without stopping the container.
4. Create the first administrator (rerunning resets the account and invalidates existing sessions):

   ```bash
   docker compose exec nav node scripts/create-admin.mts
   ```

5. Open the [homepage](http://localhost:3000/) or the [admin dashboard](http://localhost:3000/dashboard). By default the published port binds only to the host loopback interface. Use an HTTPS reverse proxy forwarding to local port 3000 for public deployments.

**Upgrade or stop:** Back up `./data/` and keep `.env` secure. Run `git pull --ff-only` and `docker compose up -d --build` to update. `docker compose down` stops the service without deleting `./data/`. Do not delete that directory manually.

## Version checking

The admin dashboard compares its installed version with [VERSION.md](VERSION.md) on GitHub. A higher repository version displays an update notice; results are cached briefly. If the repository cannot be read, the status is unknown. No automatic upgrade is performed.

## Deployment and privacy

- Set `PUBLIC_BASE_URL` to your own HTTPS site in production. Use persistent storage for the database and related files.
- AI, MCP, and WebDAV are optional and configured in the administrator settings. AI requests send the data described in the consent prompt to the selected provider. WebDAV uploads may contain private bookmarks; the remote snapshots are not separately encrypted.
- Before upgrading, back up the database, external icons, and any separate configurations you need. Database snapshots do not include external icons or credential stores. Keep encryption secrets stable and never publish `.env`, tokens, database files, or backups.
- Run `npm run build` to verify the production build. To run browser tests with `npm test`, build first and install Playwright Chromium in a Bash-compatible environment.

## License

Source code is available under the [MIT License](LICENSE). Third-party dependencies retain their own licenses.
