# Patilu Platform Foundation

This slice creates the empty-workspace foundation for the Patilu managed catalog platform. It defines the three application boundaries, shared status contracts, and smoke commands without implementing product behavior.

## Quick path

1. Fill `.env` from `.env.example` with real operator-owned values.
2. Run `cd patilu-api && uv run python -m pytest` to verify the API scaffold.
3. Run `npm test`, `npm run typecheck`, and `npm run build` for root smoke checks.

## Applications

| App | Path | Responsibility in this slice |
|---|---|---|
| Public site | `patilu-web/` | Minimal Astro boundary and package manifest. |
| API | `patilu-api/` | Minimal FastAPI app with a health endpoint and pytest smoke test. |
| CMS | `patilu-cms/` | Minimal React + Vite boundary and package manifest. |

## Out of scope

- Product, category, inquiry, auth, database, MinIO, trend, SEO page, analytics, or CMS workflow implementation.
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

The repository remains on the bootstrap `production` image tag only until the first release workflow updates `docker-stack.yml`. After that migration, all three services stay pinned to the same immutable release version; the workflow never creates or deploys `latest` or mutable `production` tags.

Operator checklist:

1. Keep the external Swarm network named `network_public` available for Traefik.
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
