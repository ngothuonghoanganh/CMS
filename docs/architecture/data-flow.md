# Data and Request Flows

## Phase 2 page save

```text
PagePayload JSON
  -> Zod PagePayloadV1 validation
  -> PageController
  -> PageService ownership/version checks
  -> PageVersion snapshot + LandingPage draft pointer
  -> explicit API contract mapping
  -> MongoDB
```

PageVersion is a separate snapshot document. The API does not return Mongoose documents
directly, and the contracts package remains independent of Mongoose and editor engines.

## CMS and renderer shell

```text
Browser
  -> Next.js application (CMS or renderer)
  -> authenticated CMS management or isolated renderer shell

The Phase 4 CMS builder is the only browser surface that loads and edits a draft
payload. It uses the API client and builder adapter; the renderer remains a separate
consumer and does not import GrapesJS.
```

The CMS and renderer currently prove application boundaries only. Page creation,
loading, preview, publishing and public slug rendering are **NOT IMPLEMENTED**.

## API liveness flow

```text
HTTP request
  -> request ID middleware (reuse x-request-id or generate UUID)
  -> /api/v1/health/live
  -> HealthController
  -> HealthService
  -> versioned HealthResponse
  -> x-request-id response header
```

This path does not query MongoDB and is intended to answer whether the API process is
running.

## API readiness flow

```text
HTTP request
  -> request ID middleware
  -> /api/v1/health/ready
  -> HealthController
  -> HealthService
  -> Mongoose connection.readyState
  -> versioned HealthResponse { status: ok | degraded }
```

The readiness endpoint is deliberately small. It exposes connection state, not a future
domain health model.

## Error flow

```text
controller/service exception
  -> ApiExceptionFilter
  -> HTTP status mapping
  -> { error: { code, message, requestId } }
  -> no internal stack trace in client response
```

## Phase 4 builder flow

```text
CMS page management
  -> protected builder route
  -> current PageVersion payload
  -> GrapesJS through Builder Adapter
  -> supported visual edits
  -> Builder Adapter serialization
  -> PagePayloadV1 validation
  -> POST /pages/:pageId/versions with expectedVersionNumber
  -> immutable PageVersion + currentDraftVersionId
```

Raw GrapesJS project JSON is transient editor state only. The API receives only the
validated PagePayloadV1 snapshot, and a stale expected version becomes a visible
conflict instead of an overwrite.

## Deferred landing-page flows

The following flows remain intentionally outside Phase 4:

- draft -> preview -> publish
- PagePayload -> public renderer delivery
- visitor form/event -> API -> response/UI state
- lead collection, email, webhook and social integrations

## Phase 6 form submission flow

```text
Published PageVersion Vn
  -> public site/page/form-node resolution
  -> canonical Vn FormProps schema
  -> strict server validation and normalization
  -> FormSubmission(workspace/site/page/version/form scope)
  -> authenticated CMS submissions list/detail/status
```

The public route never accepts a workspace id or client-supplied schema. Draft changes
remain inactive until their PageVersion is published. `PagePayloadV1` is unchanged;
forms are represented by the minimum explicit V2 form node documented in
[`phase-6.md`](phase-6.md).

## Phase 8 analytics flow

```text
Published renderer
  -> anonymous sessionStorage session id
  -> native beacon/fetch page.viewed or element.clicked
  -> AnalyticsIngestionController
  -> published site/page/version and node ownership resolution
  -> compact AnalyticsEvent Mongo document
  -> AnalyticsRepository aggregation
  -> authenticated workspace-scoped AnalyticsQueryService
  -> CMS Analytics dashboard
```

Successful public form submissions remain authoritative in `FormSubmission`. After
that write, the API best-effort records a server-side `form.submitted` analytics event
with no form values. Analytics persistence failure is isolated from the lead response.
