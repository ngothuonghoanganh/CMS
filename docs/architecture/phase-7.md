# Phase 7 — Notifications and Integrations

## Status

Phase 7 is implemented as a workspace-scoped notification foundation for the
published forms introduced in Phase 6. The scope is deliberately limited to email
and webhook integrations, durable delivery records, retry handling and CMS
configuration. Automation, analytics, CRM/social connectors, billing,
collaboration and microservices remain deferred.

## Payload compatibility

`PagePayloadV1` and `PagePayloadV2` are unchanged. Integration configuration is not
stored inside the page payload and is never serialized by the GrapesJS adapter.
Bindings point to a landing page and a stable V2 form node id, while submissions
continue to record the published page-version id. A notification therefore uses the
same published schema and version semantics as the underlying submission.

## Domain model

The API persists three workspace-scoped records:

- `IntegrationRecord` stores the name, enabled flag, type and non-secret config.
  Email config contains recipients and a subject template. Webhook config contains
  the destination URL and the `form.submitted` event type.
- `FormIntegrationBindingRecord` maps a landing page/form node pair to selected
  integration ids. The pair is unique per workspace.
- `IntegrationDeliveryRecord` is the durable outbox entry for one
  `submissionId`/`integrationId` pair. It records `pending`, `processing`,
  `delivered` or `failed`, attempt count, lease/retry timestamps and a bounded
  error message.

The delivery uniqueness constraint makes submission retries idempotent: an already
enqueued integration is not duplicated for the same submission.

## Delivery flow

```text
published V2 form submission
  → persist FormSubmission
  → resolve page/form binding and enabled integrations
  → upsert durable pending deliveries
  → return the visitor response

worker loop
  → claim pending delivery with a lease
  → load published submission context
  → decrypt an integration secret in memory when needed
  → invoke email or webhook adapter
  → mark delivered, or retry/fail with bounded state
```

The worker is an in-process Nest worker backed by Mongo state. It scans once at
startup and every second, claims up to 20 records per pass, reclaims expired
processing leases, and allows four total attempts. Retry delays are 0, 30 seconds,
2 minutes and 10 minutes. External provider I/O is detached from the public
submission request; the durable record remains recoverable if the provider is down
or the process exits.

The CMS can manually retry a failed delivery. Manual retry resets its attempt count
and schedules it immediately, but still requires the integration to exist and be
enabled.

## Management API

All authenticated routes require the active workspace and apply workspace filters in
the service layer:

```text
POST   /api/v1/workspaces/:workspaceId/integrations
GET    /api/v1/workspaces/:workspaceId/integrations
GET    /api/v1/workspaces/:workspaceId/integrations/:integrationId
PATCH  /api/v1/workspaces/:workspaceId/integrations/:integrationId
DELETE /api/v1/workspaces/:workspaceId/integrations/:integrationId

GET    /api/v1/pages/:pageId/form-integrations
PATCH  /api/v1/pages/:pageId/form-integrations/:formNodeId

GET    /api/v1/integration-deliveries
POST   /api/v1/integration-deliveries/:deliveryId/retry
```

The API never returns plaintext secrets. Webhook responses expose only
`secretConfigured`; an update can replace or explicitly clear the secret. Webhook
secrets are encrypted with AES-256-GCM using `INTEGRATION_SECRET_ENCRYPTION_KEY`.
Creating a secret-backed integration is rejected when that key is not configured.

## Adapters

The email adapter renders a bounded plain-text message from the published form
context. The default `fake` provider records a successful delivery for local tests
and development. The optional `resend` provider uses `RESEND_API_KEY` and
`EMAIL_FROM`; provider response bodies and credentials are never written to logs.

The webhook adapter sends the versioned `FormSubmittedWebhookV1` JSON envelope:

```json
{
  "event": "form.submitted",
  "version": 1,
  "submissionId": "…",
  "landingPageId": "…",
  "formId": "…",
  "submittedAt": "…",
  "data": { "fieldName": "value" }
}
```

It adds `X-Payload-Event`, `X-Payload-Version` and `X-Payload-Timestamp`. When a
secret is configured it also adds
`X-Payload-Signature: sha256=<hex>`, where the HMAC-SHA256 input is
`<timestamp>.<raw JSON body>`.

## Webhook security

Webhook destinations are validated both when configured and immediately before
delivery. HTTPS is required by default. The resolver performs DNS lookup and blocks
loopback, private, link-local, carrier-grade NAT, metadata, multicast/reserved and
local hostnames, including IPv4-mapped IPv6 addresses. Redirects are not delegated
to the HTTP client: at most three redirects are followed and every destination is
validated again. Credentials and URL fragments are rejected.

`INTEGRATION_ALLOW_HTTP_WEBHOOKS=true` and
`INTEGRATION_ALLOW_LOCAL_WEBHOOKS=true` exist only for controlled local development
and E2E tests. Production deployments should leave both values false.

## CMS surface

The CMS now has an Integrations view for creating, editing, enabling/disabling and
deleting email/webhook integrations, viewing delivery logs and retrying failures.
Landing Page settings show the current draft's V2 form nodes and allow selecting
enabled integrations per form. The UI displays only configuration metadata and
never receives a stored secret value.

## Validation

Phase 7 coverage includes contract validation, AES-GCM vault round trips, webhook
SSRF policy, deterministic signing, Mongo-backed delivery and workspace isolation,
the fake email path, the controlled local webhook path and the Playwright CMS/public
form flow. The normal E2E harness opts into local HTTP/loopback only for its
controlled test webhook; production defaults remain secure.

## Boundary and known limitations

The worker is currently in-process and Mongo-backed rather than a separate queue
service. The fake email provider is the default local provider; production email
requires explicit provider configuration. There is no provider-specific delivery
dashboard, template editor, event replay history beyond the bounded delivery record,
or rate-limit policy per destination. These are future work and are outside Phase 7;
Phase 8 is implemented separately in [`../../phase-8.md`](../../phase-8.md) and does
not change the page payload or notification delivery boundary.
