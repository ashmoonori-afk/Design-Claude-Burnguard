# Phase 1 Overall Dev Plan

## Team Model

- `codex` owns backend, harness, adapters, persistence, APIs, export pipeline, packaging, and backend test infrastructure.
- `claude` owns frontend shell, views, chat presentation, canvas UI, file explorer UI, settings UI, and frontend E2E wiring.
- Shared contracts are locked jointly, but `codex` is the source of truth for event, session, and API payload shape.
- Frontend should not wait for fully working backends to begin. It should start from typed mocks and fixtures, then wire against real endpoints at defined gates.

## Planning Goal

Deliver a Phase 1 internal alpha where one user can:

1. launch the Windows executable
2. open the local app in a browser
3. create a prototype project with the bundled design system
4. start a Claude Code or Codex session
5. send a prompt with attachments
6. see streamed events in chat
7. render and refresh the canvas
8. inspect elements in read-only mode
9. export HTML zip
10. restart the app and recover projects and session history

## Delivery Rules

- Freeze shared contracts early and treat them as sprint blockers.
- Use backend-owned fixture payloads before real wiring.
- Track backend-to-frontend handoff artifacts explicitly.
- Do not start UI wiring against unstable route names or payload shapes.
- Favor thin vertical slices by sprint, but keep harness and observability on the critical path.

## Shared Contract Gates

These gates must be completed in order because they unblock downstream work:

### Gate A: Shared contract freeze

Owner:
- `codex` drafts
- `claude` reviews

Artifacts:
- `NormalizedEvent`
- `UserEvent`
- `LLMBackend` and `Session` interfaces
- core entity DTOs for project, session, file tree, design system, export status

Frontend impact:
- unblocks API client typing
- unblocks chat renderer mock data
- unblocks state store design

### Gate B: API route freeze for creation and session loop

Owner:
- `codex`

Artifacts:
- project create/list/get routes
- session get/send/replay routes
- SSE stream contract
- attachment upload contract

Frontend impact:
- unblocks Home create flow
- unblocks Project boot flow
- unblocks chat send and live stream wiring

### Gate C: Canvas and file route freeze

Owner:
- `codex`

Artifacts:
- file tree API
- artifact metadata API
- refresh route behavior
- parent/iframe message payload shape

Frontend impact:
- unblocks canvas refresh
- unblocks file explorer
- unblocks selector overlay wiring

### Gate D: Export and settings route freeze

Owner:
- `codex`

Artifacts:
- export create/status/download contract
- settings load/save contract
- backend detection payload

Frontend impact:
- unblocks settings modal
- unblocks export action UI

## Sprint Structure

Phase 1 is split into 5 implementation sprints. Each sprint includes backend tasks, frontend tasks, and explicit wiring gates.

## Sprint 1: Foundations and Contracts

### Objective

Create the repo skeleton, lock core contracts, and allow both developers to work in parallel without inventing payloads independently.

### `codex` tasks

- scaffold monorepo structure and root tooling
- create `packages/shared`, `packages/backend`, and package references
- define shared event and harness contracts
- define initial domain DTOs for projects, sessions, files, systems, exports
- bootstrap backend server with health route
- define API route map and response envelope conventions
- create fixture payloads for chat events, file tree, session replay, and settings

### `claude` tasks

- scaffold frontend package with routing, state, and API client shell
- build app shell with placeholder routes
- build mock-driven Home and Project page skeletons
- use backend fixtures as the only allowed mock source

### Sprint 1 wiring requirements

- `codex` must hand off contract files and mock payload examples before `claude` starts chat renderer details
- `claude` can proceed with page layout and local state before live API wiring

### Sprint 1 exit criteria

- repo builds by package
- shared contracts compile across frontend and backend
- frontend can render mock Home and Project shells from committed fixtures
- backend health route is reachable

## Sprint 2: Persistence, Session Core, and UI Shell

### Objective

Make project creation and session boot real on the backend while the frontend connects Home and Project shells to real data.

### `codex` tasks

- implement local app directory bootstrap
- implement DB schema, migrations, and seed flow
- implement config loading and saving
- implement project list/create/get routes
- implement design system list/get routes
- implement session create/get metadata path
- implement live session registry and basic broker persistence
- implement backend detection service for Claude Code and Codex

### `claude` tasks

- wire Home view to real project and design system APIs
- implement new project panel behavior
- implement Project page shell with real project/session bootstrap
- implement settings modal shell using detection and settings payloads
- keep chat and canvas in placeholder mode using fixtures until stream routes land

### Sprint 2 wiring requirements

- `codex` must deliver stable create/list/get payloads before `claude` wires the Home screen
- `claude` should not invent derived fields not present in backend DTOs

### Sprint 2 exit criteria

- project creation works end to end
- sample design system appears in the create flow
- Project page can load a real project and active session metadata
- settings data can load from backend

## Sprint 3: Live Session Loop

### Objective

Complete the first real prompt roundtrip: send, persist, replay, and stream events into chat.

### `codex` tasks

- implement context builder
- implement Claude Code adapter detect, runner, parser
- implement Codex adapter detect and initial raw fallback path
- implement session send and interrupt flow
- implement attachments persistence
- implement events replay route
- implement SSE live stream route
- implement retry and error classification baseline
- add session trace logs and parser fixtures

### `claude` tasks

- wire composer to real send route
- wire chat stream renderer to replay plus SSE tail
- render normalized event types: message, thinking, tool, file change, usage, error
- implement attachment drag-and-drop UI wired to real upload flow
- implement reconnect-safe event dedupe on the client

### Sprint 3 wiring requirements

- `codex` must freeze event payload semantics before `claude` finalizes renderer logic
- `claude` should build against committed parser fixtures first, then switch to live SSE
- both sides must validate ordering and duplication behavior together

### Sprint 3 exit criteria

- user can send a prompt and receive streamed chat events
- browser refresh can replay history and resume live streaming
- attachments are saved and passed into the turn context
- failures surface as readable error states

## Sprint 4: Canvas, Files, and Refresh

### Objective

Make generated files visible and usable in the app through refresh, file explorer, and selector overlay.

### `codex` tasks

- implement file watcher and file index sync
- emit `file.changed` events tied to the active turn
- implement file tree and file preview routes
- implement refresh behavior for latest artifact tree
- define and freeze parent/iframe message payloads
- provide artifact metadata needed for tab and entrypoint selection

### `claude` tasks

- implement canvas iframe renderer
- implement refresh control wired to real backend file state
- implement file explorer and file preview views
- open files from `file.changed` events
- implement selector overlay and right-panel computed style display
- wire artifact tabs for design system, design files, and opened files

### Sprint 4 wiring requirements

- `codex` must provide stable file tree and preview contracts before `claude` finishes file explorer behavior
- parent/iframe message contract must be fixed before selector implementation is finalized

### Sprint 4 exit criteria

- generated files appear in the file explorer
- refresh updates the canvas without sending a new chat turn
- clicking a canvas element shows read-only computed styles
- chat file change events can open related files in the UI

## Sprint 5: Export, Hardening, and Packaging

### Objective

Close the loop with export, packaging, logging, and release verification.

### `codex` tasks

- implement HTML zip export and export tracking
- implement checkpointing baseline
- finish Codex parser best-effort behavior
- integrate structured app logs and per-session trace logs
- implement frontend build serving in production mode
- build Windows executable with Bun
- complete integration tests for session lifecycle and migrations

### `claude` tasks

- wire export UI to create/status/download flow
- finalize settings modal behavior
- add remaining empty and error states
- build E2E smoke tests around create, chat, refresh, selector, and export
- verify production UI against compiled backend bundle

### Sprint 5 wiring requirements

- `codex` must freeze export payloads before `claude` completes export UI and E2E flows
- both sides must run the internal alpha checklist together against the compiled app

### Sprint 5 exit criteria

- HTML zip export works
- production build serves the frontend correctly
- Windows executable launches and opens the browser
- smoke coverage exists for the Phase 1 core loop

## Backend to Frontend Handoff Checklist

`codex` must provide these artifacts as soon as they are ready:

1. shared type files for events, sessions, projects, files, systems, exports
2. fixture JSON for chat replay, live stream events, file tree, and settings
3. route list with request and response examples
4. SSE event ordering and dedupe rules
5. attachment upload request shape and max-size behavior
6. file preview response behavior and supported content classes
7. selector message payloads between parent and iframe
8. export lifecycle payloads
9. error payload shape and retry semantics

## Known Cross-Team Risk Areas

- `NormalizedEvent` drift after frontend renderer work starts
- SSE reconnect semantics changing after client dedupe logic is written
- project creation response shape changing after Home wiring
- file preview response ambiguity for text vs image vs html assets
- selector overlay payload changing after iframe code exists
- export job lifecycle changing after export UI and tests are written

## Phase 1 Management View

Create tasks with the following prefixes:

- `BE-` for backend tasks owned by `codex`
- `FE-` for frontend tasks owned by `claude`
- `INT-` for integration gates requiring both

Recommended milestone blockers:

- Gate A shared contract freeze
- project creation end-to-end
- first real streamed turn
- refresh plus file explorer loop
- HTML zip export
- Windows executable verification
