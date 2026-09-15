# Phase 14 — Automation & Workflow Engine

## Status

The first production-shaped workflow slice is implemented. It provides a tenant-safe,
declarative workflow model, versioned drafts, registry-backed execution, persistence-backed
execution history, and a CMS builder surface. The implementation keeps the Phase 13 boundary:
extensions contribute typed metadata and trusted in-process providers; tenant records never
contain JavaScript, module paths, SQL or executable source.

## Domain model and scopes

`WorkflowRecord` and `WorkflowVersionRecord` live in the tenant database through
`TenantModelRegistry`. A workflow has a `draftVersionId`, an optional `publishedVersionId`, an
`enabled` flag and one of three scopes:

- `tenant`: available to every workspace in the tenant;
- `workspace`: owned by one workspace;
- `page`: attached to one page and owned by its workspace.

The service enforces the current workspace on every read and mutation. Page workflows also have
dedicated `/pages/:pageId/workflows` routes. Page publishing validates that every workflow
attached to that page has a published version before compiling the page bundle.

## Versioning and graph validation

Draft edits create a new immutable version. Publishing validates the draft, marks that version
published and moves the workflow pointer at the application boundary. Enabling is rejected until
a published version exists.

The graph validator checks node and edge references, duplicate ids, orphan nodes, cycles,
condition branch completeness, invalid branch use, and unsafe configuration keys. Definitions are
allow-listed JSON: an action is selected by a registered type and receives resolved values, never
an expression to evaluate as code.

Bindings use paths such as `trigger.email`, `variables.plan` and `steps.create-lead.id`. Typed
literal values and comparison/logical expression operators are resolved by the workflow condition
evaluator. Secrets and credentials are not accepted as ordinary workflow values.

## Registries and extensions

The API exposes typed trigger, condition and action registries. Core entries include form/page
events, lead and commerce event triggers, manual execution, conditions, data/lead actions, delay,
and capability-backed mail, webhook, analytics, payment and commerce actions.

Phase 13 `ContributionRegistry` entries of type `trigger`, `condition` and `action` (including the
grouped `manifest.contributions.automation` form) are normalized into these registries. An action may
declare a capability; validation requires a provider in `CapabilityRegistry`, and execution calls
the provider through the controlled `WorkflowExecutionContext`. Providers can resolve a tenant
connection server-side; encrypted secrets are decrypted only at execution time and are never
returned to the CMS or persisted in step output.

The repository includes four reference definitions in
`apps/api/src/workflows/reference-workflows.ts`: lead qualification, delayed follow-up, CTA
analytics and payment order handoff. They are templates for tests and documentation, not
automatically seeded customer data. The capability adapters shipped in this phase are safe
reference providers; a real mail, payment, commerce or webhook extension can replace them by
registering the same capability.

## Runtime and reliability

Domain and renderer-facing events are normalized through `EventBus`, which assigns an event id if
the publisher did not provide one. Form submissions and analytics use stable persisted ids. The
execution store has a partial unique index on `workflowVersionId + triggerEventId`, so a duplicate
incoming event cannot create a second execution for the same published version.

Executions and step executions expose `pending`, `running`, `waiting`, `completed`, `failed`, and
`cancelled` states plus sanitized errors, attempts and step outputs. Delay nodes persist `nextRunAt`
and resume through a timer. Retry policy supports bounded attempts and exponential backoff. A
root/correlation id and a small workflow-depth guard prevent event-triggered loops. Workflow logs
include the engine component and execution metadata while redacting secret-like fields.

The current process worker scans due records on demand and schedules timers in the API process. It
is deliberately not described as a distributed queue or durable outbox; a future phase can attach
the same execution records to a shared queue and startup recovery worker without changing the
workflow contracts.

## Events and page runtime

The initial event catalog includes `form.submitted`, `lead.created`, `page.viewed`,
`button.clicked`, `page.published`, `payment.completed`, `payment.failed`, `order.created`,
`order.completed`, `booking.created` and `cart.abandoned`, plus manual runs. Public analytics
events are validated and persisted before their workflow event is published. Page-level workflow
selection is represented by `pageId`, and page publish is the lifecycle gate for attached draft
workflows.

Page runtime integration uses the canonical `button.clicked` and other page/domain events, while
page workflow management is available from the Pages detail view. The existing PageAction
contract remains the place for a future explicit `workflow.run` attachment; no page payload can
invoke a module or arbitrary function. The builder currently uses a responsive
palette/canvas/properties layout; the graph model already supports positions and branches, while a
richer drag/pan/zoom editor can be layered on later.

## API, CMS, RBAC and audit

The API surface is:

```text
GET    /api/v1/workflows/registry
GET    /api/v1/workflows
POST   /api/v1/workflows
GET    /api/v1/workflows/:workflowId
GET    /api/v1/workflows/:workflowId/versions/:versionId
PATCH  /api/v1/workflows/:workflowId
POST   /api/v1/workflows/:workflowId/validate
POST   /api/v1/workflows/:workflowId/publish
POST   /api/v1/workflows/:workflowId/enable|disable
POST   /api/v1/workflows/:workflowId/run
GET    /api/v1/workflow-executions
GET    /api/v1/workflow-executions/:executionId
POST   /api/v1/workflow-executions/:executionId/retry
```

Page-scoped create/list routes are available under `/api/v1/pages/:pageId/workflows`.
Workflow permissions are split into read/create/update/publish/enable/disable, execution read and
execution retry. Mutations write audit events without payload secrets. The CMS Operations area
adds a permission-aware Workflows view with creation, registry palette, draft editing, publish and
enable controls, manual runs, execution history, step detail and retry.

## Verification

Focused unit tests cover graph safety, typed condition evaluation and registry duplicate handling.
Playwright covers the end-to-end flow: create a manual workflow, publish, enable, run once and
observe a completed lead step. Existing API, CMS, renderer and contract suites remain the
regression gate. The supported toolchain target is Node 24 or newer.
