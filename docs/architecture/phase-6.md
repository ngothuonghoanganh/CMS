# Phase 6 — Forms and Leads Foundation

## Status

Phase 6 implements the first form-to-submission flow in the existing NestJS modular
monolith. It stops at durable submission management. Email, automation, analytics,
CRM integrations, social channels, billing and collaboration remain deferred.

## Payload compatibility decision

`PagePayloadV1` remains byte-for-byte and semantically frozen. The V1 node union is
strict and has no generic extension or reference that could place a form in the page
tree while preserving its schema and published-version behavior. A form kept in a
separate collection would not preserve its visual position in the canonical payload.

Therefore Phase 6 adds the minimum explicit `PagePayloadV2` union:

- V2 retains the V1 metadata and existing node semantics.
- V2 adds one `form` leaf node with an ordered `FormProps` field list.
- `PagePayloadSchema` dispatches explicitly on `version`.
- V1 snapshots remain permanently readable and are never migrated automatically.
- The builder and renderer dispatch V1/V2 explicitly; GrapesJS data is still never
  persisted.

## Form representation

Each form field has a stable `id` separate from its editable label and safe `name`.
Supported field types are `text`, `email`, `phone`, `textarea`, `select`, `checkbox`
and `radio`. Select/radio options are required and validated as a bounded unique list.
The form also stores a submit label and a success message. The form is a leaf node;
there are no nested forms, conditional branches or multi-step workflows.

The builder uses the live GrapesJS component model as its only editor source of truth.
The Form block can be added inside a section/container, and the inspector supports:

- adding, removing and moving fields;
- editing labels, placeholders and required state;
- safe field-type changes with option normalization;
- editing submit and success text;
- save, reload and a second edit/save round trip.

The editor serializes V2 only when a form is present. Existing V1 pages without a form
continue to serialize as V1.

GrapesJS keeps the canonical Form node as the model node and adds editor-only preview
children for the configured fields and submit button. These children make the form
visible and selectable on the canvas, but carry a preview marker and are discarded by
the adapter; the persisted V2 form remains a leaf with `props.fields`. Preview children
are rebuilt after insertion, hydration and inspector edits so add → save → reload does
not depend on GrapesJS HTML export.

## Renderer

The public renderer maps the V2 form node to semantic `form`, `label`, `input`,
`textarea`, `select` and `button` elements. It uses a client-side submission component
only for interaction; the canonical schema remains the versioned page payload. Labels
are associated with controls, browser validation improves UX, and React escaping is
used for user-controlled messages and values.

The public submission URL is resolved from the public site/page slug and the form node
id. Preview pages render the form without a public submission target.

## Submission flow and version semantics

```text
published PageVersion Vn
  ↓
resolve public site/page/form node
  ↓
load the published Vn form schema
  ↓
strict server-side validation and normalization
  ↓
FormSubmission persistence
  ↓
authenticated CMS Submissions view
```

The public route is:

```text
POST /api/v1/public/sites/:siteSlug/pages/:pageSlug/forms/:formNodeId/submissions
```

It does not accept workspace ids or a client-supplied schema. Unpublished pages and
unknown forms return `FORM_NOT_FOUND`. If a draft changes `Email` to `Phone`, the
public endpoint continues to validate the published snapshot until that draft is
published. Each submission stores `workspaceId`, `siteId`, `landingPageId`,
`pageVersionId`, `formNodeId`, ordered field values, status and timestamps.

## CMS management

Authenticated management endpoints are:

```text
GET   /api/v1/submissions
GET   /api/v1/submissions/:submissionId
PATCH /api/v1/submissions/:submissionId    { status: new | read | archived }
```

Queries are workspace-scoped and support offset pagination, status, site/page and
date filters, plus a bounded value search. The CMS navigation includes Submissions;
the list shows page, date, status and a useful contact value, while detail displays
all submitted fields with their schema labels and the page/version context.

## Security and privacy controls

- Public submissions resolve ownership from public slug/page data; clients cannot
  choose a workspace or validation schema.
- Unknown/duplicate field ids are rejected. Required values, email format, select/radio
  membership, checkbox booleans and bounded text are validated server-side.
- JSON request bodies are capped at 64 KiB; form fields, options and total field counts
  are bounded by the shared contract.
- A hidden honeypot is accepted but never persisted when filled.
- A small in-process per-IP/per-form limiter allows 20 requests per 60 seconds. This is
  intentionally a single-instance baseline; distributed throttling is deferred.
- Submission values are stored as strings/booleans only. Raw HTML is not executed or
  injected into CMS detail, success states or logs.
- Request logging continues to redact cookies/authorization, and submission bodies are
  not added to Pino log fields.
- Management queries always include workspace ownership. No raw Mongoose document is
  returned from the submission API.

## Tests and validation

Coverage includes V2 contract rejection/serialization, builder form round trips and
editor-only preview children, canvas/layer visibility, adapter output, save/reload
retention, semantic renderer output, Mongo-backed submission validation,
published/draft isolation, invalid email/unknown fields, workspace isolation, CMS
status management, and the Playwright critical flow.

The final validation commands for this phase are:

```text
pnpm format:check  — PASS
pnpm lint          — PASS
pnpm typecheck     — PASS
pnpm test          — PASS (unit suite; Mongo integration is opt-in)
pnpm build         — PASS
pnpm test:e2e      — PASS (22 browser tests)
RUN_MONGO_TESTS=true pnpm --filter @payload/api test — PASS (13 API tests)
```

The workspace currently runs Node.js 22.19.0 while the repository target is Node.js 24
LTS, so pnpm prints the existing engine warning. Node.js 24 remains the authoritative
runtime target.

## Known limitations and Phase 7 boundary

The limiter is process-local, forms do not support file uploads, and there is no email
notification, webhook, automation, analytics, CRM, social integration or custom
workflow. Phase 7 has not been started.
