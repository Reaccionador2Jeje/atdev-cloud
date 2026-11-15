# AtDev Cloud

Open-source Backend-as-a-Service platform by AtDev Dev.

AtDev Cloud provides a browser dashboard, account registration/login, project APIs, JSON records, AtDev DB integration, and project-scoped file storage.

## Architecture

- **Cloudflare Worker** serves the website and public API.
- **Cloudflare D1 is the authoritative account database**: credentials and user identity live in the existing `users` table.
- **D1** also stores project metadata and JSON records.
- **Cloudflare R2** stores project files through authenticated Worker routes.
- **AtDev DB** is an independent optional SQL service. The Worker proxies authenticated, owner-scoped requests to it.
- Local development uses SQLite; production account records are stored in D1.

No external PostgreSQL, Render, or Neon service is required for AtDev Cloud account registration or login.

## Account compatibility

The Worker uses the existing D1 `users` table and its `id`, `email`, `password_hash`, and `created_at` fields. Existing D1 accounts keep their IDs and password hashes, so their project ownership and existing PBKDF2 credentials remain valid. New registrations are written directly to D1 using PBKDF2-HMAC-SHA256 password hashes (210,000 iterations) with a random salt. The existing JWT signing secret remains the session-signing key.

The former optional PostgreSQL authentication service has been retired from the production path. Local SQLite accounts are separate development data and are not automatically imported into D1.

## AtDev Storage

Bind a private R2 bucket named `atdev-cloud-files` as `FILES` in `wrangler.jsonc`.

Storage defaults enforced by the Worker:

| Limit | Default |
|---|---:|
| Maximum individual file | 10 MiB |
| Maximum per project | 100 MiB |
| Maximum per account | 500 MiB |
| Maximum files per project | 500 |

Usage is measured from R2 object listings before each upload. These are application-level guardrails; simultaneous uploads may briefly race, and Cloudflare account-level quotas still apply. The limits can be changed in `src/worker.template.js`.

### Storage API

- `GET /v1/projects/:project/files` — list files (cursor pagination).
- `GET /v1/projects/:project/files/usage` — show project/account usage and configured quotas.
- `POST /v1/projects/:project/files` — upload multipart field `file`.
- `GET /v1/projects/:project/files/:id` — download a file.
- `DELETE /v1/projects/:project/files/:id` — delete a file.
- `GET /v1/projects/:project/files/export` — download a JSON manifest containing file metadata and authenticated download paths. Download the listed files individually with the same bearer token.

The Worker never exposes the R2 bucket publicly. Project ownership is checked before every storage operation.

## AtDev DB integration

AtDev DB runs independently from the Worker. Configure Worker secrets:

- `ATDEV_DB_URL`: HTTPS URL of a reverse proxy to the AtDev DB service.
- `ATDEV_DB_TOKEN`: the same private bearer token (at least 32 characters) configured on AtDev DB.

The AtDev DB API requires a token for non-loopback deployments. Keep the database service behind HTTPS and a private network/reverse proxy. See the [AtDev DB repository](https://github.com/Reaccionador2Jeje/atdev-db).

## Quick start: local development

Requirements: Node.js 20+, npm, and Rust stable if using the AtDev DB service.

Clone `atdev-cloud` and `atdev-db` into sibling folders. From `atdev-cloud`:

```sh
cp .env.example .env
npm install
npm run dev:all
```

Or run the services separately:

```sh
cd ../atdev-db
ATDEV_DB_BIND=127.0.0.1:8788 ATDEV_DB_TOKEN=your-long-random-token cargo run -- --server
```

Then in `atdev-cloud`:

```sh
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Cloudflare Workers

```sh
npm install
npm run build:worker
npx wrangler d1 migrations apply atdev-cloud-db --remote
npm run deploy
```

Set `JWT_SECRET` as a Cloudflare Worker secret. Keep the current secret unchanged when upgrading, otherwise existing sessions will become invalid. The D1 database binding is defined in `wrangler.jsonc`.

To enable storage, create the R2 bucket `atdev-cloud-files` in the same Cloudflare account and keep it private. The `FILES` binding is already declared in `wrangler.jsonc`.

## API

- `GET /health`
- `GET /v1/auth/status`
- `POST /v1/auth/register` — `{"email":"...","password":"..."}`
- `POST /v1/auth/login` — returns a bearer token
- `GET /v1/auth/me` — requires a bearer token
- `GET /v1/projects`
- `POST /v1/projects`
- `GET /v1/projects/:slug`
- `PATCH /v1/projects/:slug`
- `DELETE /v1/projects/:slug`
- `GET /v1/projects/:project/records/:collection`
- `POST /v1/projects/:project/records/:collection`
- `GET /v1/projects/:project/records/:collection/:id`
- `PATCH /v1/projects/:project/records/:collection/:id`
- `DELETE /v1/projects/:project/records/:collection/:id`

## Development checks

```sh
npm run typecheck
npm test
npm run build:worker
```

## License

MIT
