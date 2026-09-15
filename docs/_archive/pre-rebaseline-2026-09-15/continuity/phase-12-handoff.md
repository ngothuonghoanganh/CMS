# Phase 12 Handoff — RBAC, Permissions and Audit Logs

Phase 12 status: complete, including the User Management addendum.

The target boundary is tenant DB `Role`/`RoleAssignment`/`AuditLog` plus Master DB
`PlatformRole`/`PlatformRoleAssignment`/`PlatformAuditLog`. Tenant RBAC is allow-only
and unions tenant-scoped and workspace-scoped assignments. System roles are owner,
admin, editor and viewer; the legacy membership role remains only for compatibility
and maps owner/admin/member to owner/admin/editor during idempotent seeding.

The current repository still uses session-backed tenant authentication and keeps the
Phase 10 database-per-tenant topology. Phase 11 plans, subscriptions, usage and
quotas remain Master-owned. No PagePayload field is changed and public renderer,
forms, analytics ingestion and integration delivery remain system/public flows.

Implemented API/CMS changes include tenant-local user list/detail/create/update,
status lifecycle, soft-remove, session revocation, role/access inspection and
permission-aware Settings Users UI. Focused authorization/audit tests, workspace
validation and RBAC E2E coverage are complete; the user-management lifecycle E2E
is included with the API scenarios. Initial passwords are accepted only at direct
creation, never returned or audited; invitation/reset infrastructure is still out
of scope. Phase 13 remains out of scope.
