# Payload Landing Page Platform

Greenfield monorepo for a modular landing-page platform. The current implementation
includes the Phase 6 forms/submissions foundation and Phase 7 notifications:
versioned page payloads, Mongo persistence, authenticated REST management APIs, CMS
page management and builder, public publishing, semantic forms, workspace-scoped
submissions, email/webhook integrations and durable delivery records.

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

Run all applications:

```bash
pnpm dev
```

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

Published pages resolve at `http://localhost:3002/:siteSlug/:pageSlug`. The renderer
uses `RENDERER_API_BASE_URL` for server-side public/preview reads, and the CMS preview
button uses `NEXT_PUBLIC_RENDERER_BASE_URL`.

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
`packages/cli`, `docs/architecture`, `.github/workflows`, and `docker-compose.yml`.

## Phase boundary

Phase 7 is complete for the scoped email/webhook notification foundation, and Phase 8
is complete for first-party analytics and tracking.
`PagePayloadV1` remains frozen; forms use the minimum explicit `PagePayloadV2`
extension, published snapshots drive server-side validation, and notification
bindings/deliveries remain outside the canonical page payload. Automation, CRM/social
integrations, billing, collaboration and microservices remain deferred.
Phase 9 has not been started. See
[`docs/architecture/phase-3.md`](docs/architecture/phase-3.md),
[`docs/architecture/phase-4.md`](docs/architecture/phase-4.md),
[`docs/architecture/phase-5.md`](docs/architecture/phase-5.md),
[`docs/architecture/phase-6.md`](docs/architecture/phase-6.md),
[`docs/architecture/phase-7.md`](docs/architecture/phase-7.md),
[`docs/continuity/phase-7-handoff.md`](docs/continuity/phase-7-handoff.md),
[`docs/phase-8.md`](docs/phase-8.md),
[`docs/architecture/phase-2.md`](docs/architecture/phase-2.md) and
[`docs/architecture/page-payload-v1.md`](docs/architecture/page-payload-v1.md) for the
implementation boundary and domain decisions.
