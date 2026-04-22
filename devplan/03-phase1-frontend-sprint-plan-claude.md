# Phase 1 Frontend Sprint Plan

## Implementation Snapshot

As of 2026-04-22, the frontend has real API wiring for:

- Home projects, examples, systems, backend detection, and settings
- sidebar project creation flow
- Project boot via real project/session/files/artifacts routes
- replay fetch plus SSE live event subscription
- canvas iframe loading from backend-served artifact files
- refresh mutation against the backend
- settings modal save/load against the backend
- export create against the backend

Still incomplete for frontend Phase 1 closure:

- export status polling and download UX
- not-found redirect/toast handling for missing design systems
- selector overlay real `postMessage` integration
- formal frontend E2E smoke coverage

Current stabilization notes:

- replay plus SSE dedupe is wired, but needs repeated browser-refresh testing against long-running real adapter sessions once adapters land
- project send flow is live, but current session execution still depends on the backend stub turn runner rather than the real adapters
- file-change-to-open-tab behavior is partially covered through Project view state, but full UI verification is still needed during manual QA

## Ownership

`claude` owns:

- frontend scaffold and route shell
- Home and Project views
- chat renderer and composer UI
- canvas iframe UI
- selector overlay UI
- file explorer UI
- design system browser UI
- settings modal UI
- frontend-side API client and state wiring
- frontend E2E smoke coverage

## Frontend Working Rules

- Use shared types and backend fixtures from `codex` as the only source of truth.
- Build early screens with mocks, but switch to real APIs immediately once the gate is open.
- Avoid inventing frontend-only fields for core entities.
- Keep chat and canvas rendering tolerant of unknown future event types.

## Sprint 1: Scaffold and Mock-Driven Shell

### Tasks

- `FE-S1-01` Create frontend workspace, Vite app, and routing shell.
- `FE-S1-02` Set up shared API client structure and state stores.
- `FE-S1-03` Build Home shell using backend fixtures.
- `FE-S1-03` note: frontend may render static layout before Gate A; switches to typed fixtures the moment Gate A lands.
- `FE-S1-04` Build Project shell using backend fixtures.
- `FE-S1-05` Create fixture-backed placeholders for:
  - chat stream
  - file explorer
  - settings
  - project metadata
- `FE-S1-06` Align naming, store shape, and route assumptions with the shared contract freeze.

### Backend dependencies

- shared event and DTO types
- fixture payloads
- route inventory

### Done criteria

- Home and Project shells render from committed fixtures
- no duplicated core DTO definitions exist in the frontend

## Sprint 2: Real Home and Project Boot

### Tasks

- `FE-S2-01` Wire Home project list to the real projects API.
- `FE-S2-02` Wire design system selector to the real systems API.
- `FE-S2-03` Implement project creation flow using the real create route.
- `FE-S2-04` Implement Project boot using real project and session metadata.
- `FE-S2-05` Implement settings modal load and save behavior.
- `FE-S2-06` Surface backend detection state in the UI.

### Backend dependencies

- stable project and system APIs
- session bootstrap payload
- settings and backend detection APIs

### Done criteria

- user can create a project and land on a real Project page
- settings modal reads and writes against the backend

## Sprint 3: Chat, Attachments, and Live Stream

### Tasks

- `FE-S3-01` Implement composer send and interrupt behavior.
- `FE-S3-02` Implement attachment drag-and-drop and upload flow.
- `FE-S3-03` Wire event replay fetch on Project load.
- `FE-S3-04` Wire SSE live stream subscription.
- `FE-S3-05` Render normalized event types:
  - chat delta
  - thinking
  - tool started
  - tool finished
  - file changed
  - usage
  - status error
  - status idle and running
- `FE-S3-06` Implement reconnect-safe dedupe by event ID.
- `FE-S3-07` Add user-visible error states and retry entry points where defined by backend behavior.

### Backend dependencies

- stable replay route
- stable SSE payloads
- stable attachment upload behavior
- stable error payload shape

### Done criteria

- user can send a prompt and watch live events arrive in chat
- refresh restores chat history and resumes streaming safely

## Sprint 4: Canvas, Files, and Selector

### Tasks

- `FE-S4-01` Implement canvas iframe renderer for artifact content.
- `FE-S4-02` Implement refresh control using real backend refresh and file state.
- `FE-S4-03` Implement file explorer tree using the real files API.
- `FE-S4-04` Implement file preview for text and image responses.
- `FE-S4-05` Open files from `file.changed` event links.
- `FE-S4-06` Implement artifact tabs for design system, design files, and opened files.
- `FE-S4-07` Implement selector overlay interactions in the iframe.
- `FE-S4-08` Implement right-side read-only computed style panel.

### Backend dependencies

- stable file tree and file preview APIs
- stable refresh behavior
- parent/iframe selector payload contract
- artifact metadata contract

### Done criteria

- frontend can refresh the generated output without a new turn
- user can browse generated files and inspect selected elements

## Sprint 5: Export, Hardening, and Release Verification

### Tasks

- `FE-S5-01` Implement export action UI using real export routes.
- `FE-S5-02` Show export status progression and failure handling.
- `FE-S5-03` Finalize settings and app-level empty states.
- `FE-S5-04` Finalize CLI missing and backend crash error states.
- `FE-S5-05` Verify production build behavior served by the compiled backend.
- `FE-S5-06` Write E2E smoke coverage for:
  - project creation
  - chat send
  - attachment upload
  - refresh
  - selector inspection
  - HTML zip export
- `FE-S5-07` Run final internal alpha checklist with the backend executable build.

### Backend dependencies

- stable export lifecycle payloads
- compiled app serving behavior
- final backend error semantics

### Done criteria

- export UI works end to end
- E2E coverage validates the main Phase 1 user loop

## Frontend Integration Checkpoints

### Checkpoint 1

- consume shared types directly
- validate all fixture payloads can render

### Checkpoint 2

- switch Home and Project boot from fixtures to live APIs

### Checkpoint 3

- switch chat from fixture replay to real replay plus SSE

### Checkpoint 4

- switch canvas and files from placeholders to real artifact data

### Checkpoint 5

- switch export and settings from provisional handling to real production behavior

## Frontend Risks

- building chat UI before event semantics are frozen
- assuming file previews all behave the same
- implementing selector behavior before iframe payloads are fixed
- overfitting to fixture ordering that differs from live SSE timing
- adding frontend-only state fields that the backend cannot supply later
