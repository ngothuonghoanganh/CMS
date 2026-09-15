# Phase 20.1 continuity handoff

## Current state

The repository contains the Phase 20.1 hardening and no-code completion work.
The canonical Mongo tenant is `E2E Development` with database
`payload_tenant_e2e-development_3ad43433`. A dry-run of
`scripts/phase-20.1-backfill.mjs` reported one legacy dynamic page and six
entries requiring projections; apply it against the canonical tenant before
runtime verification.

## Important invariants

- Dynamic pages use `dynamicBasePath` as their indexed route identity. Do not
  reintroduce static `path`/`slug` on dynamic records.
- Query and entry list endpoints must keep database-side pagination/search/filter
  behavior. Do not restore version-wide in-memory scans.
- Collection field IDs are stable metadata. A field removal, rename, type
  change, or archive is rejected with a 409 while current/published page or
  template references exist.
- Published pages and published entries are independent release boundaries.
- Never use draft values in public route resolution or public SEO output.

## Next checks

1. Apply the scoped Phase 20.1 backfill after reviewing its dry-run output.
2. Start API, CMS, and renderer and run the browser E2E suite.
3. Exercise the canonical Products catalog and Product Detail pages, including
   entry edit, publish, discard, dynamic preview, and public draft isolation.
4. Run all repository gates and inspect any remaining Node engine warning; the
   current workspace uses Node 22 while the package declares Node 24+.
