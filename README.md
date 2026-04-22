# Design Claude - Burnguard system

Working title: `BurnGuard Design`

BurnGuard Design is a self-hosted alternative to Claude Design, packaged as a local Windows app. It wraps locally installed LLM CLIs such as Claude Code and Codex, stores all project data under `~/.burnguard/`, and provides a chat-plus-canvas workflow for generating prototypes and slide decks.

## Status

Phase 1 is in active implementation.

Implemented now:
- shared contracts for projects, sessions, events, files, systems, artifacts, and exports
- Bun + Hono backend with SQLite bootstrap, migrations, seed data, config persistence, backend detection, and SSE routes
- frontend Home, Project, Design System, Settings, and Export wiring against real APIs
- project creation, session replay, live event streaming, file listing, refresh, HTML zip export, and production frontend serving
- Windows executable build via `bun build --compile`

Still incomplete for full Phase 1 sign-off:
- real Claude Code adapter runner/parser
- real Codex adapter runner/parser
- selector iframe `postMessage` contract and real element selection flow
- export status polling/download UX polish
- formal automated integration and E2E coverage

## Requirements

- Windows 10/11 x64
- Bun installed for local development
- Node.js available for the Vite toolchain
- at least one local CLI for runtime use:
  - `claude`
  - `codex`

## Local development

```powershell
bun install
bun run typecheck
```

Run backend and frontend separately:

```powershell
bun run dev:backend
bun run dev:frontend
```

Or run workspace dev scripts together:

```powershell
bun run dev
```

Frontend runs on a Vite dev port. The compiled backend serves the frontend bundle from `packages/frontend/dist` in production mode.

## Build

Frontend production bundle:

```powershell
bun run build:frontend
```

Windows executable:

```powershell
bun run build:backend
```

Full build:

```powershell
bun run build
```

The executable is emitted to `dist/burnguard-design.exe`.

## Current validation baseline

Manually verified on April 22, 2026:
- root `bun run typecheck`
- frontend `bun run build`
- root `bun run build`
- backend API smoke for health, project list/create, session replay/send, files, artifacts, refresh, and export
- backend serves compiled frontend bundle from `packages/frontend/dist`

Known gaps from current validation:
- export job completion is asynchronous, so UI still needs polling/status refresh
- real adapter execution is still stubbed by an internal turn runner
- selector overlay is still placeholder-only
- no committed automated test suite yet

## Repository layout

```text
BurnGuard/
  doc/                     authoritative product and architecture docs
  devplan/                 phase plans and sprint ownership docs
  ref/                     reference screenshots
  design system sample/    bundled Goldman Sachs sample design system
  packages/
    shared/                shared TypeScript contracts
    backend/               Bun + Hono + SQLite + harness services
    frontend/              Vite + React app
  scripts/                 build helpers
```

## Documentation

Primary specification lives under [`doc/`](./doc/README.md).

Key files:
- [doc/00-overview.md](./doc/00-overview.md)
- [doc/01-architecture.md](./doc/01-architecture.md)
- [doc/02-data-model.md](./doc/02-data-model.md)
- [doc/03-backend-adapters.md](./doc/03-backend-adapters.md)
- [doc/04-ui-spec.md](./doc/04-ui-spec.md)
- [doc/05-design-system-format.md](./doc/05-design-system-format.md)
- [doc/06-milestones.md](./doc/06-milestones.md)
- [doc/07-decisions.md](./doc/07-decisions.md)

Execution plans live under [`devplan/`](./devplan).

## License

TBD.
