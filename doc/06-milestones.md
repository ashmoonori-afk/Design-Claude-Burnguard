# Milestones and Delivery

## 1. Current Stage

As of April 22, 2026, BurnGuard Design is in **late Phase 1 / internal alpha**.

The repo now supports the main Phase 1 loop:

1. detect local backend CLIs
2. create a project
3. seed and inspect a design system
4. send a prompt with optional attachments
5. stream normalized events into the chat view
6. render the project artifact in the canvas
7. refresh or auto-refresh the current file
8. export as HTML zip

That means the phase is no longer "just planned", but it is also not signed off yet.

## 2. Phase 1 Progress Snapshot

### 2.1 Done

- monorepo, shared contracts, backend and frontend scaffolding
- SQLite schema, migrations, seed data, and sample design system bootstrap
- project/session/event persistence
- SSE live streaming and replay
- project creation for `prototype` and `slide_deck`
- prompt builder with design system and file context
- real Claude Code runner/parser path
- best-effort Codex runner path
- HTML zip export backend plus export status polling UI
- production frontend serving and Windows build flow
- per-session turn locking to prevent concurrent writes

### 2.2 Partially done

- file watching exists, but watcher activity only refreshes indexed files; chat `file.changed` is still adapter-driven
- selector mode exists as a UI surface, but it is still a placeholder overlay
- interrupt route exists, but it does not yet stop a live subprocess
- slide deck support exists in templates/runtime, but the broader Phase 2 workflow is not delivered

### 2.3 Not done

- automated integration and end-to-end tests
- structured Codex parser
- true permission gate flow
- PDF export
- PPTX export
- handoff export
- real comment/edit/tweaks/draw modes

## 3. Remaining Work For Phase 1 Sign-Off

The minimum remaining work to call Phase 1 complete is:

1. Replace the selector placeholder with real parent/iframe DOM messaging
2. Implement real interrupt semantics for active CLI subprocesses
3. Decide whether Codex raw-mode is sufficient for Phase 1 or needs one more normalization pass
4. Add at least a minimal committed regression test layer for turn orchestration and export
5. Re-run and document a clean Windows smoke-test pass against the full alpha loop

If those are finished without changing scope again, the repo can reasonably move from "late Phase 1" to "Phase 1 complete".

## 4. Original Phase Plan Versus Current Reality

The original Phase 1 plan assumed:
- only prototype project type
- no slide deck runtime yet
- real selector in Phase 1
- adapter and export work landing before extra template/runtime work

Current reality differs in two ways:
- some Phase 2 groundwork landed early, especially `slide_deck`
- some core Phase 1 sign-off items are still incomplete, especially selector and interrupt

That means the repo is functionally broad, but still missing a few critical "prove the harness" pieces.

## 5. Updated Roadmap

### Phase 1 - Prove the harness

Status: **late implementation**

Exit criteria:
- full prompt -> render -> refresh -> HTML zip loop works on Windows
- selector is real, not placeholder-only
- turns can be interrupted safely
- a minimum automated regression suite exists

### Phase 2 - Decks, modes, and richer exports

Planned focus:
- complete the slide deck workflow, not just the starter template/runtime
- comment and edit modes
- PDF and PPTX export
- stronger settings/runtime controls

### Phase 3 - Power user features

Planned focus:
- real tweaks panel
- draw/present modes
- design system extraction from external sources
- handoff export and broader packaging features

## 6. Delivery Guidance

For the next stretch, the engineering priority should be:

1. finish the missing Phase 1 reliability pieces
2. avoid pulling more Phase 2 UI placeholders into "implemented" status without behavior behind them
3. keep docs synchronized with what actually ships in the repo

The harness remains the product. Phase movement should be based on runtime correctness, not just screen count.
