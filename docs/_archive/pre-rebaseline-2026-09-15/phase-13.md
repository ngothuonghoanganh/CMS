# Phase 13 — Extension and Plugin Architecture

## Status

Implemented as an in-process, trusted-extension architecture. The phase deliberately does not
include a marketplace, remote package loading, arbitrary plugin code execution, sandboxing,
billing entitlements or distributed event delivery.

## Design boundary

An extension is a versioned `ExtensionManifest` plus trusted application code registered at API or
frontend build time. The manifest declares:

- stable `id`, semantic `version` and platform `apiVersion`;
- capabilities and extension dependencies with version constraints;
- the platform permissions it needs;
- optional typed tenant configuration fields (`text`, `url`, `secret`, `boolean`, `number`).

`ExtensionRegistry` is the single API registry. Registration validates the manifest, rejects
duplicate ids and capabilities, validates permission declarations, checks missing/incompatible
dependencies and rejects dependency cycles before initialization. Lifecycle is observable as
`registered → validated → enabled → initialized → active` or `error`; disposal is isolated during
shutdown. `CapabilityRegistry` maps a capability to its owning extension and optional provider.

Extension code is not loaded from a request, database or tenant configuration. There is no
`eval`, `Function` constructor, arbitrary module path, remote bundle or user-supplied executable
code in the extension path.

## Tenant lifecycle and security

`TenantExtensionRecord` is stored in the existing database-per-tenant database and keyed by
`extensionId`. It stores built-in enablement/configuration state or a validated custom definition,
plus status and timestamps. The service obtains the model through `TenantModelRegistry`, so a
request cannot read or mutate another tenant's records.
Absent records are treated as disabled. Enabling validates configuration and tenant dependency
state; disabling preserves configuration for a later re-enable.

`GET /api/v1/extensions` and `GET /api/v1/extensions/:extensionId` require `extensions.read`.
Enable, disable and configuration updates require `extensions.manage`; owner and admin receive
both permissions, while editor and viewer do not. Responses contain manifest metadata, lifecycle,
health, capabilities and configured field names, never configuration values or secret material.
Secret fields are encrypted with the existing AES-256-GCM integration vault before persistence;
encryption requires `INTEGRATION_SECRET_ENCRYPTION_KEY`. Extension mutations write tenant audit
entries for `extension.enabled`, `extension.disabled` and `extension.configuration.updated`
without values.

The platform exposes built-in deployed extensions and tenant-scoped declarative custom extensions
in CMS. Custom definitions are stored as validated content and can create safe Page
banner blocks; they cannot install modules or execute code. There is no marketplace or
install-from-URL flow in this phase.

## Event bus

`EventBus` is a typed, tenant-aware in-process bus. Event names and payloads are declared in
`packages/contracts/src/extensions.ts`; every payload contains `tenantId` and `occurredAt`.
Publishing checks the active `TenantContext` before invoking subscribers. Subscribers are fanned
out asynchronously and an optional subscriber failure is logged and isolated so it cannot break
the page, submission or extension-management transaction. `critical` metadata is retained in the
logging boundary for the future outbox/retry policy; this phase does not claim durable delivery.
Subscriptions owned by an extension also check that extension's current tenant record before
handling an event, so a disabled tenant does not run the optional subscriber.

The first domain events are page create/update/publish, form submission, lead creation and
extension enable/disable. Existing domain writes publish only after their durable write and
analytics bookkeeping succeeds.

## Builder and renderer contract

The builder and renderer use explicit registries and the existing `PagePayload` discriminated
union. Phase 13 adds `PagePayloadV3` with safe `countdown` and declarative `extension` nodes and
no changes to V1 or V2.
The builder serializes only the allow-listed node and props; GrapesJS project JSON remains
transient. The CMS exposes the Countdown block only when the tenant has enabled
`demo-builder-countdown`; custom extension blocks are exposed after the tenant enables their
validated definitions. Existing V3 payloads remain editable/renderable under the explicit
compatibility policy above.

The renderer has registered countdown and custom-banner renderers and keeps its existing
unknown-node fallback. It emits validated text and attributes only; it does not evaluate code or
accept arbitrary markup from extension configuration.

## Demonstration extensions

Three built-in extensions exercise the architecture:

1. `demo-builder-countdown` declares builder capabilities and adds the versioned Countdown
   element through the builder registry.
2. `demo-analytics` subscribes to `page.published` and `form.submitted`, recording tenant ids in
   an in-memory demo sink.
3. `demo-webhook` registers a tenant-aware mock webhook provider and subscribes to form events;
   it has URL and secret configuration fields but makes no external request.

These are demonstrations of registration, capability ownership, tenant configuration, lifecycle,
event isolation and safe rendering—not a production delivery or analytics pipeline.

## Verification

Focused tests cover manifest/duplicate/dependency/cycle validation, capability registration,
tenant event mismatch and subscriber failure isolation, tenant-scoped extension records, RBAC
read/manage separation, V3 schema round trips, builder serialization and renderer safety. The
API and CMS Playwright scenarios cover registry listing, enable/disable, audit visibility,
permission-aware management and a bounded CMS extension request count across desktop and mobile
viewports.

See [the developer guide](./extensions/developer-guide.md) for the extension authoring contract.

## Advanced page capability model

Phase 13 now has three runtime scopes:

```text
Platform Extension → Tenant Extension → Page Extension Instance
```

`PageExtensionInstance` is tenant-scoped and keyed by `pageId + extensionId`. The API routes
are `GET /pages/:pageId/extensions`, `GET /pages/:pageId/extensions/capabilities`,
`PUT /pages/:pageId/extensions/:extensionId` and `DELETE /pages/:pageId/extensions/:extensionId`.
Mutations require `page.update`, check that the tenant extension is enabled, validate page
configuration against the trusted manifest, and never accept code, script URLs or raw HTML.

Manifests can declare typed contribution metadata for builder elements/blocks/actions/data
bindings, page settings/hooks/slots, renderer runtime and style assets, forms, automation,
analytics, publishing and CMS panels. The registry remains the only source of executable code; the
database stores custom definitions, instance state and configuration only. Payload persistence
automatically attaches a page instance when a saved payload uses a registered or custom extension
node.

Publishing validates page instances and tenant enablement before moving the published version
pointer. Public delivery includes only registered runtime/style identifiers plus the validated
custom definition used by an extension node. The renderer maps `countdown.runtime` to trusted
bundled client code and renders custom banners from typed content; tenant-supplied arbitrary
JavaScript is not loaded. `PageExtensionService` also exposes the page capability graph used by the
builder and the runtime dependency resolver.

## Package, contribution and composition model

The advanced extension platform now separates four boundaries instead of treating an extension as
a single feature switch:

```text
Trusted ExtensionDefinition
  -> ExtensionRegistry + ContributionRegistry + CapabilityRegistry
  -> tenant ExtensionInstallation + ExtensionConnection
  -> page PageExtensionAttachment
  -> Publish Compiler -> PublishedPageBundle
```

`ExtensionDefinition` is a deploy-time package contract containing the versioned manifest and a
normalized list of typed contribution metadata. `ContributionRegistry` rejects duplicate typed
IDs and indexes builder, CMS, data, integration, runtime, backend and publishing surfaces. The
trusted provider implementation remains in the process; it is not serialized into a tenant
record, `PagePayload` or a public response. The existing grouped manifest contribution shape is
still accepted so existing built-ins do not need a flag-day migration.

`ExtensionInstallation` is tenant state. It records enablement, the installed package version and
connection references in the tenant database. `ExtensionConnection` is a first-class tenant
resource with safe configuration and an encrypted credential boundary. The CMS exposes connection
CRUD only after the tenant extension is enabled, and page attachment validates that a connection
belongs to the same extension before it can be used. The existing integration vault is reused;
there is no second plaintext secret store.

`PagePayload` remains the visual document. Page composition is resolved as an aggregate of payload,
attachments, bindings, actions and resources. Publishing compiles this aggregate into an immutable
`PublishedPageBundle` containing the payload snapshot, safe runtime descriptors, extension versions,
capabilities and asset identifiers. Secrets, executable providers and arbitrary markup/code never
enter the bundle. New publishes use the bundle; old published versions without one continue to
use the existing validated runtime resolver during compatibility rollout.

Tenant disable follows the safe policy: the API checks page-extension usage and rejects a disable
when an enabled instance is referenced by a published page. Draft-only usage can be changed or
removed first. This prevents a CMS toggle from silently changing a live page; a future
admin flow can add an explicit unpublish-and-disable operation.

### Research alignment

The design follows the relevant boundaries from the researched systems:

- [Payload plugins](https://payloadcms.com/docs/plugins/overview), custom components and hooks
  motivate trusted build-time contributions, typed admin surfaces and lifecycle hooks rather than
  loading code from the database.
- [Shopify app extensions](https://shopify.dev/docs/apps/build/app-extensions) and
  [theme app extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions)
  motivate explicit targets, merchant-facing settings, tenant enablement and page-level block
  attachment/versioning.
- [GrapesJS blocks](https://grapesjs.com/docs/modules/Blocks) and
  [components](https://grapesjs.com/docs/modules/Components.html) motivate treating blocks as
  reusable composition while keeping the canonical saved model as validated component/payload
  data; editor project JSON stays transient.

The remaining Phase 13 work is intentionally separate: data model/collection/source/query
execution, provider adapters for Commerce/Google Sheets/Mail/Stripe, server actions and the full
binding/action UI. These should register through the same kernel and publish compiler rather than
introducing another extension path.
