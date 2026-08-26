# Extension Developer Guide

This repository treats extensions as trusted, statically deployed code. Add an extension only
when its behavior can be represented by the existing typed contracts and explicit registries.

## 1. Define the manifest

Use a stable id, semver version and the current platform API version. Declare only the capabilities
and permissions that the extension actually uses. Configuration is a schema declaration, not a
place to store executable code.

```ts
const manifest = {
  id: 'acme.example-widget',
  name: 'Example Widget',
  version: '1.0.0',
  apiVersion: '1',
  capabilities: ['builder.element'],
  dependencies: [],
  permissions: ['extensions.read'],
  configuration: {
    fields: [
      { key: 'label', label: 'Label', type: 'text', required: true },
      { key: 'endpoint', label: 'Endpoint', type: 'url', required: false },
    ],
  },
} as const;
```

Manifests are validated by `ExtensionManifestSchema` and `ExtensionRegistry`. Duplicate ids,
duplicate capabilities, unknown permission keys, missing dependencies, incompatible dependency
versions and dependency cycles are rejected.

## 2. Register trusted code

API extensions implement `PlatformExtension` and are added to the static
`PLATFORM_EXTENSIONS` provider in `apps/api/src/extensions/extension.module.ts`. Use `register`
for capability providers and event subscriptions, `initialize` for startup work, `health` for a
bounded local health result, and `dispose` to remove subscriptions.

```ts
const exampleExtension: PlatformExtension = {
  manifest,
  register({ capabilities, events }) {
    capabilities.register('example.capability', manifest.id, { version: 1 });
    events.subscribe(
      'page.published',
      (event) => {
        // event.tenantId is authoritative for tenant-aware work.
        void event.pageId;
      },
      { extensionId: manifest.id },
    );
  },
  health: () => 'healthy',
};
```

Never load an extension id, module path, URL or JavaScript body from a tenant request. Never add
`eval`, `new Function`, raw HTML injection or an unbounded network call to a registry provider.

## 3. Add tenant configuration safely

Declare fields in the manifest and validate through `ExtensionRegistry`. Use `url` fields only for
`http`/`https` endpoints. Mark credentials as `secret`; the tenant service encrypts populated
secret fields with `IntegrationSecretVault`. API responses expose only `configuredFields`, never
values. Do not log configuration values or put them in audit metadata.

Tenant enablement is controlled by `TenantExtensionService` and the API routes under
`/api/v1/extensions`. It is always resolved under `TenantContext`; do not access another tenant's
database connection or cache key from extension code.

## 4. Consume and publish events

Subscribe to the typed event names in `PlatformEventMap`. Event handlers must be tenant-aware,
bounded and failure-tolerant. The bus isolates subscriber errors, but an extension should still
handle its own expected failures and emit structured logs. Do not treat the in-process bus as a
durable queue or assume at-least-once delivery.

When adding a domain event, first add its payload to `PlatformEventMap`, then publish it after the
owning transaction's durable write. Include `tenantId`, `occurredAt` and the minimum identifiers
needed by subscribers; never include secrets or arbitrary request bodies.

## 5. Add builder or renderer behavior

Builder elements must be allow-listed in the builder extension registry and represented by a
versioned `PagePayload` node schema. Add a new payload discriminator when the node is not
backward-compatible; do not modify the meaning of V1/V2. Add matching explicit builder adapter,
CMS inspector and renderer registry entries. The renderer must have a safe fallback and may emit
only validated text/attributes. GrapesJS state is transient and must not become the persistence
contract.

Disabling an extension is compatibility-sensitive: existing payloads remain readable/renderable,
while the CMS can hide new insertion and extension-specific management actions. Document any
different policy with the extension before implementation.

## 6. Test and document

Every extension should have tests for registry validation, capability ownership, lifecycle,
tenant A/B isolation, RBAC permissions, event failure behavior and disable compatibility. Add a
CMS test that proves the management view settles without a request loop and remains usable at
mobile widths. Update `docs/phase-13.md` when the platform boundary changes.

## 7. Attach an extension to a page

Use `pageConfiguration` for settings that belong to one landing page. The page API stores a
`PageExtensionInstance` and validates that the tenant extension is enabled before allowing the
instance to be enabled:

```text
PUT /api/v1/pages/:pageId/extensions/:extensionId
{ "enabled": true, "configuration": { ... } }
```

Page instances are tenant-scoped. `page.read` can inspect them, and `page.update` can mutate
them. A page publish validates every used extension and runs the trusted `beforePublish` hook
before changing the published-version pointer.

## 8. Declare contributions and runtime resources

The manifest `contributions` object is declarative metadata for the builder, page settings,
renderer, forms, automation, data, analytics, publishing and CMS slots. A capability package may
declare multiple builder elements and blocks; it is not limited to one component per extension.
Runtime and style entries are identifiers such as `countdown.runtime`, not URLs or JavaScript
bodies. The renderer resolves only identifiers returned by the page capability graph to code that
was bundled with the platform.

Use `GET /api/v1/pages/:pageId/extensions/capabilities` when a host needs the resolved dependency
graph. It returns active extension IDs, capabilities, runtime IDs, data bindings and controlled
slots without exposing tenant secrets.

## 9. Create a custom landing-page extension

The CMS supports tenant-scoped declarative extensions in addition to statically deployed code.
Create one with `POST /api/v1/extensions`, edit it with `PATCH /api/v1/extensions/:extensionId` and
remove it with `DELETE /api/v1/extensions/:extensionId`. IDs must start with `custom-`.

The current custom renderer is a safe `banner` definition containing validated text, an optional
HTTP(S)/relative CTA and a hex accent color:

```json
{
  "id": "custom-spring-launch",
  "name": "Spring launch banner",
  "version": "1.0.0",
  "render": {
    "kind": "banner",
    "heading": "Launch your next campaign",
    "body": "A reusable landing-page block.",
    "buttonLabel": "Learn more",
    "buttonHref": "/learn",
    "accentColor": "#8cf0c5"
  }
}
```

Enable the definition for the tenant, then insert it from the Builder's Blocks panel. Saving the
page creates its `PageExtensionInstance`; publishing validates tenant enablement and public
delivery includes the custom definition alongside the page runtime metadata. Deleting a custom
extension is rejected while a page instance still references it. Custom definitions never execute
JavaScript, load modules, inject HTML or register arbitrary runtime code.

## 10. Define a multi-surface trusted package

For platform-owned functionality, use `ExtensionDefinition` at build time. A package can declare
multiple typed surfaces while its tenant state remains in the tenant database:

```ts
const commerce: PlatformExtension = {
  manifest: {
    id: 'commerce',
    name: 'Commerce',
    version: '1.0.0',
    apiVersion: '1',
    capabilities: ['data.products', 'payment.checkout'],
    dependencies: [],
    permissions: ['extensions.read', 'extensions.manage'],
  },
  definition: {
    manifest: /* the same manifest */,
    contributions: [
      {
        type: 'builder.element',
        id: 'product-card',
        label: 'Product card',
        nodeType: 'commerce.product-card',
        propertyKeys: ['productId'],
        allowedParents: ['container'],
        permissions: [],
      },
      {
        type: 'data.source',
        id: 'products.list',
        label: 'Products',
        output: 'Product[]',
        queryKeys: ['limit', 'category'],
        capability: 'data.products',
        permissions: [],
      },
      {
        type: 'payment.provider',
        id: 'checkout',
        label: 'Checkout',
        capability: 'payment.checkout',
        permissions: [],
      },
    ],
  },
};
```

Register the package in the platform module. `ExtensionRegistry` validates manifest/dependency
versions and lifecycle, `ContributionRegistry` validates typed IDs and targets, and
`CapabilityRegistry` resolves providers without coupling a page to a vendor. Provider
implementations stay trusted in-process code and are registered from the extension's `register`
callback. Never store an implementation, module path, secret, SQL or JavaScript source in a
tenant record or page payload.

For external credentials, use the extension connection API:

```text
POST  /api/v1/extensions/:extensionId/connections
PATCH /api/v1/extensions/:extensionId/connections/:connectionId
DELETE /api/v1/extensions/:extensionId/connections/:connectionId
```

Only safe configuration and `secretConfigured` are returned to the CMS. Attach a connection to a
page through the page extension API; the server checks the extension/connection relationship and
includes only a safe attachment in the published bundle. The custom CRUD above is intentionally
limited to declarative content and is not a substitute for trusted package registration.

## 11. Add a workflow contribution

Automation contributions use the same trusted package boundary. Add typed contribution metadata
to an extension definition and register the provider from the extension's in-process lifecycle:

```ts
{
  type: 'action',
  id: 'crm.sync-lead',
  label: 'Sync lead to CRM',
  capability: 'crm.leads.write',
}
```

The provider receives a controlled `WorkflowExecutionContext` containing tenant/workspace/page
identity, the trigger, variables, previous step outputs, capability resolution and a structured
logger. It should validate its input, resolve a tenant connection through the server, and return a
small JSON output. Never put a token, secret, module path or executable source into a workflow
definition or step output. Workflow validation fails if a declared capability has no provider.

Triggers may declare an event type such as `form.submitted`; conditions evaluate typed values; and
actions perform work through a capability. Registries reject duplicate ids and the CMS only shows
metadata from the registry. See [Phase 14](../phases/phase-14.md) for execution states,
versioning, the page publish gate and the current process-worker boundary.
