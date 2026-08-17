# Patilu Managed Catalog

Patilu runs a production-oriented managed catalog: the Astro site renders published products at request time, with a FastAPI backend and MinIO image storage managed externally.

## Quick path

1. Fill `.env` from `.env.example` with operator-owned values; never commit the resulting file.
2. Run `npm --workspace apps/www test` to verify the site contract.
4. Deploy `docker-stack.yml` from Portainer.

## Application

| App | Path | Responsibility in this slice |
|---|---|---|
| Public site | `apps/www/` | Astro SSR catalog and runtime product detail routes. |
| API | `apps/api/` | FastAPI managed product catalog boundary. |
| CMS | `apps/cms/` | React admin UI for catalog management. |

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

All secret configuration lives in external Docker Swarm secrets; the stack declares no compose variable interpolation and Portainer needs no stack environment variables. PostgreSQL is an externally managed database, not a stack service; the following secret MUST exist in the Swarm before the stack is deployed:

| Secret | Contents |
|---|---|
| `patilu_backend_env` | Complete dotenv document for the API, mounted at `/run/secrets/backend.env` with mode `0444`. Must define `DATABASE_URL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `GOOGLE_CLIENT_ID`, `ADMIN_ALLOWED_EMAILS`, and `API_ADMIN_SESSION_SECRET`. `API_ADMIN_TOKEN` and `API_AGENT_TOKEN` are supported only as legacy fallbacks. |

Create it on a Swarm manager with `docker secret create <name> <file>` (for example, `printf '%s' 'value' | docker secret create patilu_backend_env -`) or through Portainer's Secrets view. The stack references it as `external: true`, so the name must match exactly.

> [!WARNING]
> The `minio_data` volume is already initialized in production, and the external PostgreSQL database already holds production data. The secret VALUES MUST MATCH the current production credentials — including the credentials embedded in `DATABASE_URL`, `MINIO_ACCESS_KEY`, and `MINIO_SECRET_KEY` inside `patilu_backend_env` — or PostgreSQL authentication and MinIO/storage access break.

Passwords are placeholders by design and MUST NOT be committed. If the PostgreSQL password contains URL-reserved characters, use its percent-encoded form inside the `DATABASE_URL` value of `patilu_backend_env`.

The API runs `alembic upgrade head` before starting against the external PostgreSQL database, which requires its own operator backup policy outside this stack. MinIO data lives in the named volume `minio_data` and also requires an operator backup policy. MinIO's S3 API is exposed only at `media-patilu.qeva.xyz` for public read access to product objects, while its administration console remains internal.

Astro runs with the Node standalone adapter and reads `API_INTERNAL_URL` at runtime, so new published slugs appear without a Git rebuild. Local development falls back to the bundled sample catalog when localhost API access fails; production does not hide API failures behind stale data. `ALLOW_CATALOG_FALLBACK=true` enables that behavior explicitly outside localhost.

CMS access uses Google Identity Services. The CMS build receives only the public `VITE_GOOGLE_CLIENT_ID`; the API verifies Google ID tokens against `GOOGLE_CLIENT_ID`, requires `email_verified`, and allows only emails listed in `ADMIN_ALLOWED_EMAILS`. The API returns a short-lived bearer session signed with `API_ADMIN_SESSION_SECRET`. Infrastructure access controls remain recommended because CORS is not an authentication boundary.

External AI agents use CMS-managed bearer tokens for backend-only `/agent/products` catalog and gallery endpoints. Admins create, revoke, and delete those tokens in the CMS; the full token is returned only once on creation, and the API stores only a hash plus display-safe metadata. The optional `API_AGENT_TOKEN` environment value remains available as a legacy fallback and must not be exposed to frontend builds.

To import the current fallback products and image assets into an empty catalog, run from `apps/api`: `uv run python -m app.seed --assets-dir ../www/public/assets`. The import is idempotent by slug and requires reachable PostgreSQL and MinIO services.

The repository remains on the bootstrap `production` image tag only until the first release workflow updates `docker-stack.yml`. After that migration, the service stays pinned to the same immutable release version; the workflow never creates or deploys `latest` or mutable `production` tags.

Operator checklist:

1. Keep the external Swarm network named `network_public` available for Traefik and create DNS for `patilu.qeva.xyz`.
2. Configure the GitHub secret `PORTAINER_WEBHOOK` and grant GitHub Actions permission to write repository contents and GHCR packages.
3. Create the external Swarm secret listed in [Catalog environment](#catalog-environment) with values matching the current production credentials; the stack deploy fails until it exists.
4. Deploy `docker-stack.yml` from Portainer so Traefik routes `patilu.qeva.xyz` on the public host.
5. Protect `main` while allowing the release workflow's normal bot push of the stack-only version commit.

Release process:

1. Merge and verify the intended release commit on `main`; do not move `main` while its release workflow is running.
2. Create and publish a GitHub Release whose tag is exactly `vMAJOR.MINOR.PATCH` and whose target is the current `main` HEAD.
3. GitHub Actions runs checks, builds the `sha-<commit>` image, promotes it to the release tag, pins the stack reference, and pushes a conventional stack-only commit to `main`.
4. Only after that commit succeeds does the workflow invoke Portainer, which pulls the updated repository and processes `docker-stack.yml`.

Pushes to `main` and pull requests run CI checks only. They do not build production images, mutate the stack, or call Portainer. There is no manual production deployment workflow route.

Rollback process:

1. Identify the last known-good release and revert the faulty application changes on a branch without reverting the release workflow or stack-pinning infrastructure.
2. Merge the revert to `main`, verify CI, and publish a new stable patch release from that exact `main` HEAD.
3. Let the normal release workflow build and pin a new image containing the reverted code. This is an auditable forward rollback; do not retag an existing release, point the stack directly at an old tag, or invoke Portainer manually.
