# Payload Landing Page

A landing-page builder for SMEs, marketers and agencies. Users build pages from guided sections,
save drafts, preview, publish safely, and roll back to any earlier release.

The current target is **MVP A (publish-first)**. The canonical product and architecture document
is [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); the UX design is in
[`docs/design/plp-ux-v1/`](docs/design/plp-ux-v1/README.md). Rules for agents and contributors
are in [`AGENTS.md`](AGENTS.md).

## Requirements

- Node 24 (`.nvmrc`) with corepack, which provides pnpm 12
- Docker with Compose v2

## Getting started

```sh
corepack enable pnpm
pnpm install
cp .env.example .env
pnpm infra:up      # MongoDB 9 replica set (:27117), RustFS S3 storage (:9100, console :9101), Mailpit (SMTP :1125, web :8125)
pnpm dev
```

| App      | URL                   | Purpose                                   |
| -------- | --------------------- | ----------------------------------------- |
| Admin    | http://localhost:3100 | Management UI and editor (proxies `/api`) |
| Renderer | http://localhost:3101 | Public pages, serves published releases   |
| API      | http://localhost:4100 | NestJS API (`GET /health`)                |
| Mailpit  | http://localhost:8125 | Emails the API sent; nothing leaves       |

`pnpm infra:down` stops the containers; data stays in Docker volumes.

## Cloud sessions

The repository also runs in Claude Code cloud sessions (claude.ai/code). Create one environment
for it, in the environment selector under the message box:

- **Network access**: Limited, with package managers allowed, plus these allowed domains for
  Playwright's browsers: `cdn.playwright.dev`, `playwright.download.prss.microsoft.com`,
  `playwright.azureedge.net`.
- **Environment variables**: none. `.env` is copied from `.env.example`, whose values are local
  only. Never put a real secret here: everyone who uses the environment can read it.
- **Setup script**: it caches Node 24, pnpm, the dependencies, the browsers and the container
  images between sessions.

  ```sh
  #!/bin/bash
  repo="$(git rev-parse --show-toplevel 2>/dev/null)"
  [ -f "$repo/scripts/cloud-env.sh" ] || repo="$(dirname "$(dirname "$(find / -maxdepth 6 -path '*/scripts/cloud-env.sh' -not -path '/proc/*' -print -quit 2>/dev/null)")")"
  bash "$repo/scripts/cloud-env.sh" image
  ```

At each start and resume, the SessionStart hook in `.claude/settings.json` runs
`scripts/cloud-env.sh session`: Node 24 on `PATH`, changed dependencies, and `pnpm infra:up`.
Elsewhere it does nothing. The apps' ports are not reachable from outside the session. To see the
screens, `pnpm --filter @plp/e2e visual:capture` captures each one (after `pnpm build`) and
`pnpm ui:gallery` turns them into a page that the session publishes as an Artifact.

## Scripts

| Script            | What it does                                                 |
| ----------------- | ------------------------------------------------------------ |
| `pnpm dev`        | Runs every app in watch mode                                 |
| `pnpm build`      | Builds packages and apps                                     |
| `pnpm lint`       | ESLint with type-aware rules                                 |
| `pnpm typecheck`  | `tsc --noEmit` in every package                              |
| `pnpm test:unit`  | Vitest unit tests                                            |
| `pnpm test:int`   | API integration tests against MongoDB (needs `infra:up`)     |
| `pnpm test:e2e`   | Playwright against production builds (needs `infra:up`)      |
| `pnpm ui:gallery` | A page of the screens `visual:capture` took (Cloud sessions) |
| `pnpm governance` | Module boundaries (dependency-cruiser) and repository rules  |
| `pnpm format`     | Prettier                                                     |
| `pnpm verify`     | Every gate except E2E                                        |

CI (`.github/workflows/ci.yml`) runs every gate, E2E included, on each pull request.

## Repository layout

```text
apps/admin          Next.js admin and editor
apps/api            NestJS API
apps/renderer       Next.js public renderer
packages/config     shared tsconfig presets
packages/contracts  shared Zod schemas and types
packages/ui         admin design tokens and base components
tests/e2e           Playwright tests
docs/               architecture and design
```

## Legacy code

The previous implementation is archived at tag `legacy-v0` and branch `legacy/v0`. It is
reference only and is not part of this codebase.
