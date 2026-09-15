# AI and Contributor Rules

This repository is a Conversion Website Platform. The canonical product and
architecture source of truth is [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
The current phase is read from its `CURRENT_PHASE` field.

## Read order

Before doing any code task:

1. Read `AGENTS.md`.
2. Read `docs/ARCHITECTURE.md`.
3. Inspect relevant source code.
4. Inspect relevant tests.
5. Then create an implementation plan.

Archived documentation under `docs/_archive/**` is historical context only. It
is not a current requirement, roadmap or architecture authority. When code,
archived documentation and the canonical architecture conflict, the canonical
architecture wins.

## Scope and architecture

- Work only in `CURRENT_PHASE` unless the task explicitly authorizes another phase.
- Do not revive frozen modules, old phase requirements or legacy behavior without
  an explicit request and architecture decision.
- Do not add speculative features, frameworks, plugins or abstractions.
- Do not preserve legacy compatibility automatically; use a deliberate compatibility
  boundary only when the architecture or production-data requirement calls for it.
- Prefer the smallest coherent change. Do not refactor unrelated code or start
  feature work during a governance, audit or documentation task.
- If a requirement conflicts with the architecture, stop implementation, report
  the conflict and propose an architecture decision first.
- Update `docs/ARCHITECTURE.md` only when an architecture decision actually changes;
  never rewrite it quietly to justify implementation.
- Do not create phase, handoff, summary or audit documents outside the canonical
  architecture document without an explicit reason.

## State and boundaries

- Maintain one canonical source of truth for application state. Do not introduce
  duplicate Builder, Properties, Canvas, GrapesJS, payload or renderer state.
- A property has one official editor. Other UI shortcuts must call the same
  command/store rather than implement an independent editor.
- Prevent invalid UI/schema states where possible instead of relying on a large
  validation error flow after the user makes an invalid change.
- Builder Canvas, Layers and Properties must read the same Builder Store.
- Builder mutations go through explicit commands/actions such as `insertNode`,
  `moveNode`, `removeNode`, `duplicateNode`, `updateNodeProps` and
  `updateNodeStyle`. Do not mutate GrapesJS directly and synchronize it back with
  effect chains.
- GrapesJS is a canvas adapter only, never the domain model, persistence model or
  business state.
- Keep backend dependencies directed from transport to application/domain logic;
  infrastructure may implement domain/application interfaces. Core modules must
  not import billing, workflow, analytics or extensions without an explicit
  architecture decision.
- Do not use deep private imports across module boundaries. Use public exports and
  avoid circular dependencies.
- Keep controllers/routes thin, business rules explicit and persistence details out
  of UI and public contracts.

## Coding standards

- Use the repository's strict TypeScript settings. Avoid unnecessary `any` and do
  not use it to evade a type error.
- Validate external boundaries explicitly with the existing Zod/schema conventions.
- Prefer deterministic business logic, dependency injection consistent with the
  existing NestJS conventions, small modules and meaningful names.
- Do not create giant utility files, hidden global state or magic business behavior.
- Reuse existing libraries and primitives. Every new dependency needs a clear
  justification and must fit the active architecture.
- Do not introduce N+1 queries, unbounded list loading, uncontrolled rerender loops,
  repeated polling, giant client dependencies or unnecessary full-page state
  serialization.

## Frontend and Builder UX

- The CMS user should not need to understand code, HTML or CSS for ordinary tasks.
- Show required fields before submit and use suitable controls: color picker for
  color, date control for dates, number control for numbers, select/radio for enums
  and switch/checkbox for booleans.
- Group long forms and use pagination or virtualization for large datasets where
  appropriate. Prefer a focused modal/drawer over an endless stack of panels.
- Make destructive actions explicit and avoid text overlap, layout shift and
  decorative churn outside the task scope.
- Do not duplicate business editing UI or property implementations.

## Tests and quality gates

Every behavior change needs appropriate tests. A task is complete only when the
applicable gates pass:

```text
format
lint
typecheck
relevant unit tests
relevant integration tests
build
critical E2E when applicable
governance check
```

Do not skip tests, delete failing tests, weaken assertions, disable lint/type
checks or hide errors merely to make CI green. Do not add a new blocking TODO,
duplicate state, architecture violation or undocumented dependency.

Never silently catch and ignore errors. Do not add silent fallbacks or magic
behavior; errors must remain actionable.

## Security, data and observability

- Never hardcode or expose secrets, tokens or passwords in code or logs.
- Do not bypass authorization, tenant isolation, sanitization or validation. Never
  trust client-provided tenant identity. Treat tenant isolation as a security
  boundary and do not expose internal data to the renderer.
- Do not introduce unsafe HTML/script execution without an explicit design.
- Do not make production-breaking schema changes without evaluating backward
  compatibility, migration, indexes, tenant databases and rollback. Do not create
  a migration only to rename something for appearance.
- Critical paths should use existing structured logging, actionable errors and
  request/correlation context when available. Do not log sensitive payloads
  casually.

## Workflow and report

For every task:

1. Understand: read the architecture and relevant source/tests.
2. Scope: write down `IN SCOPE` and `OUT OF SCOPE`.
3. Architecture check: verify boundaries and `CURRENT_PHASE`.
4. Implement: make the smallest coherent change.
5. Verify: run the appropriate quality gates and report blocked checks honestly.
6. Report: include `Changed`, `Why`, `Files`, `Tests`, `Architecture impact` and
   `Remaining issues`.

For an architecture-changing task, record the decision and consequences in
`docs/ARCHITECTURE.md` before implementation. Do not silently carry a conflict
forward.
