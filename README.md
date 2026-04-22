# BurnGuard Design

Working title: `BurnGuard Design`

BurnGuard Design is a self-hosted alternative to Claude Design, packaged as a local Windows app. It wraps locally installed LLM CLIs such as Claude Code and Codex, stores project data under the local BurnGuard app data directory, and provides a chat-plus-canvas workflow for generating prototypes and slide decks.

## Status

As of April 22, 2026, the repository is in **late Phase 1 / internal alpha**.

Implemented now:
- Bun + Hono backend with SQLite bootstrap, migrations, seed data, config persistence, backend detection, and production SPA serving
- shared TypeScript contracts for projects, sessions, events, files, artifacts, exports, and design systems
- Home, Project, Design System, Settings, and Export frontend flows wired to real APIs
- project creation for `prototype` and `slide_deck`
- session replay, SSE live streaming, attachment upload, file indexing, artifact refresh, and HTML zip export
- real Claude Code turn runner and `stream-json` parser
- best-effort Codex runner with raw streamed output
- per-project file watchers, turn checkpoints, slide deck runtime script, and Windows executable build

Still incomplete before full Phase 1 sign-off:
- selector is still a placeholder overlay rather than real parent/iframe element inspection
- interrupt route does not yet terminate a live CLI subprocess
- Codex integration does not provide structured tool/file events
- PDF, PPTX, and handoff exports are scaffolded in the data model/UI but not implemented
- no committed automated integration or E2E test suite

## Requirements

- Windows 10/11 x64
- Bun installed for local development
- Node.js available for the Vite toolchain
- at least one local CLI available on `PATH` for runtime use:
  - `claude`
  - `codex`

## Local Development

```powershell
bun install
cmd /c npm.cmd run typecheck
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

The frontend runs on a Vite dev port. In production mode, the backend serves the compiled frontend bundle from `packages/frontend/dist`.

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

## Validation Baseline

Manually verified on April 22, 2026:
- root `cmd /c npm.cmd run typecheck`
- frontend `bun run build`
- root `bun run build`
- backend API smoke for health, project list/create, session replay/send, files, artifacts, refresh, and export
- backend serves the compiled frontend bundle from `packages/frontend/dist`

Known validation gaps:
- no committed automated test suite yet
- selector flow has not been validated against real iframe DOM messaging
- interrupt semantics are not end-to-end verified because the subprocess is not yet cancellable
- Codex behavior is only best-effort and needs more fixture coverage

## Repository Layout

```text
BurnGuard/
  doc/                     authoritative product and architecture docs
  devplan/                 phase plans and implementation notes
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
