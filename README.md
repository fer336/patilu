# Patilu

Patilu's public storefront: a single Astro (SSR, Node adapter) site serving the product catalog, category browsing, and informational pages.

## Development

```sh
cd patilu
npm ci
npm run dev
```

## Deployment foundation

Production runs as a single Docker Swarm service (`docker-stack.yml`) behind Traefik on `patilu.qeva.xyz`. Releases build and push the `patilu-web` image to GHCR, promote it to a stable SemVer tag, pin `docker-stack.yml` to that tag on `main`, and trigger a Portainer webhook to redeploy. See `.github/workflows/deploy.yml` for the full pipeline.

## Out of scope

This repository does not include a CMS or a backend API — the product catalog lives as static data inside `patilu/src/data`. There is no database, no admin UI, and no media upload service.

## Required external inputs

- `PORTAINER_WEBHOOK` secret for the deploy trigger.
- An external `network_public` Docker Swarm overlay network reachable by Traefik.
