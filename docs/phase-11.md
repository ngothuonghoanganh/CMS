# Phase 11 — Plans, Billing and Usage Quotas

## Status

Phase 11 adds a billing foundation at the Tenant boundary. Billing data lives in
the Master DB; pages, workspaces, forms, submissions, integrations, analytics and
domains remain in each Tenant DB. Phase 12 (advanced RBAC and audit logs) has not
been started.

## Ownership and architecture

```text
MASTER DB
Tenant ── TenantSubscription ── Plan ── Entitlements
  │              │
  └──────────────┴── TenantUsage (period counters)

TENANT DB
Workspace, Sites, LandingPages, PageVersions, Forms, Leads,
Integrations, AnalyticsEvents, CustomDomains and SEO
```

The request flow for a hard resource quota is:

```text
Mutation → TenantContext → Master subscription/plan
         → entitlement → Tenant DB count → allow or QUOTA_EXCEEDED
```

The Master collections are `plans`, `tenantSubscriptions`, `tenantUsage` and
`billingEvents`. No subscription or plan copy is added to a Tenant DB, and no
business records are moved into the Master DB.

## Plan and subscription decisions

Plans use live entitlements: changing a plan changes the limits of current
subscriptions that reference it. Price versions and provider checkout are deferred.
Limits use `null` for unlimited; zero and positive integers are finite limits.

The idempotent seed contains `legacy`, `free`, `starter`, `pro` and `business`.
Existing Phase 1–10 tenants receive `legacy` with unlimited limits so migration does
not unexpectedly disable existing work. New tenants receive the configurable
`BILLING_DEFAULT_PLAN_KEY` (default `free`). `Plan` keys are unique and inactive or
archived plans cannot be assigned to new subscriptions.

There is at most one current subscription per tenant. Current statuses are
`trialing`, `active` and `past_due`; historical subscriptions are retained as
`canceled` records. Tenant operational status is intentionally separate from
subscription status.

## Entitlements and quota policy

The supported entitlements are:

- `maxWorkspaces`
- `maxLandingPages`
- `maxCustomDomains`
- `maxIntegrations`
- `monthlyPageViews`
- `monthlyFormSubmissions`

Hard resource limits are enforced in domain services before mutation:
workspaces, landing pages, custom domains and configured integrations. The central
`QuotaService` also serializes same-process creates for a tenant/resource pair. This
is a correctness improvement for one API instance; cross-process distributed locking
is intentionally deferred and the cross-database consistency model remains
check-then-create.

Page versions do not count as landing pages. Integration deliveries do not count as
integrations. All configured custom-domain records count, including pending records.

Monthly page views and accepted form submissions are soft usage metrics. They are
incremented atomically in Master `tenantUsage` records using UTC calendar-month
periods. Historical periods are never overwritten. Public pages continue to render
and accepted submissions continue to be stored after a soft limit is reached; the
dashboard surfaces the usage and overage state for future policy work.

Analytics page-view events are the page-view source of truth, so no billing-only
tracking request is added. Successful `FormSubmission` persistence is the form
submission source of truth. Honeypot and rejected validation attempts do not count.
Usage increment failures are logged after the authoritative tenant write and do not
turn a public page view or lead into a failed request; this is the documented initial
eventual-consistency tradeoff when Master and Tenant DBs are separate.

Quota errors use HTTP 409 and the stable error body:

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "workspace quota has been reached for the current plan",
    "details": { "metric": "workspaces", "limit": 3, "usage": 3 }
  }
}
```

## APIs

Authenticated tenant users can read:

```text
GET /api/v1/billing
GET /api/v1/billing/subscription
GET /api/v1/billing/entitlements
GET /api/v1/billing/usage
```

Platform-admin-only operations are:

```text
GET   /api/v1/platform/plans
POST  /api/v1/platform/plans
GET   /api/v1/platform/plans/:planId
PATCH /api/v1/platform/plans/:planId
POST  /api/v1/platform/tenants/:tenantId/subscription
```

The platform-admin check uses the Master `PlatformUser` record. Normal tenant users
cannot submit an arbitrary `planId` or subscription mutation.

## CMS

The CMS has a `Billing & Usage` view that fetches one billing summary on view load.
It displays the current plan, subscription status, period and all six usage metrics.
There is no aggressive polling or payment checkout. Existing builder, renderer and
PagePayload contracts are unchanged.

## Failure handling and limitations

- A missing subscription fails closed for quota-protected mutations and billing reads;
  it never silently becomes unlimited.
- Tenant DB counts are unavailable when that tenant DB is unavailable; the API does
  not fabricate zero usage.
- Public rendering does not perform a billing lookup and is not guarded by quotas.
- The initial usage path increments Master counters from analytics/form ingestion;
  a future high-volume deployment can move this to an aggregation pipeline.
- Payment provider checkout, invoices, tax, refunds, proration, webhook processing,
  currency conversion, distributed locks and advanced RBAC are out of scope.

## Validation

The billing E2E provisions an isolated tenant, verifies the default Free subscription
and asserts a tenant-scoped workspace quota error. The existing Phase 10 regression
suite continues to cover CMS authentication/loop recovery, publishing, renderer,
forms, integrations, analytics, domains, SEO and cross-tenant isolation.
