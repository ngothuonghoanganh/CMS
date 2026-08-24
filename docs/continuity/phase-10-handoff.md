# Phase 10 Handoff — Tenant Control Plane

Phase 10 establishes `Tenant = Company` with a Master control plane and one MongoDB
database per tenant. `Workspace` remains inside the tenant database; sites, pages,
versions, forms, submissions, integrations, analytics, domains and SEO are all
tenant-local. PagePayload contracts are unchanged and contain no tenant metadata.

## Important implementation points

- `apps/api/src/tenancy/` contains Master connection setup, tenant resolution,
  AsyncLocalStorage context, connection caching, dynamic tenant model binding and
  provisioning.
- Master collections are `tenants`, `tenantDomains` and `platformUsers`.
- Tenant collections include `tenantUsers`, `tenantMemberships`, sessions, workspaces
  and the existing Phase 1–9 resource collections.
- Access tokens carry a signed `tid`; authentication checks the target tenant and a
  tenant-local membership. Tenant switching creates a new session in the target DB.
- Public custom-domain, forms and analytics requests resolve the tenant before using
  tenant models. The public routing hint is outside PagePayload.
- `/control-plane/tenants` is the new platform-admin provisioning API. `/organizations`
  remains only as a compatibility adapter and does not use the old Organization
  models.

## Migration policy

The configured legacy database becomes the first tenant data plane without rewriting
resource ids. Bootstrap is idempotent and seeds the configured tenant user, owner
membership, workspace and Master platform-admin record. Legacy Organization rows are
not used for authorization or routing; archival cleanup is a separate operational
decision.

## Validation commands

Run from the repository root:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Mongo-backed integration tests require `RUN_MONGO_TESTS=true` and a running MongoDB.
The repository still requires Node 24; local validation on Node 22 emits the package
manager engine warning.

See [`docs/phase-10-architecture.md`](../phase-10-architecture.md) for the topology,
security review and deferred Phase 11 boundary.

## Hotfix handoff

Initial Playwright MCP reproduction on the dev servers found bounded duplicate work:
CMS bootstrap was invoked twice concurrently by the development effect lifecycle, and
Renderer fetched the same public page once for metadata and once for the page tree.
Both paths settled successfully. A second stale-cookie reproduction then exposed the
real CMS redirect loop: the proxy redirected `/login` to `/` based only on cookie
presence, even after API authentication and refresh had failed.

The CMS client now single-flights concurrent GETs, while Renderer page APIs use
request-scoped React memoization. The CMS proxy keeps `/login` as a terminal recovery
route instead of trusting stale cookie presence. Redundant post-navigation
`router.refresh()` calls were removed. StrictMode, authentication, TenantResolver and
tenant isolation remain enabled. See the hotfix section in
[`docs/phase-10-architecture.md`](../phase-10-architecture.md) for the trace and
architectural invariant.
