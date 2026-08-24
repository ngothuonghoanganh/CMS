# Phase 8 — Analytics & Tracking

## Status

Phase 8 is implemented as a first-party, workspace-scoped analytics foundation for
published landing pages. It records compact raw events in MongoDB and aggregates
reports on demand for the CMS. Phase 9 is documented separately in
[`docs/phase-9.md`](phase-9.md); its domain and SEO settings remain outside the
canonical page payload described here.

## Scope and architecture

```text
Published renderer
  -> native sendBeacon/fetch client
  -> POST /api/v1/analytics/events
  -> published page/CTA ownership resolution
  -> AnalyticsEvent (MongoDB)
  -> AnalyticsRepository
  -> AnalyticsQueryService aggregation
  -> authenticated CMS Analytics view
```

The public event endpoint never accepts a workspace id as authority. It resolves the
unique site/page slug pair and the currently published PageVersion on the server.
CMS query routes always use the authenticated workspace context.

`PagePayloadV1` and `PagePayloadV2` are unchanged. Stable page node ids are used as
click targets; integration and analytics configuration are not embedded in page
payloads.

## Event contract

Browser events use strict `AnalyticsEventV1` JSON:

- `page.viewed` — one event per renderer mount, with an anonymous session id and
  sanitized attribution context.
- `element.clicked` — only published `button` nodes, identified by `nodeId`.

The server records `form.submitted` after the authoritative `FormSubmission` has been
persisted. It carries the submission id and never copies form field values. Stored
events retain the event version, workspace/site/page/version ownership, server
`receivedAt`, bounded `occurredAt`, optional session id, sanitized attribution and
coarse device category.

The ingestion contract rejects unknown fields, unsupported event types, invalid page
or node targets, oversized bodies, invalid session ids and timestamps more than 15
minutes from server time. The process-local limiter allows 120 events per IP per
minute; the IP is used only for that short-lived protection and is not persisted.

## Metrics

- **Page views** — count of `page.viewed` events.
- **Sessions** — distinct anonymous `sessionId` values on page views. A session is a
  browser `sessionStorage` lifetime and is not a unique-human claim.
- **Form submissions** — authoritative `FormSubmission` records in the selected UTC
  range. The matching server event supplies attribution and conversion correlation.
- **CTA clicks** — count of validated `element.clicked` events for published button
  nodes.
- **Conversion rate** — `submissions / sessions * 100`. It can exceed 100% when a
  session submits more than once or submissions arrive without a tracked page view;
  the UI renders finite values and never shows `NaN` or `Infinity`.

Reports support Today, Last 7 days, Last 30 days and custom ranges up to 366 days.
Timestamps are stored and displayed in UTC. Timeline buckets are UTC calendar days.
The API exposes workspace overview and page-specific reports with views, sessions,
submissions, conversion, CTA clicks, trends, top pages, referrers, campaigns and
device breakdowns.

## Attribution

The renderer captures only allowlisted `utm_source`, `utm_medium`, `utm_campaign`,
`utm_term` and `utm_content` values, each with a 100-character limit. Values are
captured at session entry and reused for later events. Campaign reports use the
simple first-touch context from the first page view in a session.

Referrers are reduced to a hostname. Query strings, fragments, credentials and raw
URLs are not persisted. Missing referrer is reported as `direct`. Device context is
coarse (`desktop`, `mobile`, `tablet`, `unknown`) and raw User-Agent is not stored.

## Privacy and retention

Analytics events never contain form answers, email, phone, name, message, password,
cookies, Authorization headers, raw IP addresses, fingerprints, full request bodies,
PagePayloads or provider secrets. FormSubmission remains the separate Phase 6 lead
record and is not duplicated into analytics.

Raw analytics events use a Mongo TTL index controlled by
`ANALYTICS_RETENTION_DAYS` (default 365 days, independently from submissions and
integration deliveries). There is no rollup collection or external warehouse; raw
events are aggregated on demand.

## Reliability and performance

The renderer uses native browser APIs and does not block initial page rendering,
navigation, CTA behavior or form submission. Tracking failures are swallowed. Page
views are sent from a mount effect guarded against React rerender/Strict Mode repeats.
Analytics recording after form persistence is best effort; an analytics database
failure cannot remove or fail the lead.

## Security and tenancy

Published page ownership, published version and button membership are resolved
server-side. Authenticated overview/page queries include `workspaceId` in every page,
event and submission filter. Page-id tampering returns not found rather than another
workspace's report. Zod allowlists prevent arbitrary Mongo operators or nested event
metadata from reaching persistence.

## Known limitations

- Sessions are anonymous browser sessions, not exact unique visitors.
- There is no advanced bot detection, fingerprinting or cross-device identity.
- Attribution is simple first-touch, not a multi-touch attribution model.
- The limiter is process-local and suitable for the current single-instance baseline.
- Reports are Mongo aggregations over raw events; no OLAP warehouse or real-time
  websocket is included.
- The public route depends on a globally unique site slug because the current public
  URL does not include a workspace or hostname discriminator.
