# Phase 9 Handoff — Custom Domains, SEO & Production Readiness

## Completed boundary

Phase 8 was verified before implementation. Phase 9 is complete for the repository
scope. Phase 10 has not been started.

The frozen page payload contracts remain unchanged. Domains and SEO are separate
workspace/page records, and the existing published-version pointer remains the only
public content authority.

## Main implementation locations

- Contracts and hostname/SEO validation: `packages/contracts/src/index.ts`
- Domain persistence: `apps/api/src/persistence/schemas/custom-domain.schema.ts`
  and `page-seo-settings.schema.ts`
- DNS resolver boundary: `apps/api/src/domain/domain-verification-resolver.ts`
- Domain/public resolution: `apps/api/src/domain/custom-domain.service.ts` and
  `public-page.resolver.ts`
- Management/public controllers: `custom-domain.controller.ts` and `seo.controller.ts`
- Renderer host and metadata: `apps/renderer/app/lib/host.ts`, `lib/seo.ts`,
  `page.tsx`, `robots.ts`, `sitemap.ts`
- CMS settings: `apps/cms/app/domains-view.tsx`, `seo-view.tsx` and
  `cms-dashboard.tsx`
- Integration coverage: `apps/api/src/domain/custom-domain.integration.spec.ts` and
  `tests/e2e/domains-seo.spec.ts`

## Durable decisions

1. TXT ownership is the only verification method. DNS record provisioning and TLS
   certificates stay at the edge/deployment boundary.
2. Hostnames are normalized and globally unique. An active domain must be bound to a
   same-workspace page with a published version before it serves anything.
3. `TRUST_PROXY` is opt-in. Forwarded host headers are trusted only behind an edge
   that overwrites them; the renderer otherwise uses the direct request host.
4. Public rendering is request-time and `no-store` for immediate publish/republish/
   rollback correctness. No shared invalidation service was introduced.
5. The fake DNS provider is explicit for tests/E2E and rejected under production
   environment validation.
6. Public hostname resolution has a process-local per-client-IP rate limit; it does
   not perform DNS lookups on the public request path.
7. SEO configuration is metadata-only and cannot mutate `PagePayloadV1`/`V2`.

## Validation snapshot

- Phase 8 gate: serialized Mongo integration and baseline Playwright passed before
  Phase 9 work.
- Contracts: 15 tests passed.
- Serialized API/Mongo suite: 10 files, 25 tests passed.
- Full Playwright suite: 29 tests passed.
- Package lint/typecheck and `git diff --check` passed.

Run the full commands from [`docs/phase-9.md`](../phase-9.md) before deployment. The
local runtime may report the repository's Node.js 24 engine requirement when using
Node.js 22.

## Safe next work

Future work may define a CDN/cache purge contract, richer DNS/TLS integrations, image
optimization, structured-data schemas or the next roadmap phase. Preserve the
hostname normalization/uniqueness guard, published-only resolver, workspace filters,
proxy boundary and frozen payload contracts when doing so.
