# Rules for agents and contributors

This repository is **Payload Landing Page**: guided landing-page builder, safe publishing, release
history and rollback. The canonical product and architecture source is
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). If this file and the architecture disagree, the
architecture wins; report the conflict instead of picking one silently.

## Read order

Before any code task:

1. `AGENTS.md` (this file).
2. `docs/ARCHITECTURE.md`: business invariants (§2), boundaries (§3), ADRs (§4), slices (§5).
3. For UI work: `docs/design/plp-ux-v1/README.md` and the matching screen in `screens/`.
4. The source and tests you will touch.
5. Then write a plan with explicit `IN SCOPE` and `OUT OF SCOPE`.

The pre-rebuild code lives at tag `legacy-v0` and branch `legacy/v0`. It is reference only: never
copy code from it, and never revive its modules (billing, workflows, extensions, collections,
GrapesJS, Ant Design, database-per-tenant).

## Scope

- Work on the current slice in `docs/ARCHITECTURE.md` §5 unless the task explicitly names another.
- No speculative features, packages, abstractions or configuration for later slices.
- If a requirement conflicts with the architecture, stop, report the conflict and propose an ADR.
  Update `docs/ARCHITECTURE.md` only when a decision actually changes, and record it as an ADR.
- Do not create phase, handoff, summary or audit documents. Progress lives in commits and PRs.

## Business invariants (never break)

- Saving is not publishing. Autosave updates the draft and its `revision` only.
- Page status (`draft`, `live`, `live_with_changes`, `unpublished`) is derived on the server and
  never stored.
- Releases are immutable. Only `movePointer` writes `publishedReleaseId`/`publishedSlug`, inside a
  transaction, guarded by the expected current pointer. Publish also checks the draft revision and
  an idempotency key.
- Rollback and undo only move the pointer; they never edit a release or the draft. Reasons go to
  the activity log.
- The renderer serves releases only. No release means 404, never a draft.
- Preview links are signed, expiring and `noindex`.
- The editor has no free styling: variants, AA-checked color schemes and spacing presets only.

## Architecture rules

- Dependency direction: `contracts ← sections/schema ← api`, `contracts ← sections/react ← admin,
renderer`, `ui ← admin`. Apps never import each other. `pnpm governance` enforces this.
- Tenancy: one database. Every tenant document carries `workspaceId`. Never trust a workspace id
  from the client. Data access goes through repositories that require a `WorkspaceScope`.
  Cross-workspace access returns 404.
- Validate every boundary (body, query, params, env, public responses) with Zod schemas from
  `@plp/contracts` or the section registry.
- Controllers stay thin. Business rules live in services or pure functions with unit tests.
- Editor state has one store. Canvas, page structure and properties panel read it and change it
  only through commands. A property has exactly one official editor; shortcuts call the same
  command.
- Admin and renderer render sections with the same component from `@plp/sections`.
- `@plp/ui` (admin tokens and components) is admin-only. New admin UI uses its tokens; no second
  palette.
- No Ant Design, no GrapesJS, no free-form builder, no HTML in content.

## Code standards

- TypeScript strict. No `any`, no `@ts-ignore`, no non-null assertions to silence errors.
- Never swallow errors. Rethrow with context (`{ cause }`) or return an explicit, actionable error.
  Errors from the API use `application/problem+json`.
- No N+1 queries, unbounded lists, polling loops or full-page state serialization.
- Never log secrets, cookies, tokens or personal data.
- Every new dependency needs a reason that fits the architecture; take the latest stable version
  and record notable ones in ADR-002.
- Match the surrounding code: naming, comment density, idioms. Comments explain why, not what.

## Commands

```sh
corepack enable pnpm            # once; Node 24 (see .nvmrc)
pnpm install
cp .env.example .env            # local values only
pnpm infra:up                   # MongoDB replica set + S3 storage (docker compose)
pnpm dev                        # admin :3100, renderer :3101, api :4100
pnpm infra:down
```

## Quality gates

A task is complete only when every applicable gate passes:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:int        # needs pnpm infra:up
pnpm build
pnpm test:e2e        # needs pnpm infra:up and pnpm build
pnpm governance
```

- Every behaviour change needs tests: unit for pure logic, integration (Supertest + real MongoDB)
  for API behaviour and tenant isolation, Playwright for the main user flow of the slice.
- Never skip, delete or weaken tests, disable lint/type rules, or hide errors to get green.
- Report exactly which gates ran. Never claim a gate passed if it did not run.

## Git

- One branch per slice, a PR into `main`. Never force-push `main`.
- Small commits with clear messages.

## Report format

End every task with: `Changed`, `Why`, `Files`, `Tests` (each gate and its result),
`Architecture impact` (the ADR it follows or changes) and `Remaining issues`.
