# Patilu Managed Catalog

Patilu runs a production-oriented managed catalog: FastAPI and PostgreSQL own product metadata, MinIO owns normalized WebP images, the React CMS manages products and galleries, and the Astro site renders published products at request time.

## Quick path

1. Fill `.env` from `.env.example` with operator-owned values; never commit the resulting file.
2. Start PostgreSQL and MinIO, then run `cd patilu-api && uv run alembic upgrade head`.
3. Run `cd patilu-api && uv run fastapi dev`, `npm --workspace patilu-cms run dev`, and `npm --workspace patilu-web run dev`.
4. Verify with `cd patilu-api && uv run python -m pytest`, then run each frontend workspace's `typecheck` and `build` scripts.

## Applications

| App | Path | Responsibility in this slice |
|---|---|---|
| Public site | `patilu-web/` | Astro SSR catalog and runtime product detail routes. |
| API | `patilu-api/` | FastAPI catalog boundary, SQLAlchemy models, Alembic migrations, and MinIO image processing. |
| CMS | `patilu-cms/` | React/Vite product and gallery administration. |

## Out of scope

- End-user authentication, categories, order management, checkout, payments, analytics, and automated MinIO backups.
- Real WhatsApp numbers, social URLs, legal copy, shipping claims, prices, stock, testimonials, or credentials.

## Required external inputs

| Input | Why it is needed later |
|---|---|
| Production domain and canonical URL | Public URLs, sitemap, schema, CORS, and rebuild targets. |
| WhatsApp number | Public conversion CTAs. |
| Instagram URL | Public social links. |
| Shipping/privacy/legal copy | Truthful public pages and schema constraints. |
| GitHub/server secret names | Deployment and signed rebuild workflow. |
| Initial products and real images | Catalog publication and media validation. |

## Deployment foundation

Production deployment is image-only for Docker Swarm. Production images are built only by GitHub Actions, and server changes occur only after a GitHub Release with a stable SemVer tag such as `v1.0.0` is published from the current `main` HEAD.

### Catalog environment

The stack requires `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, and `MINIO_ROOT_PASSWORD` in Portainer's stack environment. Passwords are placeholders by design and MUST NOT be committed. If the PostgreSQL password contains URL-reserved characters, provide its percent-encoded form because it is interpolated into `DATABASE_URL`.

The API runs `alembic upgrade head` before starting. PostgreSQL and MinIO data live in the named volumes `postgres_data` and `minio_data`; both require an operator backup policy. MinIO's S3 API is exposed only at `media-patilu.qeva.xyz` for public read access to product objects, while its administration console remains internal.

Astro runs with the Node standalone adapter and reads `API_INTERNAL_URL` at runtime, so new published slugs appear without a Git rebuild. Local development falls back to the bundled sample catalog when localhost API access fails; production does not hide API failures behind stale data. `ALLOW_CATALOG_FALLBACK=true` enables that behavior explicitly outside localhost. The CMS reads `VITE_API_BASE_URL` at build time; its production Docker default is `https://patilu.qeva.xyz/api`.

Every `/admin/products` request requires the `API_ADMIN_TOKEN` bearer token. The CMS keeps the operator-provided token in session storage and attaches it at runtime; the token is never bundled into Vite. Infrastructure access controls remain recommended because CORS is not an authentication boundary.

To import the current fallback products and image assets into an empty catalog, run from `patilu-api`: `uv run python -m app.seed --assets-dir ../patilu-web/public/assets`. The import is idempotent by slug and requires reachable PostgreSQL and MinIO services.

The repository remains on the bootstrap `production` image tag only until the first release workflow updates `docker-stack.yml`. After that migration, all three services stay pinned to the same immutable release version; the workflow never creates or deploys `latest` or mutable `production` tags.

Operator checklist:

1. Keep the external Swarm network named `network_public` available for Traefik and create DNS for `media-patilu.qeva.xyz`.
2. Configure the GitHub secret `PORTAINER_WEBHOOK` and grant GitHub Actions permission to write repository contents and GHCR packages.
3. Deploy `docker-stack.yml` from Portainer so Traefik routes `patilu.qeva.xyz`, `cms-patilu.qeva.xyz`, and `/api` on the public host.
4. Protect `main` while allowing the release workflow's normal bot push of the stack-only version commit.

Release process:

1. Merge and verify the intended release commit on `main`; do not move `main` while its release workflow is running.
2. Create and publish a GitHub Release whose tag is exactly `vMAJOR.MINOR.PATCH` and whose target is the current `main` HEAD.
3. GitHub Actions runs checks, builds all three `sha-<commit>` images, promotes them to the release tag, pins all three stack references, and pushes a conventional stack-only commit to `main`.
4. Only after that commit succeeds does the workflow invoke Portainer, which pulls the updated repository and processes `docker-stack.yml`.

Pushes to `main` and pull requests run CI checks only. They do not build production images, mutate the stack, or call Portainer. There is no manual production deployment workflow route.

Rollback process:

1. Identify the last known-good release and revert the faulty application changes on a branch without reverting the release workflow or stack-pinning infrastructure.
2. Merge the revert to `main`, verify CI, and publish a new stable patch release from that exact `main` HEAD.
3. Let the normal release workflow build and pin new images containing the reverted code. This is an auditable forward rollback; do not retag an existing release, point the stack directly at an old tag, or invoke Portainer manually.
