# Phase 9 — Custom Domains, SEO & Production Readiness

## Status

Phase 8 was complete before this work started. Phase 9 is implemented and verified;
Phase 10 has not been started.

The phase moves public delivery from a slug-only landing-page route to a host-aware
resolution boundary while keeping custom-domain and SEO configuration outside the
frozen `PagePayloadV1`/`PagePayloadV2` contracts.

## Resolution flow

```text
HTTP request
  -> renderer validates the request hostname
  -> active custom domain lookup (or platform slug route)
  -> workspace/site/page ownership check
  -> published version pointer lookup
  -> optional SEO settings
  -> deterministic public page + metadata/robots/sitemap response
```

`apps/api/src/domain/public-page.resolver.ts` is the shared resolver for both the
existing `/sites/:siteSlug/pages/:pageSlug` API route and
`/public/domains/resolve?hostname=...`. A custom hostname resolves only when:

- the hostname is normalized and belongs to an active domain record;
- the domain is bound to a page in the same workspace and site;
- the page has a published version;
- the published version is the version used for rendering and metadata.

Unknown, unverified, unassigned and unpublished custom domains return a generic public
not-found response. Drafts never become public through the domain resolver.

## Domain model and ownership verification

`customDomains` stores the normalized hostname, workspace/page ownership, status,
verification method, verification hostname/token, timestamps, failure reason and
optional primary-domain flag. `pageSeoSettings` stores SEO configuration per
workspace/page. Mongo indexes enforce unique normalized hostnames and one primary
domain per page.

The supported verification method is DNS TXT:

```text
Name:  _payload-verification.<hostname>
Type:  TXT
Value: <verification token shown in Settings → Domains>
```

The management status lifecycle is `pending → verifying → active` or `failed`.
Verification is authenticated, ownership-scoped and has a small process-local retry
guard. The default resolver uses `node:dns/promises`; no DNS provider abstraction or
automatic record provisioning is introduced. The explicit in-memory fake resolver is
available to tests/local E2E only, and environment validation rejects it in production.

The public hostname-resolution endpoint has a process-local per-client-IP limit of 240
requests per minute. It performs indexed Mongo lookups only and never performs a DNS
lookup, so this guard protects the public boundary without coupling page delivery to a
DNS service.

The API rejects URLs, paths, ports, whitespace, malformed labels, non-ASCII hostnames,
local/private development suffixes and other non-public hostnames. The unique index is
the final duplicate-domain guard, so concurrent creates cannot claim the same host.

## HTTPS, proxy and host-header boundary

TLS and certificate provisioning are owned by the deployment edge. The renderer reads
the direct host by default. `x-forwarded-host` is considered only when
`TRUST_PROXY=true`; that setting must be enabled only behind a trusted proxy that
overwrites the header. The renderer strips a valid port before shared hostname
normalization and distinguishes configured platform hosts from custom hosts.

`PUBLIC_PLATFORM_ORIGIN` is used to resolve safe relative canonical URLs. Canonical
URLs configured in CMS accept only relative paths or `http`/`https` URLs; unsafe
schemes are rejected. Metadata values are rendered through Next metadata APIs, not as
raw HTML, and public image/canonical values use the same safe URL boundary.

## SEO behavior

Settings → SEO supports:

- title and meta description;
- explicit canonical URL;
- `noindex` and `nofollow`;
- Open Graph title, description and image;
- Twitter/X card, title, description and image;
- favicon URL.

The renderer provides page-name/document-title and page-slug fallbacks when optional
fields are empty. An explicit canonical wins; otherwise an active primary custom
domain produces an HTTPS root canonical. The path route retains its existing behavior
when no explicit canonical or active primary domain exists.

Custom hosts receive host-aware `robots.txt` and `sitemap.xml`. An unknown host is
disallowed and has an empty sitemap. A noindex page is disallowed and omitted from its
sitemap. An active, indexable custom domain exposes its canonical URL in the sitemap.
Structured data is intentionally not invented without a page-type/schema contract;
it can be added in a later phase without changing the payload versions.

## Publishing, caching and performance

Public resolution reads the published pointer only, so draft edits cannot leak into a
public response and rollback remains deterministic through the existing published
version mechanism. Renderer public reads use request-time `no-store` behavior in this
phase. That makes republish and rollback immediately visible without a stale shared
cache or an unsafe ad-hoc invalidation scheme. A CDN/Redis cache and purge contract
remain deployment concerns for a later hardening step.

Analytics continues to use best-effort browser/server calls and does not block the
initial renderer response. No new client bundle dependency was added for domains or
SEO. Images remain URL metadata; image transformation/CDN policy is not expanded in
this phase.

## CMS and API surface

Authenticated management routes:

- `GET/POST /api/v1/workspaces/:workspaceId/domains`
- `GET/PATCH/DELETE /api/v1/workspaces/:workspaceId/domains/:domainId`
- `POST /api/v1/workspaces/:workspaceId/domains/:domainId/verify`
- `GET/PATCH /api/v1/pages/:pageId/seo`

Public route:

- `GET /api/v1/public/domains/resolve?hostname=...`

The CMS includes loading/error/success states, DNS instructions, retry verification,
page assignment, primary-domain selection, removal confirmation and an SEO search
preview. Domain and SEO records are workspace-scoped; cross-workspace page/domain
references resolve as not found.

## Validation

Phase 9 coverage includes:

- hostname normalization and unsafe canonical URL contract tests;
- duplicate, malformed, cross-workspace, pending, failed and unverified-domain cases;
- DNS verification, active host resolution, draft isolation, republish and removal;
- SEO persistence and public metadata mapping;
- host-aware robots and sitemap behavior;
- CMS Playwright flow: login → configure SEO/domain → verify → publish → custom host
  → title/description/canonical/robots/sitemap assertions.

Recommended local commands:

```bash
docker compose up -d mongodb
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e

RUN_MONGO_TESTS=true \
INTEGRATION_EMAIL_PROVIDER=fake \
INTEGRATION_ALLOW_HTTP_WEBHOOKS=true \
INTEGRATION_ALLOW_LOCAL_WEBHOOKS=true \
pnpm --filter @payload/api exec vitest run --no-file-parallelism
```

The repository targets Node.js 24 LTS. Running on Node.js 22 may show the existing
workspace engine warning even when the checks complete successfully.

## Explicit non-goals

This phase does not provision DNS, issue certificates, implement a provider-specific
DNS API, support wildcard/PSL policy, add a shared cache service, or start Phase 10.
