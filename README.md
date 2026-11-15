# AtDev Cloud

Open-source Backend-as-a-Service platform by AtDev Dev.

AtDev Cloud provides a self-hostable backend with authentication, REST endpoints, file storage and database integration. The first alpha includes a browser dashboard and a native AtDev DB service integration.

## Features in 0.1.0-alpha
- Email/password registration and login with bcrypt password hashing.
- Signed bearer tokens and an authenticated `/v1/auth/me` endpoint.
- SQLite-backed account/auth metadata.
- Browser dashboard with registration, login, workspace overview, project management, API reference and AtDev DB SQL console.
- Persistent owner-scoped projects stored in Cloudflare D1, with create, list, edit and delete operations.
- Authenticated SQL proxy with per-user, per-project database isolation.
- Project-scoped JSON record API.
- Project-scoped R2 file storage API with authenticated listing, upload, download and deletion (10 MB per file).
- Health endpoint and environment-based configuration.

## Requirements
- Node.js 20+
- npm

## Quick start
### Opción rápida: iniciar todo junto (requiere Node.js 20+, npm y Rust estable)

Clona ambos repositorios en carpetas hermanas (`atdev-cloud/` y `atdev-db/`). Desde `atdev-cloud/` ejecuta:

```sh
cp .env.example .env
npm install
npm run dev:all
```

Este comando inicia AtDev DB, espera a que su endpoint de salud responda y después inicia AtDev Cloud. Al presionar Ctrl+C se detienen ambos procesos. Si AtDev DB está en otra ruta, configura `ATDEV_DB_MANIFEST` con la ruta a su `Cargo.toml`.

### Opción manual: iniciar los servicios por separado

Start AtDev DB in one terminal (requires Rust stable):
```sh
cd ../atdev-db
ATDEV_DB_BIND=127.0.0.1:8788 cargo run -- --server
```

Then start AtDev Cloud in another terminal:
```sh
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000` to use the web dashboard. AtDev DB must remain on a private interface; the Cloud backend proxies authenticated SQL requests and gives each user a separate database per project. The API also listens on `http://localhost:3000`.

## Deploy en Cloudflare Workers

El sitio y la API se ejecutan en un único Worker. La autenticación y las colecciones usan Cloudflare D1. El motor AtDev DB sigue siendo un servicio remoto independiente: para conectar el panel, configura el secreto `ATDEV_DB_URL` con la URL HTTPS pública de ese servicio. No uses una dirección localhost en producción.

Requisitos: Node.js 20+, una cuenta de Cloudflare y Wrangler.

```sh
npm install
npm run build:worker
npx wrangler d1 migrations apply atdev-cloud-db --remote
npx wrangler secret put JWT_SECRET --name atdev-cloud
npm run deploy
```

Para probar localmente con recursos de Cloudflare:

```sh
npm run worker:dev
```

El sitio publicado está en [atdev-cloud.cristopheriguaran-7.workers.dev](https://atdev-cloud.cristopheriguaran-7.workers.dev). Tras el primer despliegue, configura el secreto `JWT_SECRET` desde **Workers & Pages → atdev-cloud → Settings → Variables and Secrets → Add → Secret** (o con el comando Wrangler anterior). Usa un valor aleatorio de al menos 32 caracteres; no lo publiques ni lo compartas.

Para activar la consola AtDev DB después de alojar el servicio Rust en una URL HTTPS accesible, configura `ATDEV_DB_URL` como secreto del Worker. El motor Rust no se ejecuta dentro del runtime de Workers: sigue siendo un servicio remoto.

Los usuarios creados en el servidor local SQLite no se migran automáticamente a D1. AtDev Storage usa un bucket privado R2 enlazado como `FILES`. Antes del despliegue, habilita R2 en el panel de Cloudflare y crea el bucket `atdev-cloud-files` (o usa el nombre configurado en `wrangler.jsonc`). El Worker solo entrega archivos a través de endpoints autenticados y organiza las claves por usuario y proyecto. Cada archivo está limitado a 10 MB.

## API
- `GET /health`
- `POST /v1/auth/register` — `{ "email": "...", "password": "..." }`
- `POST /v1/auth/login` — returns a bearer token
- `GET /v1/auth/me` — requires `Authorization: Bearer <token>`
- `GET /v1/projects` — list the authenticated user's projects
- `POST /v1/projects` — create `{ "name": "My app", "slug": "my-app", "description": "..." }`
- `GET /v1/projects/:slug` — get one project
- `PATCH /v1/projects/:slug` — update its name or description
- `DELETE /v1/projects/:slug` — delete a project and its records
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
- Project-level API keys and role-based access control.
- Role-based access control and API keys.
- S3-compatible storage adapter.
- Migrations, realtime events and server functions.

## License
MIT
