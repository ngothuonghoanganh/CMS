# 07 — Multi-tenancy and Security

## 1. Tenant definition

One tenant represents one company.

The intended data topology is:

```text
Master / control database
  └── tenant registry
       ├── company metadata
       ├── database connection metadata/reference
       ├── tenant status
       └── provisioning/version metadata

Tenant A database
Tenant B database
Tenant C database
...
```

Implementation details may evolve, but isolation is a hard requirement.

## 2. Request lifecycle

Conceptual request flow:

```text
authenticate user
 → determine authorized tenant/company context
 → resolve tenant metadata from master DB/cache
 → obtain tenant DB connection
 → execute tenant-scoped operation
 → return response
```

Never accept arbitrary tenant identity from the client without verifying authorization.

## 3. Tenant DB connection manager

If connections are cached:

- cache key must be tenant identity;
- avoid connection explosion;
- define idle/eviction behavior;
- handle tenant DB unavailable state;
- avoid leaking a resolved connection across request contexts.

## 4. Authorization

Authentication answers who the user is. Authorization answers what they can do.

Server must check permission for actions such as:

- page view/create/update/delete/publish;
- form/submission/lead access;
- integration credential management;
- user/role management;
- tenant settings;
- asset access.

UI hiding is not authorization.

## 5. Current company UI

The normal CMS header should display the current company context. Do not introduce a prominent tenant switcher unless the product explicitly adds a platform/operator role that is authorized to switch context.

## 6. Cache isolation

Audit all cache/query keys. Include tenant identity where data could otherwise collide.

This applies to:

- frontend query cache;
- server cache;
- rendered-page cache;
- integration config cache;
- asset lookup cache;
- background tasks.

## 7. Published pages

Public pages may be resolved by domain/slug rather than authenticated tenant context. The resolver must still map public routing to exactly one tenant/page and must not expose private tenant data.

## 8. Secrets/integrations

Integration credentials must:

- never be sent back unnecessarily to the client;
- be encrypted/secured according to platform capabilities;
- be tenant-scoped;
- have server-side permission checks;
- be redacted from logs.

## 9. Security test cases

At minimum automated tests should verify:

- Tenant A cannot fetch Tenant B entity by guessed ID.
- Tenant A cannot mutate Tenant B entity.
- Tenant A cannot view Tenant B submissions/leads.
- Tenant A cannot use Tenant B integration settings.
- cache keys do not return another tenant's response.
- unauthorized roles cannot publish/delete/manage users.

## 10. Migration/provisioning

Because tenant databases are independent, schema/index changes need a tenant migration strategy.

Track:

- desired schema version;
- per-tenant applied version;
- provisioning status;
- migration failures;
- retry/rollback procedure where possible.
