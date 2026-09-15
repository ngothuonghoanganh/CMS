# Phase 7 Handoff — Notifications and Integrations

## Delivered

Phase 7 adds workspace-scoped email/webhook integrations to the Phase 6 published
form flow. Submissions are persisted first, then integration deliveries are
upserted into Mongo and processed by a lease-based in-process worker. The worker
supports bounded retries, expired-lease recovery and authenticated manual retry.

`PagePayloadV1` and `PagePayloadV2` were not changed. Form bindings live in their
own collection, so notification configuration cannot alter canonical page payloads
or published-version validation.

## Main implementation locations

- Shared Zod contracts: `packages/contracts/src/index.ts`
- Persistence models: `apps/api/src/persistence/schemas/integration*.schema.ts`
- Integration CRUD/bindings/deliveries: `apps/api/src/domain/`
- Adapters and security: `apps/api/src/domain/integrations/`
- Submission enqueue point: `apps/api/src/domain/submission.service.ts`
- CMS integration and form-binding UI: `apps/cms/app/integrations-view.tsx` and
  `apps/cms/app/cms-dashboard.tsx`
- E2E flow: `tests/e2e/integrations.spec.ts`

## Durable decisions

1. Delivery records are the outbox boundary. Provider failures do not fail the
   visitor submission response after the submission has been stored.
2. Delivery uniqueness is `(submissionId, integrationId)` within Mongo, preventing
   duplicate sends from repeated enqueue attempts.
3. Secrets are encrypted at rest with AES-256-GCM and excluded from normal Mongoose
   selection. API responses expose a boolean `secretConfigured`, never plaintext.
4. Webhook URL policy is enforced at configuration and delivery time, including DNS
   resolution, private-network blocking and per-hop redirect validation.
5. The fake email provider is explicit and deterministic for local tests. Resend is
   optional and is selected only with `INTEGRATION_EMAIL_PROVIDER=resend`.
6. Local webhook E2E uses opt-in HTTP/loopback environment flags in
   `playwright.config.ts`; those flags must remain false in production.

## Useful commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e

RUN_MONGO_TESTS=true \
INTEGRATION_EMAIL_PROVIDER=fake \
INTEGRATION_ALLOW_HTTP_WEBHOOKS=true \
INTEGRATION_ALLOW_LOCAL_WEBHOOKS=true \
pnpm --filter @payload/api test
```

The repository currently targets Node.js 24 LTS; the available local runtime may
print the existing Node.js 22 engine warning. MongoDB must be running for the
opt-in persistence suite and the E2E harness.

## Next safe work

Future work can add more adapters behind `IntegrationAdapter` and `EmailProvider`,
or move the worker to a dedicated queue, without changing the public form payload
or the delivery contract. Before doing so, preserve workspace filters, the secret
redaction boundary, the webhook URL policy and the `(submissionId, integrationId)`
idempotency constraint.

## Phase 8 continuation

Phase 7 remains complete and unchanged at its notification boundary. Phase 8 adds:

- `AnalyticsEventRecord` in `analyticsEvents` with workspace/page/version ownership,
  compact event fields, targeted indexes and a TTL index controlled by
  `ANALYTICS_RETENTION_DAYS`;
- strict `AnalyticsEventV1` and analytics report contracts in
  `packages/contracts/src/index.ts`;
- public `POST /api/v1/analytics/events` with published-page/node validation,
  timestamp bounds, sanitization and process-local abuse protection;
- authenticated `GET /api/v1/analytics/overview` and
  `GET /api/v1/analytics/pages/:pageId` backed by `AnalyticsRepository` and
  `AnalyticsQueryService`;
- renderer sessionStorage tracking for page views and button clicks, plus server-side
  conversion recording after `FormSubmission` persistence;
- CMS Analytics navigation and dashboard with date ranges, metrics, timeline, top
  pages, referrers, campaigns, devices and loading/empty/error/retry states.

Durable Phase 8 decisions:

1. `PagePayloadV1`/`V2` stay frozen. Browser slugs and node ids are lookup hints only;
   the API derives workspace and published version from Mongo.
2. Sessions are anonymous `sessionStorage` ids. They are labeled Sessions rather than
   unique visitors and are not fingerprinted.
3. Referrers are stored as hostnames, UTM fields are allowlisted and bounded, and raw
   IP/User-Agent/form values are not persisted.
4. FormSubmission is the submission metric source of truth. `form.submitted` is a
   PII-free, best-effort analytics event used for session/attribution breakdowns.
5. Raw events are retained by the configurable Mongo TTL policy; no rollup or
   external warehouse is introduced.

Important Phase 8 files:

- `apps/api/src/domain/analytics.controller.ts`
- `apps/api/src/domain/analytics.service.ts`
- `apps/api/src/domain/analytics.repository.ts`
- `apps/api/src/domain/analytics-query.service.ts`
- `apps/api/src/persistence/schemas/analytics-event.schema.ts`
- `apps/renderer/app/analytics-client.tsx`
- `apps/cms/app/analytics-view.tsx`
- `docs/phase-8.md`

Known limitations are documented in `docs/phase-8.md`: session is not a unique-human
metric, attribution is simple first-touch, bot detection is intentionally basic, and
the public site slug remains the current tenant discriminator.

Phase 9 is implemented in [`docs/phase-9.md`](../phase-9.md). Its custom-domain and
SEO settings remain outside the canonical page payload and do not change the Phase 7
notification boundary.
