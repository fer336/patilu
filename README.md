# Patilu Platform Foundation

This slice creates the empty-workspace foundation for the Patilu managed catalog platform. It defines the three application boundaries, shared status contracts, and smoke commands without implementing product behavior.

## Quick path

1. Fill `.env` from `.env.example` with real operator-owned values.
2. Run `python -m pytest` to verify the API scaffold.
3. Run `npm test`, `npm run typecheck`, and `npm run build` for root smoke checks.

## Applications

| App | Path | Responsibility in this slice |
|---|---|---|
| Public site | `patilu-web/` | Minimal Astro boundary and package manifest. |
| API | `patilu-api/` | Minimal FastAPI app with a health endpoint and pytest smoke test. |
| CMS | `patilu-cms/` | Minimal React + Vite boundary and package manifest. |

## Out of scope for PR #1

- Product, category, inquiry, auth, database, MinIO, trend, SEO page, analytics, deployment, or CMS workflow implementation.
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
