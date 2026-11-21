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

## Deployment and privacy

- Set `PUBLIC_BASE_URL` to your own HTTPS site in production. Use persistent storage for the database and related files.
- Docker Compose builds the app and binds port 3000 on loopback. Put an HTTPS reverse proxy in front for remote access. To create the first administrator, run the setup script from a host checkout with dependencies installed and point it at the same mounted database directory.
- AI, MCP, and WebDAV are optional and configured in the administrator settings. AI requests send the data described in the consent prompt to the selected provider. WebDAV uploads may contain private bookmarks; the remote snapshots are not separately encrypted.
- Before upgrading, back up the database, external icons, and any separate configurations you need. Database snapshots do not include external icons or credential stores. Keep encryption secrets stable and never publish `.env`, tokens, database files, or backups.
- Run `npm run build` to verify the production build. To run browser tests with `npm test`, build first and install Playwright Chromium in a Bash-compatible environment.

## License

Source code is available under the [MIT License](LICENSE). Third-party dependencies retain their own licenses.
