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

Production deployment is image-only for Docker Swarm: GitHub Actions builds and publishes `patilu-web`, `patilu-cms`, and `patilu-api` images to GHCR with immutable `sha-*` tags plus the mutable `production` tag that Portainer pulls.

Operator checklist:

1. Keep the external Swarm network named `network_public` available for Traefik.
2. Configure the GitHub secret `PORTAINER_WEBHOOK`; the workflow calls it only after all three image pushes succeed.
3. Deploy `docker-stack.yml` from Portainer so Traefik routes `patilu.qeva.xyz`, `cms-patilu.qeva.xyz`, and `/api` on the public host.
4. Roll back through Portainer or by selecting a previous immutable GHCR `sha-*` tag for the affected service.
