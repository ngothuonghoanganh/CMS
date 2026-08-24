# Phase 11 Handoff — Billing Foundation

Phase 11 keeps the Phase 10 database boundary intact and adds billing policy to the
Master DB. The main implementation is under `apps/api/src/billing/`.

## Important files

- `billing/schemas/plan.schema.ts` — Master plans and entitlement limits.
- `billing/schemas/tenant-subscription.schema.ts` — one current subscription per tenant.
- `billing/schemas/tenant-usage.schema.ts` — atomic monthly usage counters.
- `billing/schemas/billing-event.schema.ts` — idempotent internal billing audit events.
- `billing/plan.service.ts` — idempotent seed and platform plan management.
- `billing/subscription.service.ts` — default assignment and current subscription resolution.
- `billing/usage.service.ts` — UTC monthly `$inc` counters.
- `billing/quota.service.ts` — entitlement resolution, usage summary and hard quota gate.
- `billing/billing.controller.ts` — tenant read APIs and platform-admin mutations.
- `apps/cms/app/billing-view.tsx` — minimal Billing & Usage view.

## Operational decisions

- Existing tenants use `legacy` unlimited entitlements.
- New tenants use `BILLING_DEFAULT_PLAN_KEY`, defaulting to `free`.
- `null` means unlimited.
- Resource quotas are hard: workspaces, pages, custom domains and integrations.
- Page views and accepted form submissions are soft and never take public sites offline.
- Usage periods are UTC calendar months until a payment provider introduces a billing
  period policy.
- Plans are live references, not subscription entitlement snapshots.

## Validation

Run from the repository root:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The repository requires Node 24. Local validation may emit an engine warning when
running on Node 22. Mongo-backed tests require a running MongoDB and
`RUN_MONGO_TESTS=true` where applicable.

The billing E2E creates an isolated tenant and does not change the initial demo
tenant's Legacy subscription. No payment provider or Phase 12 RBAC work has been
started.
