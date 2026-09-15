# Payload Landing Page Platform

Monorepo for a modular landing-page platform. The product core is the flow
Create Site → Create Page → Build Page → Preview → Publish → Receive Leads,
backed by the API, CMS and independent public renderer applications.

The canonical architecture and active roadmap are maintained in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Historical phase, handoff and
architecture documents are retained under
[`docs/_archive/`](docs/_archive/) and are not current requirements.
AI and contributor rules are defined in [`AGENTS.md`](AGENTS.md) and must be read
before making repository changes.

## Prerequisites

- Node.js 24 LTS
- pnpm 10.15 or newer
- Docker Desktop with Docker Compose

## Install

```bash
corepack enable
pnpm install
cp .env.example .env
```

To install the workspace launcher globally from this checkout (the script uses npm's
global prefix, while the launcher itself delegates to pnpm):

```bash
pnpm install:global
payload-platform --help
```

The global `payload-platform` command resolves the nearest repository workspace (or
the `PAYLOAD_PLATFORM_ROOT` override) and delegates to its pnpm scripts. It does not
bundle or replace the monorepo applications.

## Local development

Start MongoDB:

```bash
docker compose up -d mongodb
```

The bundled MongoDB is exposed on host port `27018` so it does not collide with
other local MongoDB projects. Keep `MONGODB_URI` in `.env` aligned with that port.

Run all applications:

```bash
pnpm dev
```

The development launcher checks whether the default API port (`3001`) is
available. If another local service already owns it, the API moves to the first
free fallback port (`3011`–`3015`) and CMS/renderer are pointed at that port
automatically. Set `DEV_API_FALLBACK_PORT` to choose a specific fallback.

For a production-style local run, start MongoDB, configure `.env`, then use either
the root scripts or the global launcher:

```bash
pnpm build
pnpm start

# equivalent after `pnpm install:global`
payload-platform build
payload-platform start
```

`start` launches the built API, CMS and renderer through Turbo. The individual
services are also available as `pnpm start:api`, `pnpm start:cms` and
`pnpm start:renderer`.

The development servers are:

- CMS: http://localhost:3000
- API: http://localhost:3001/api/v1/health/live
- Public renderer: http://localhost:3002

Published pages resolve at `http://localhost:3002/:siteSlug` for the site homepage
and `http://localhost:3002/:siteSlug/:pagePath` for other canonical page paths. The renderer
uses `RENDERER_API_BASE_URL` for server-side public/preview reads, and the CMS preview
button uses `NEXT_PUBLIC_RENDERER_BASE_URL`. The builder's Live preview keeps the
renderer open and sends validated `PageDocument` snapshots over `postMessage`; set
`NEXT_PUBLIC_CMS_BASE_URL` to the exact CMS origin outside local development so the
preview bridge can enforce its trusted sender.

Uploaded local assets are stored below `ASSET_STORAGE_ROOT` (default:
`.data/assets` relative to the API working directory). The CMS and renderer serve
their `/api/v1/public/assets/*` URLs through same-origin rewrites to
`NEXT_PUBLIC_API_BASE_URL` and `RENDERER_API_BASE_URL`, respectively. Set those
variables to the reachable API origin in non-local environments and use a
persistent absolute `ASSET_STORAGE_ROOT` when running the local filesystem provider.

The API readiness endpoint is http://localhost:3001/api/v1/health/ready and reports
the MongoDB connection state.

## Quality commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm verify` runs formatting, lint, typecheck, unit tests and build. Start MongoDB with
Docker before exercising the API's readiness and persistence flow. `pnpm test:e2e`
starts API, CMS and renderer through Playwright's `webServer` configuration.

The CMS login uses the environment-configured `AUTH_EMAIL` and `AUTH_PASSWORD` values
from `.env`. A short-lived JWT access token and a rotating refresh token are held in
HTTP-only cookies; only the hash of the refresh token is persisted in MongoDB.

To run the real Mongo integration suite locally:

```bash
docker compose up -d mongodb
RUN_MONGO_TESTS=true pnpm test
```

## Repository structure

The monorepo contains `apps/api`, `apps/cms`, `apps/renderer`, `packages/contracts`,
`packages/cli`, `docs/ARCHITECTURE.md`, `docs/_archive`, `.github/workflows`, and
`docker-compose.yml`.

## Architecture and roadmap

The rebaseline resets phase numbering. The current phase is declared in
`docs/ARCHITECTURE.md`; Phase 0 covers rebaseline and governance, followed by core
product simplification, the canonical content engine, a guided builder, templates,
publishing and delivery, leads and conversion, campaign operations, integrations,
analytics and monetization. The old phase roadmap is inactive; new requirements must
be evaluated against
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Custom domains and SEO

The CMS exposes Settings → Domains and Settings → SEO. Domains use a DNS TXT
ownership check and serve only an active, page-bound domain whose page has a published
version. The platform does not provision DNS records or TLS certificates; the edge or
hosting proxy terminates HTTPS and forwards the validated host boundary to the
renderer. `DOMAIN_VERIFICATION_PROVIDER=fake` is test-only and is rejected when
`NODE_ENV=production`.

SEO metadata is stored separately from page payloads and drives document title,
description, canonical, Open Graph, Twitter/X, favicon, robots and domain-specific
sitemap responses. Public reads remain correctness-first with request-time resolution
and `no-store` caching; a shared cache or CDN invalidation service is intentionally
deferred until its invalidation contract is defined.

## Tenants and workspaces

Authenticated CMS ownership follows `Tenant → tenant-local membership → Workspace →
Resources`. The Master DB stores tenant registry, lifecycle, hostname mappings and
platform-admin records; each tenant has a separate MongoDB database containing its
users, sessions, workspaces and business resources. Legacy `PagePayload` versions
remain compatibility-only; the target authoring source of truth is `PageCompositionV1`.

Tenant provisioning is available under `/api/v1/control-plane/tenants`; authenticated
context switching creates a session in the target tenant database. The legacy
`/api/v1/organizations` routes are a temporary compatibility adapter backed by the
new tenant model, not the old Organization collections. Billing, invitations and
advanced RBAC remain deferred expansion; their old phase references are historical
and inactive.
