# Milestones and Delivery

> **Progress key:** ✅ done · 🟡 in progress · 🔲 not started
>
> **Next-session pickup (2026-04-22):** Phase 1 functionally complete (late
> alpha). Phase 2 **Milestone A (Slide Deck Foundation)** shipped in 3
> commits — `15c01e8` (template), `3ef5786`/`8730704` (runtime + hover nav
> bar), `94762ed` (deck-aware prompt skill). **P2.4 (Comment mode)**
> implemented: `comments` table + CRUD routes, `CommentLayer` overlay,
> `CommentPanel` with resolve toggle; all three packages typecheck green.
> **Resume at P2.5 (Edit mode)** under §7 Phase 2 Sprint Plan below.

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

Status: **Milestone A complete, Milestone B/C not started**

High-level focus (see §7 for the concrete commit-sized sprint plan):
- ✅ slide deck workflow foundation (template, runtime, prompt skill)
- 🔲 comment and edit modes
- 🔲 PDF and PPTX export
- 🔲 permission gate UI
- 🔲 stronger settings/runtime controls
- 🔲 tutorial seeds

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

## 7. Phase 2 Sprint Plan

Broken down from the original 9 Phase 2 tasks into 10 commit-sized slices,
grouped into three milestones. Each slice is a single commit, ends in a
working state, and has a concrete DoD so the next session can resume without
reconstructing context.

### Milestone 2.A — Slide Deck Foundation ✅

| # | Status | Commit | Slice | DoD |
|---|---|---|---|---|
| **P2.1** | ✅ | `15c01e8` | Slide deck project template + seed (`deck.html`, `<section data-slide>` × 3, speaker-notes option) | Creating a `slide_deck` project writes a valid deck.html referencing the runtime script |
| **P2.2** | ✅ | `3ef5786` + `8730704` | `deck-stage.js` runtime: pagination, keyboard nav (←/→/Space/Home/End/f/Esc), hash-based routing, touch swipe, MutationObserver for CLI edits, hover-visible nav bar with `N / M` counter | Browser renders one slide at a time, arrows navigate, nav bar fades in on mousemove |
| **P2.3** | ✅ | `94762ed` | Deck-aware prompt builder — injects `DECK_SKILL_MD` only when `project.type === "slide_deck"` (15-slide pitch scaffold, `data-bg-node-id` rules, inline CSS, no external deps) | Deck-type sessions get the skill block; prototype sessions unchanged (verified via direct buildPrompt import) |

### Milestone 2.B — Interaction Modes 🔲

| # | Status | Slice | Key files | DoD |
|---|---|---|---|---|
| **P2.4** | ✅ | **Comment mode (pin + thread)** — `comments` table (`id`, `project_id`, `rel_path`, `node_selector`, `x_pct`, `y_pct`, `body`, `resolved_at`, `created_at`, `updated_at`). REST: `GET /api/projects/:id/comments`, `POST /api/projects/:id/comments`, `PATCH /api/projects/:id/comments/:commentId`. Canvas: clicking in Comment mode drops a pin anchored to a file-relative percentage; side panel holds the note and resolve toggle. Open (unresolved) comments are forwarded to the CLI prompt under `## Open comments`. | `backend/src/db/schema.ts`, `backend/src/db/migrations/0002_comments_pin.sql` (new), `backend/src/db/comments.ts` (new), `backend/src/routes/comments.ts` (new), `backend/src/server.ts`, `backend/src/services/context.ts`, `backend/src/harness/prompt-builder.ts`, `shared/src/comment.ts` (new), `frontend/src/api/comments.ts` (new), `frontend/src/components/canvas/CommentLayer.tsx` (new), `frontend/src/components/modes/CommentPanel.tsx` (new), `frontend/src/components/canvas/Canvas.tsx`, `frontend/src/components/canvas/CanvasTopBar.tsx`, `frontend/src/components/modes/ModePanel.tsx`, `frontend/src/views/ProjectView.tsx` | Clicking in comment mode creates a persisted pin that survives a reload; resolve toggles it; unresolved pins appear in the next CLI turn's prompt |
| **P2.5** | 🔲 | **Edit mode (contenteditable → PATCH)** — iframe elements with `data-bg-node-id` become editable; on blur the runtime posts the new text to a new `PATCH /api/projects/:id/fs/*` handler, which updates only the targeted node via `node-html-parser`. | `backend/src/routes/artifacts.ts` (+PATCH), `backend/src/services/file-patch.ts` (new), `frontend/src/components/modes/EditMode.tsx` (new) | Inline-edit a title → save to disk → reload shows the new value; other DOM untouched |
| **P2.6** | 🔲 | **Permission gate UI for tool calls** — When a `tool.permission_required` event arrives, open a Radix Dialog. Allow/Deny routes to `POST /api/sessions/:id/tool-decision`. Existing `user.tool_decision` event type already defined. | `frontend/src/components/chat/PermissionDialog.tsx` (new), `backend/src/routes/session.ts` (+decision handler), `frontend/src/views/ProjectView.tsx` (hook the event) | Synthesized permission event triggers a modal; Deny aborts the turn cleanly |

### Milestone 2.C — Exports & Settings 🔲

| # | Status | Slice | Key files | DoD |
|---|---|---|---|---|
| **P2.7** | 🔲 | **PDF export via Playwright** — `runExport` gains a `pdf` branch. Headless launches Chromium, opens the deck file with `?print=1` (runtime hides nav bar), calls `page.pdf({ format: 'A4 landscape', printBackground: true })`. | `backend/src/services/exports.ts`, `backend/src/services/export-pdf.ts` (new), add Playwright dep | 15-slide deck exports to a 15-page PDF; zero nav-bar artifacts |
| **P2.8** | 🔲 | **PPTX export via `pptxgenjs`** — Parse the rendered DOM, split text/image into separate pptx layers so the output is editable in PowerPoint. | `backend/src/services/export-pptx.ts` (new), `pptxgenjs` dep | Deck → .pptx opens in PowerPoint with editable text boxes per slide |
| **P2.9** | 🔲 | **Settings panel** — Claude Code/Codex runtime switch, "Install Playwright" button spawning `npx playwright install chromium`. | `frontend/src/components/settings/SettingsModal.tsx`, `backend/src/routes/settings.ts` (new or extend) | Switch backend at runtime (next turn uses new CLI); Playwright install button actually runs the command |
| **P2.10** | 🔲 | **Tutorial projects + export smoke tests** — Seed two tutorials (`prototype-demo`, `deck-demo`). Integration test: each tutorial × each export format (html_zip, pdf, pptx) → non-empty output. | `backend/src/db/seed-tutorials.ts` (new), `backend/tests/exports.test.ts` (new) | First launch creates tutorials; `bun test` green |

### Ground rules for the new session

1. **One commit per slice.** No bundling.
2. **TDD where DB schema changes** — P2.4/P2.5 must ship with unit tests that cover the new handlers before touching the UI.
3. **Intermediate smokes** — at the end of M2.B, run through comment + edit against a real deck project. At the end of M2.C, verify all three export formats manually.
4. **Clean pickup points for PR slices:** P2.6 ends M2.B; P2.10 ends M2.C. Either is a reasonable merge boundary if you want to split Phase 2 into 2 PRs.

### Out of scope for Phase 2 (deferred to Phase 3 or later)

- Full tweaks two-way inspector (Phase 3 P3.1)
- Draw mode / Present mode (Phase 3 P3.3 / P3.4)
- DS extraction from GitHub/Figma (Phase 3 P3.5 / P3.6)
- macOS / Linux builds (Phase 3 P3.10 / P3.11)
- Auto-update, SmartScreen signing (Phase 4)

