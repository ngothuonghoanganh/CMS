# Phase 1 — Foundation & Architecture

## Status

This document freezes the Phase 1 architecture. It deliberately does not define the Phase 2 page domain.

## Chosen stack

| Concern           | Choice                      | Why                                                                          | Trade-off accepted                                  |
| ----------------- | --------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| Runtime           | Node.js 24 LTS              | Long support window; production-oriented LTS line                            | Not using newer Current releases                    |
| Language          | TypeScript 5.9              | Mature tool compatibility                                                    | Defer TypeScript 7 adoption until ecosystem settles |
| Monorepo          | pnpm workspaces + Turborepo | Simple package boundaries and task graph                                     | One additional build tool                           |
| CMS               | Next.js 16 + React 19       | Mature React application framework and routing                               | Framework conventions are accepted at app boundary  |
| Renderer          | Separate Next.js 16 app     | Independent public-delivery deploy/optimization boundary                     | Two frontend applications to operate                |
| API               | NestJS 11 + Express 5       | Structured modular monolith with mature ecosystem                            | More ceremony than a minimal HTTP framework         |
| Database          | MongoDB 8 + Mongoose        | Document model is a good future fit for page snapshots and flexible metadata | Relational constraints are not available by default |
| Runtime contracts | Zod 4                       | Runtime validation and TypeScript inference from one source                  | Validation library becomes a shared dependency      |
| Logging           | Pino + pino-http            | Structured, low-overhead logs and request correlation                        | Nest logger adapter is intentionally minimal        |
| Tests             | Vitest                      | Fast TypeScript-friendly unit testing                                        | No end-to-end test harness in Phase 1               |

## Repository structure

```text
.
├── apps/
│   ├── api/             # System of record and modular monolith backend
│   ├── cms/             # Authenticated authoring UI boundary
│   └── renderer/        # Public delivery boundary
├── packages/
│   └── contracts/       # Serializable cross-boundary runtime contracts
├── docs/architecture/
├── .github/workflows/
├── docker-compose.yml
├── pnpm-workspace.yaml
└── turbo.json
```

No generic `shared` package is created. New packages are added only when a stable sharing boundary actually exists.

## Application boundaries

### `apps/cms`

Owns authoring UI and future CMS workflows. It consumes the API through versioned contracts. It must not connect directly to MongoDB and must not become the canonical owner of page payloads.

### `apps/renderer`

Owns public page delivery. In Phase 5 it can be optimized around published immutable snapshots. It does not contain CMS mutation workflows and does not depend on editor internals.

### `apps/api`

Is the system of record. It owns application logic, authorization enforcement, persistence adapters and future external effects. It remains one deployable modular monolith until measured operational needs justify a split.

### `packages/contracts`

Contains serializable schemas/types that cross process/application boundaries. It cannot import NestJS, Next.js, React, Mongoose or editor libraries. Zod schemas are the runtime source of truth and TypeScript types are inferred from them.

Phase 1 contracts are intentionally limited to API versioning, error envelope, health response and a provider-neutral authenticated principal. The canonical Page Payload is a Phase 2 decision.

## Database approach

MongoDB is selected for the initial persistence technology because future Page versions are naturally document-shaped and are expected to be read as coherent snapshots. Mongoose is an infrastructure adapter inside `apps/api`; Mongoose documents/types must never leak into shared contracts.

Phase 1 uses one local MongoDB instance. There is no sharding, replica-set topology, Redis, queue or cache tier yet. Those are operational decisions to introduce only after real access patterns require them.

## API architecture

- REST + JSON.
- Versioned prefix: `/api/v1`.
- NestJS modules define boundaries inside one backend deployable.
- Controllers are transport adapters; future domain/application logic should not be embedded in controllers.
- One stable error envelope with request correlation IDs.
- Configuration is validated at process startup.
- GraphQL, CQRS and event sourcing are intentionally absent.

## Authentication foundation

Phase 1 defines only the seam required for later authentication:

- `AuthPrincipal { subject, sessionId }` is provider-neutral.
- `AuthenticationGuard` protects routes only when explicitly applied.
- `CurrentPrincipal` exposes the authenticated principal to controllers.
- No fake header-based authentication middleware is introduced; a real session/token verifier will populate `request.auth` in the authentication phase.

Phase 1 does **not** create users, passwords, login endpoints, refresh tokens, social login, RBAC or tenant authorization. The future browser default should favor secure HttpOnly server-managed credentials over long-lived credentials in browser storage.

## Phase 1 included

- pnpm/Turborepo monorepo and task pipeline.
- CMS application shell.
- Public renderer application shell.
- NestJS API shell.
- MongoDB connection infrastructure.
- Environment/config validation.
- Structured logging, request IDs and sensitive-header redaction.
- Stable API error envelope.
- Provider-neutral authentication boundary.
- Shared runtime contract package.
- Liveness/readiness endpoints.
- Local MongoDB via Docker Compose.
- Formatting, lint, typecheck, unit-test and build scripts.
- Basic GitHub Actions CI.

## Explicitly out of Phase 1

- Workspace, Site, Page, PageVersion, Asset or Template domain models.
- Canonical/versioned Page Payload.
- Page CRUD and draft/version behavior.
- User persistence and login flows.
- GrapesJS or any complete visual builder behavior.
- Preview, publish/unpublish and public slug routing.
- Forms, leads and action pipeline.
- Feature/plugin registry.
- Email, Facebook, Instagram, Zalo, SMS, webhook or analytics integrations.
- RBAC, tenant isolation, audit logs, queues/workers, CDN strategy or production deployment.

## Architecture invariants

1. Editor internals never become the platform domain model.
2. Mongoose types never cross the API boundary.
3. CMS and renderer never access MongoDB directly.
4. Shared contracts remain framework-agnostic and serializable.
5. Phase 1 does not model Phase 2 entities speculatively.
6. New infrastructure is introduced only after an observed requirement, not to anticipate every future extension.
