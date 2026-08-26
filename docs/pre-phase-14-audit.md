# Pre-Phase 14 cleanup audit

## Scope and safety boundary

This audit was performed against the current working tree before cleanup work. It
does not treat a missing static import as proof that a module is unused: the
Extension Registry, Contribution Registry, Capability Registry and the GrapesJS
lazy import are runtime boundaries.

The current tree contains a large staged Phase 13 change set and untracked
workflow files (`apps/api/src/workflows`, `apps/cms/app/workflows-view.tsx`,
`packages/contracts/src/workflows.ts`, and related tests/docs). Those workflow
artifacts are outside this sprint's scope. They are intentionally neither
modified nor removed by this cleanup work.

## Baseline

| Check               | Result                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check` | Pass                                                                                                                            |
| `pnpm lint`         | Pass                                                                                                                            |
| `pnpm typecheck`    | Pass                                                                                                                            |
| `pnpm test`         | Pass (54 API tests, 16 CMS tests, 19 contract tests, 7 renderer tests; existing integration tests without Mongo remain skipped) |
| `pnpm build`        | Pass                                                                                                                            |
| `pnpm test:e2e`     | Pass (43 Playwright tests)                                                                                                      |

The commands ran with Node 22.19.0 while `package.json` requires Node 24 or
newer. This is an environment warning, not a cleanup regression; final CI should
also run under the declared Node version.

The existing browser suite exercises authenticated navigation, desktop/tablet
shell behavior, extension request settling, builder save/reload, drag/drop,
responsive canvas behavior, extension delivery and publishing. It did not reveal
a request loop in the covered flows.

## Cleanup inventory

| Area               | Evidence                                                                                                                                                                                                                                                         | Decision                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime registries | Extensions are resolved through API registries and builder/runtime adapters; GrapesJS is loaded with a lazy import.                                                                                                                                              | Preserve; static-import analysis is not sufficient to remove these modules.                                                                   |
| Dependencies       | Every direct dependency is referenced from application code, tests, tooling, or configuration.                                                                                                                                                                   | No safe dependency removal.                                                                                                                   |
| Debug code         | The only production `console.log` is the CLI's intentional user-facing command output. No `debugger`, TODO, FIXME, or HACK markers were found.                                                                                                                   | Preserve CLI output; no debug cleanup needed.                                                                                                 |
| CMS form controls  | Native inputs/selects/textareas occur across the dashboard, extension, user, role, domain, SEO, integration and Builder views. The shared field family is now used by the login flow and Builder inspector, while resource forms remain native during this pass. | Keep the foundation dependency-free and migrate resource forms incrementally.                                                                 |
| Builder properties | Width, spacing, color, radius and typography were free-text style fields although the PagePayload schema has bounded semantics.                                                                                                                                  | Typed controls now cover the supported dimensions, spacing, colors, alignment and date-time fields without changing the PagePayload contract. |
| Tables             | `table-shell` and `data-table` already provide local horizontal scroll and shared row structure, but pagination/filter markup is still page-specific.                                                                                                            | Retain the existing table surface; document and consolidate its behavior incrementally.                                                       |
| CSS                | `globals.css` combines shell, builder, extension, workflow and responsive rules and has repeated literal colors. The few `!important` rules are GrapesJS canvas overrides or reduced-motion safeguards.                                                          | Do not delete without visual verification; add tokens and new primitive styles first, then retire duplicated declarations only when migrated. |

## Implementation priorities

1. Add a typed field/control family using native controls, avoiding new UI
   dependencies and preserving the Next.js client boundary.
2. Migrate the Builder inspector: numeric/unit dimensions, spacing, color,
   alignment, date-time and relevant native semantic controls.
3. Keep extension-specific values constrained to existing contracts. Phase 13
   currently exposes contribution `propertyKeys`, not a typed property schema;
   no speculative extension schema or PagePayload change is introduced.
4. Add behavior tests for control normalization and Inspector mapping; add
   representative Builder browser coverage.
5. Document the UI system and remaining cleanup debt after migration.

## Remaining debt after this audit

- Resource forms still need gradual migration to the common field family; doing
  all of them at once would mix business-flow changes with this first foundation
  pass.
- CSS is still one large global stylesheet. Split only along proven ownership
  boundaries after the new primitives have consumers.
- A future typed extension property schema can be added through the established
  contribution contracts when a real extension needs it; it is intentionally not
  invented by this cleanup sprint.
