# Phase 19 — Navigation/Menu, Header/Footer, Template refactor (completed handoff)

This file began as the implementation handoff. The remaining UI, migration and
end-to-end work listed below has now been completed; see
[`phase-19-final-handoff.md`](phase-19-final-handoff.md) for the final delivery
record.

## What was wrong

- Navigation had grown a full draft/published publishing lifecycle
  (`draftItems`/`publishedItems`/`hasUnpublishedChanges`/`publishForSite`/
  `validateBeforeSitePublish`/`navigationWarnings`), conflating menu data with
  global page chrome.
- Header/Footer were persisted inside `SiteGlobals.header`/`footer` and
  auto-rendered by the renderer on every page.
- The renderer fell back from Header/Footer to the main/footer navigation.
- Pages did not explicitly decide their Header/Footer.
- Templates were unversioned `name/description/payload` records with no
  attachment snapshot and no clone-on-apply semantics.

## What changed

1. **Menu data domain** — `NavigationService` is now pure menu data with a
   single `items` source. Removed `publishForSite`, `validateBeforeSitePublish`,
   `NAVIGATION_TARGET_DRAFT` warnings, `draftItems`/`publishedItems`. Kept menu
   validation, anchor validation, target resolution and `navigation-view`
   binding.
2. **Layout extensions** — new `LayoutExtensionResource`/`LayoutExtensionVersion`
   schemas, service and controller (`/sites/:siteId/layouts/:kind`) with
   independent draft/publish/discard/versions.
3. **Page layout attachments** — `PageRecord.layoutAttachments` +
   `PageService.getLayout`/`updateLayout` + `PageLayoutAttachment`/slot contract.
4. **Renderer** — removed auto Header/Footer rendering and the navigation
   fallback; added `renderLayoutExtension`. The route shell renders only
   explicit attachments.
5. **SiteGlobals** — reduced to social links; Header/Footer ownership removed.
   `Site.publish` no longer snapshots navigation.
6. **Templates** — versioned model (`TemplateVersion`), immutable versions,
   `publish`/`versions`/`apply` endpoints. Apply deep-clones payload and
   attachment config (no live link).
7. **Site schema** — removed `primaryNavigationId`/`footerNavigationId`.

## Invariants (verified by unit tests)

- Menu is data; Header is layout.
- No attachment → no Header/Footer rendered.
- Navigation never renders automatically.
- Header/Footer draft never affects public pages until publish.
- Template changes never mutate already-created pages.
- Publishing a referenced Header/Footer updates all pages using it.

## Validation

- `pnpm typecheck` — pass
- `pnpm lint` — pass
- `pnpm test` — pass (54 API + 39 contracts + 20 renderer + 105 CMS)
- `pnpm build` — pass

## Historical follow-ups (completed in the final delivery)

- Dedicated Header/Footer and Template Builder routes now use the shared editor
  and canonical document APIs.
- Template version history, duplicate/restore-as-new-version, publish, and the
  create-page-from-template flow are wired in the CMS.
- The idempotent legacy migration script and helper tests are present.
- The Phase 19 Playwright suite covers layout lifecycle, preview/live parity,
  explicit placement, custom extensions and template authoring/apply flows.

## Key files

- Contracts: `packages/contracts/src/index.ts`
- API: `apps/api/src/domain/{navigation,site,page,template,layout-extension}.{service,controller}.ts`
- Schemas: `apps/api/src/persistence/schemas/{navigation,site,page,template,layout-extension}.schema.ts`
- Renderer: `apps/renderer/app/renderer.tsx`, `apps/renderer/app/[[...segments]]/page.tsx`, `apps/renderer/app/preview/[pageId]/preview-bridge.tsx`
- Docs: `docs/architecture/{layout-extensions,menu-domain,template-versioning,page-composition}.md`
