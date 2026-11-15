# AtDev Cloud

Open-source Backend-as-a-Service platform by AtDev Dev.

AtDev Cloud provides a self-hostable backend with authentication, REST endpoints, file storage and database integration. The first alpha is intentionally small and designed to evolve toward native AtDev DB support.

## Features in 0.1.0-alpha
- Email/password registration and login with bcrypt password hashing.
- Signed bearer tokens and an authenticated `/v1/auth/me` endpoint.
- SQLite development adapter with parameterized queries.
- Project-scoped JSON record API.
- Local file storage with upload size limits and safe generated filenames.
- Health endpoint and environment-based configuration.

## Requirements
- Node.js 20+
- npm

## Quick start
```sh
cp .env.example .env
npm install
npm run dev
```

The API listens on `http://localhost:3000` by default.

## API
- `GET /health`
- `POST /v1/auth/register` — `{ "email": "...", "password": "..." }`
- `POST /v1/auth/login` — returns a bearer token
- `GET /v1/auth/me` — requires `Authorization: Bearer <token>`
- `GET /v1/projects/:project/records/:collection`
- `POST /v1/projects/:project/records/:collection`
- `GET /v1/projects/:project/records/:collection/:id`
- `PATCH /v1/projects/:project/records/:collection/:id`
- `DELETE /v1/projects/:project/records/:collection/:id`
- `POST /v1/storage/upload` — multipart field `file`, requires a token
- `GET /v1/storage/:filename`

Record endpoints require a bearer token. A project and collection name may contain only letters, digits, underscores and hyphens.

## Configuration
See [.env.example](.env.example). Set a long random `JWT_SECRET` before exposing the service to a network. Local storage and SQLite are development-friendly defaults, not a substitute for production backups and hardened deployment.

## Development
```sh
npm run typecheck
npm test
```

## Roadmap
- Native AtDev DB driver and connection pooling.
- Dashboard and project management.
- Role-based access control and API keys.
- S3-compatible storage adapter.
- Migrations, realtime events and server functions.

## License
MIT
