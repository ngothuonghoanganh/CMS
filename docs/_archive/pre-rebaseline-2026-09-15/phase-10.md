# Phase 10 — Tenant Control Plane and Database-per-Tenant

Phase 10 replaces the shared-database Organization boundary with `Tenant = Company`
and a database-per-tenant data plane. The detailed design and security decisions are
in [`docs/phase-10-architecture.md`](phase-10-architecture.md).

## Runtime topology

- The Master DB stores tenants, lifecycle/provisioning metadata, platform users and
  the hostname-to-tenant registry.
- Every tenant has a separate MongoDB database containing users, sessions,
  memberships, workspaces and all business resources.
- `AsyncLocalStorage` carries the request tenant. Dynamic model proxies resolve models
  from a tenant connection; no process-global current tenant or default tenant is
  used.
- `PagePayloadV1` and `PagePayloadV2` remain pure rendering contracts. Tenant routing
  metadata is returned beside the payload, never embedded in it.

## Bootstrap and provisioning

The idempotent bootstrap maps the legacy Phase 1–9 database to the configured initial
tenant, seeds the tenant-local user/membership/workspace and creates the Master
platform-admin record. `POST /api/v1/control-plane/tenants` reserves a Master record,
creates a new database, runs tenant schema initialization and seeds its owner before
marking the tenant active. Failed provisioning remains visible as `failed` in Master.

The old `/api/v1/organizations` routes are a temporary wire-compatibility adapter
backed by Master tenants and tenant-local membership/workspace records. The old
Organization models are not registered or used for authorization, routing or resource
queries.

## Resolution and isolation

Signed access-token tenant bindings, explicit CMS tenant slugs, and Master custom
domain mappings all resolve to an active tenant before tenant models are touched.
Unknown, suspended or unavailable tenants fail closed. Public forms and analytics
carry the resolved tenant slug outside PagePayload so browser events return to the
same tenant database.

Billing, plans and quotas are implemented in Phase 11. Invitations, advanced RBAC,
distributed caching and dedicated-cluster provisioning remain future work.
