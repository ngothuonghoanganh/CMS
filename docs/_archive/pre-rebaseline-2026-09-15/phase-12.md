# Phase 12 — RBAC, Permissions and Audit Logs

## Status

Phase 12 adds tenant/workspace-scoped allow-only RBAC, append-only audit logs and
tenant-local user management.
Phase 13 (Media and Asset Management) has not started.

## Existing authorization state and migration decision

Before Phase 12, authentication was session-backed and tenant-bound, but the only
authorization signal was the legacy tenant-local `TenantMembership.role` enum:
`owner`, `admin`, `member`. Workspace access was the workspace id stored in the
session, so a member could not switch to another workspace without a new context.
Platform control-plane routes checked the Master `PlatformUser.role` value
`platform-admin`.

Phase 12 keeps those fields as a wire/data compatibility seam while making
`Role` and `RoleAssignment` authoritative for new authorization checks. The
bootstrap/provisioning paths idempotently seed system roles and assign the existing
membership user to the matching tenant-scoped role. Existing `owner` and `admin`
users retain their access. Legacy `member` maps to `editor`, preserving the current
management capabilities; it is not silently converted to read-only access.

Role assignment identity uses the existing tenant user subject (normalized email),
because Phase 10 memberships already use that value. A role assignment is unique per
user, role, scope and workspace. Re-running bootstrap or tenant provisioning does not
duplicate roles or assignments.

## Tenant RBAC model

Tenant database collections:

- `roles`: tenant roles with stable keys, `system`/`custom` type and permission keys.
- `roleAssignments`: tenant- or workspace-scoped role assignments.
- `auditLogs`: immutable tenant security/business audit records.

Tenant scope assignments apply to every workspace. Workspace scope assignments apply
only to their `workspaceId`. Effective permissions are the union of all applicable
allow-only assignments. There are no deny rules, role priorities, ABAC conditions or
policy language.

System roles are immutable and seeded as `owner`, `admin`, `editor` and `viewer`.
Owner and admin have operational administration; editor can create and edit content
but cannot publish by default; viewer is read-only. Custom roles can be created and
edited by users with the corresponding role permissions. A custom role cannot be
deleted while assigned.

The tenant must retain at least one owner. Owner promotion, owner removal and owner
downgrade are protected by the existing per-tenant serialized owner lock. A user
cannot assign a role containing permissions they are not allowed to manage, and a
non-owner cannot grant the owner role.

## Permission catalog and matrix

The canonical catalog lives in `packages/contracts/src/index.ts` and is consumed by
the API and CMS. The main system-role matrix is:

| Area                                 | Owner                                      | Admin                             | Editor             | Viewer |
| ------------------------------------ | ------------------------------------------ | --------------------------------- | ------------------ | ------ |
| Workspace/member/role administration | full                                       | full except owner-only invariants | read               | read   |
| Pages                                | read/create/update/delete/publish/rollback | full                              | read/create/update | read   |
| Leads                                | read/update                                | read/update                       | read               | —      |
| Analytics                            | read                                       | read                              | read               | read   |
| Integrations                         | full                                       | full                              | read               | —      |
| Domains                              | full                                       | full                              | read               | —      |
| SEO                                  | read/update                                | read/update                       | read/update        | read   |
| Billing                              | read                                       | read                              | —                  | —      |
| Audit                                | read                                       | read                              | —                  | —      |

Site, asset, template and integration-delivery permissions are included for the
corresponding existing management routes. Public delivery, public form submission,
public analytics ingestion, custom-domain resolution and background integration
delivery do not use human RBAC.

## Authorization services and API coverage

`AuthorizationService` resolves effective permissions from the current Tenant DB for
the active tenant/workspace request. `PlatformAuthorizationService` resolves
Master `PlatformRole` assignments independently. Business endpoints use permission
checks, not role-name checks; the compatibility organization routes delegate to the
same service. Every resource query continues to include its workspace ownership filter.

The protected areas are workspaces, organization/member compatibility routes, roles,
pages/versioning/publishing/preview, sites, assets, templates, submissions,
analytics reads, integrations/deliveries/bindings, domains, SEO and billing reads.
Phase 11 plan and subscription control-plane mutations use platform permissions.

Authorization happens before quota checks. A denied user receives the stable generic
`FORBIDDEN` response and never sees quota details for an operation they cannot perform.

## Tenant user management

Tenant users remain in the tenant database `users` collection alongside the existing
session and membership records. Master stores only `PlatformUser`, `PlatformRole` and
`PlatformRoleAssignment`; no platform user record is reused as a tenant user. The
normalized email is unique inside one tenant database and may exist in another tenant.

`GET /api/v1/users` supports offset pagination plus `search`, `status`, `roleId` and
`workspaceId` filters. `GET /api/v1/users/:userId` returns only a safe profile, tenant
role assignments and effective workspace access. Password hashes, credentials,
refresh tokens and access tokens are never part of these DTOs. The available tenant
permissions are `user.read`, `user.create`, `user.update`, `user.disable` and
`user.remove`; role assignment continues to require `role.assign`.

`POST /users` creates an active tenant-local account with a validated initial password,
membership and optional initial role assignment. If role assignment fails, the newly
created account and membership are rolled back. Email invitation and password-reset
tokens are intentionally not claimed: this phase has no delivery/reset infrastructure.
Profile updates are limited to `displayName`; email is the immutable login identity
for this phase.

`POST /users/:id/disable` and `/enable` implement lifecycle changes. Disable revokes
all active sessions, and authentication checks the current tenant user status on every
authenticated request and refresh. `DELETE /users/:id` is a safe soft-remove that
sets `status=disabled`, revokes sessions and retains role/membership/audit history.
Users cannot disable/remove themselves, and the last tenant owner cannot be disabled,
removed or lose the final owner assignment. These operations emit `user.create`,
`user.update`, `user.disable`, `user.enable`, `user.remove`, `role.assign` or
`role.unassign` audit actions without credential values.

Workspace access is represented by the existing tenant-scoped and workspace-scoped
`RoleAssignment` records; there is no duplicate `WorkspaceMembership` model. The
workspace switcher and direct context API continue to filter through server-side
`workspace.read` authorization.

## Audit architecture

Tenant audit records stay in the Tenant DB; platform audit records stay in Master DB.
`AuditService` and `PlatformAuditService` are the only application write boundaries.
Records are append-only and there are no update/delete audit APIs. Sensitive request
fields are recursively sanitized and known integration secrets are represented only
by redaction markers or changed-field names. Audit writes use the same database after
successful sensitive mutations; an audit persistence failure does not turn a
successful domain mutation into an implicit rollback.

Tenant audit listing is `GET /api/v1/audit-logs` and requires `audit.read`, with
offset pagination and workspace/actor/action/resource/date filters. Platform listing
is `GET /api/v1/platform/audit-logs` and requires `platform.audit.read`.

## CMS

The CMS loads `/me/permissions?workspaceId=...` after the authenticated session and
uses the result to hide navigation and mutation actions. The key is tenant/user/
workspace-safe and responses are not long-lived. Settings exposes Users, Roles,
Members and Audit Log without changing the existing dashboard architecture. Users
provides server-backed search/status filters, safe detail/access inspection, direct
creation with an initial password, role assignment, profile editing and explicit
disable/enable/remove confirmations. The Roles permission picker is scrollable and
supports search plus select-all for visible permissions.

## Known limitations and boundaries

- The compatibility `/organizations` API remains while existing clients migrate.
- Member invitations, email delivery, API keys, impersonation, approval workflows,
  password reset/change flows, ABAC, event sourcing and distributed permission
  caching are not implemented.
- Audit retention is indefinite in this phase; no TTL index is used.
- Role updates affect subsequent requests; an already executing request keeps its
  request-local permission snapshot.
- PagePayload contracts are unchanged. Billing entitlements and RBAC permissions
  remain independent.
