# Phase 1 Backend Sprint Plan

## Ownership

`codex` owns:

- shared backend-facing contracts
- Bun backend bootstrap
- local filesystem bootstrap
- SQLite schema and migrations
- harness core
- Claude Code and Codex adapters
- REST and SSE routes
- export pipeline
- packaging
- backend unit and integration tests
- backend observability

## Backend Success Criteria

Phase 1 backend is complete when it can support the frontend through a stable end-to-end loop:

1. create project
2. create or resume session
3. send prompt with attachments
4. persist and stream normalized events
5. detect file changes and expose updated file tree
6. provide refresh-safe artifact access
7. export HTML zip
8. survive app restart with recoverable history

## Sprint 1: Foundation and Contract Freeze

### Tasks

- `BE-S1-01` Create backend workspace, package manifest, TypeScript config, and entrypoint.
- `BE-S1-02` Define `NormalizedEvent`, `UserEvent`, and session-related shared contracts.
- `BE-S1-03` Define DTOs for project, session, system, file tree, and export status.
- `BE-S1-04` Document route names and payload envelopes for all Phase 1 endpoints.
- `BE-S1-05` Add backend health route and minimal server startup.
- `BE-S1-06` Commit mock fixtures for:
  - project list
  - project create response
  - session metadata
  - event replay
  - SSE event examples
  - file tree
  - settings

### Frontend unblockers produced in Sprint 1

- shared event and DTO typings
- committed fixture payloads
- route inventory with request and response examples

### Done criteria

- frontend can consume shared types without local duplication
- mock payloads are sufficient to build Home and Project shells

## Sprint 2: Persistence and Project Boot

### Tasks

- `BE-S2-01` Implement `~/.burnguard/` bootstrap and first-run directory creation.
- `BE-S2-02` Implement config service with defaults and persistence.
- `BE-S2-03` Implement drizzle schema for users, systems, projects, sessions, events, attachments, files, exports, and schema metadata.
- `BE-S2-04` Implement migration runner and local seed flow.
- `BE-S2-05` Seed bundled design system metadata and local user.
- `BE-S2-06` Implement project list, create, and get routes.
- `BE-S2-07` Implement design system list and get routes.
- `BE-S2-08` Implement session metadata create/get flow tied to project creation.
- `BE-S2-09` Implement backend detection for Claude Code and Codex.
- `BE-S2-10` Implement settings load/save routes.

### Frontend unblockers produced in Sprint 2

- real Home API for projects and systems
- real project bootstrap payload
- real settings and backend detection payloads

### Done criteria

- creating a project returns the identifiers and metadata the frontend needs
- seeded design system appears in the project create flow
- settings can be loaded and saved through the API

## Sprint 3: Live Session Loop

### Tasks

- `BE-S3-01` Implement event broker with ordered persistence and subscriber fanout.
- `BE-S3-02` Implement session registry and lifecycle manager.
- `BE-S3-03` Implement context builder for project, design system, files, summary, and attachments.
- `BE-S3-04` Implement attachments save flow under project `.attachments`.
- `BE-S3-05` Implement session send and interrupt routes.
- `BE-S3-06` Implement historical event replay route.
- `BE-S3-07` Implement SSE live stream route.
- `BE-S3-08` Implement Claude Code adapter detect, runner, parser, and resume behavior.
- `BE-S3-09` Implement Codex adapter detect and raw-mode minimum viable path.
- `BE-S3-10` Implement retry and error classification baseline.
- `BE-S3-11` Add session trace logs and parser fixture tests.

### Frontend unblockers produced in Sprint 3

- stable event payload semantics
- replay plus SSE stream contract
- attachment upload behavior
- error payload and retry semantics

### Done criteria

- one real prompt roundtrip streams through replay and live SSE
- frontend can reconnect without duplicated events
- attachment-backed turns work

## Sprint 4: Files, Refresh, and Selector Support

### Tasks

- `BE-S4-01` Implement project watcher with file add, change, and delete handling.
- `BE-S4-02` Sync file metadata into the DB on watcher events.
- `BE-S4-03` Emit `file.changed` normalized events with active turn linkage.
- `BE-S4-04` Implement file tree route grouped for frontend use.
- `BE-S4-05` Implement file preview or file content route for text and image assets.
- `BE-S4-06` Implement artifact metadata route for entrypoint and file tabs.
- `BE-S4-07` Define refresh behavior and route semantics.
- `BE-S4-08` Define and freeze parent/iframe message payloads for selector mode.
- `BE-S4-09` Implement any backend utility needed for selector-driven file lookup or metadata.

### Frontend unblockers produced in Sprint 4

- real file explorer data
- refresh-safe artifact metadata
- selector message payload contract

### Done criteria

- generated files appear through the file API
- frontend can refresh canvas and browse files using real routes
- selector mode has stable payload definitions

## Sprint 5: Export, Hardening, and Packaging

### Tasks

- `BE-S5-01` Implement HTML zip export writer and manifest.
- `BE-S5-02` Implement export create, status, and download routes.
- `BE-S5-03` Implement checkpoint writer baseline.
- `BE-S5-04` Improve Codex parser heuristics and raw fallback signaling.
- `BE-S5-05` Implement structured app log rotation.
- `BE-S5-06` Finalize session trace logging with useful correlation fields.
- `BE-S5-07` Integrate frontend static build serving into production backend startup.
- `BE-S5-08` Build Windows executable with Bun.
- `BE-S5-09` Add integration tests for project boot, session lifecycle, migration boot, and export.
- `BE-S5-10` Support final E2E smoke pass from compiled app.

### Frontend unblockers produced in Sprint 5

- stable export lifecycle payloads
- production bundle serving behavior
- final error and settings semantics

### Done criteria

- export works from the real app
- compiled backend serves the frontend correctly
- executable behavior is validated on Windows

## Backend Deliverables by Dependency

### Highest priority

- shared contracts
- project and session bootstrap routes
- event replay and SSE
- Claude Code adapter

### Second priority

- file watcher and file API
- refresh metadata
- export routes

### Third priority

- Codex heuristics hardening
- checkpointing
- packaging polish

## Backend Rules for Frontend Safety

- Do not change route names after handing them off without updating the plan doc.
- Do not change DTO field names casually once the frontend starts wiring.
- Keep response shapes explicit. Avoid hidden unions unless documented.
- Add new event types only if the frontend can ignore them safely.
- Treat fixture updates as versioned contract updates, not ad hoc examples.

## Backend Blocking Risks

- Claude Code parser drift
- Bun plus PTY instability on Windows
- attachment path handling across Windows path formats
- SSE ordering mistakes causing duplicate or out-of-order UI rendering
- file preview payload ambiguity
- export route shape churn late in Sprint 5
