# Milestones and Delivery

> **Progress key:** ✅ done · 🟡 in progress · 🔲 not started
>
> **Next-session pickup (2026-04-22):** Phase 1 sign-off items 1–4
> closed in code; item 5 (Windows smoke test) blocks phase flip —
> checklist at `doc/07-manual-smoke-test.md`. Phase 2 **Milestones A +
> P2.4 + P2.5 + P2.6** shipped. Latest commits: `4115812` (smoke-test
> doc + P2.6 mark), `ec6ac66` (P2.6 permission gate UI + dev synth
> hook), `192a3c8` (P2.5 edit mode), `ef7dedd` (real selector), `9e22903`
> (backend tests, 11/11 green). **Resume at P2.7 (PDF export via
> Playwright)** to finish Milestone 2.C.

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
- slide deck support exists in templates/runtime, and P2.4 (comment) + P2.5 (edit) modes have shipped, but the rest of the Phase 2 workflow (permission gate, PDF/PPTX export, settings, tutorials) is not delivered

### 2.3 Not done

- end-to-end (Playwright) tests — backend unit tests exist as of `9e22903`
- structured Codex parser (decision: ship raw-mode for Phase 1; upgrade deferred — see §6)
- true permission gate flow
- PDF export
- PPTX export
- handoff export
- real tweaks/draw modes (Phase 3)

## 3. Remaining Work For Phase 1 Sign-Off

| # | Item | Status |
|---|------|--------|
| 1 | Replace selector placeholder with real iframe DOM messaging | ✅ `ef7dedd` — `elementFromPoint` + `getComputedStyle`, persistent selection box (200ms poll), `data-bg-node-id` / `#id` / tag fallback |
| 2 | Implement real interrupt semantics for active CLI subprocesses | ✅ `de33be2` — `activeTurns` map + `AbortController`; adapters pass `signal` to `Bun.spawn({signal, killSignal:"SIGKILL"})`; `/api/sessions/:id/interrupt` aborts and emits `status.idle{stopReason:"interrupted"}` |
| 3 | Decide whether Codex raw-mode is sufficient for Phase 1 | ✅ Decision: **ship raw-mode** for Phase 1. `codex/index.ts` streams stdout as `chat.delta` chunks and emits a terminal `chat.message_end` + `status.idle`. Structured parser (tool calls, file tracking) deferred until Codex's structured output lands — tracked as a Phase 2+ follow-up. |
| 4 | Minimal committed regression test layer | ✅ `9e22903` — `packages/backend/tests/` with `prompt-builder.test.ts` (5 cases) + `file-patch.test.ts` (6 cases); wired `bun test`; 11/11 green. Broader E2E (Playwright) deferred to Phase 2 P2.10. |
| 5 | Re-run and document a clean Windows smoke-test pass | 🔲 Pending — **checklist now lives at `doc/07-manual-smoke-test.md`**. §1 covers Phase 1 sign-off; §2 covers Milestone 2.B (P2.4/P2.5/P2.6). Human at the keyboard only. |

When #5 passes without re-opening any of 1–4, the repo flips from "late Phase 1" to "Phase 1 complete".

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
- handoff export and broader packaging features

### Phase 4 - Design system ingestion and platform polish

Planned focus:
- upload a designed file and automatically extract a reusable design system
- broader design system extraction/import flows from external sources
- auto-update and SmartScreen signing

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

### Milestone 2.B — Interaction Modes 🟡

| # | Status | Slice | Key files | DoD |
|---|---|---|---|---|
| **P2.4** | ✅ | **Comment mode (pin + thread)** — `comments` table (`id`, `project_id`, `rel_path`, `node_selector`, `x_pct`, `y_pct`, `body`, `resolved_at`, `created_at`, `updated_at`). REST: `GET /api/projects/:id/comments`, `POST /api/projects/:id/comments`, `PATCH /api/projects/:id/comments/:commentId`. Canvas: clicking in Comment mode drops a pin anchored to a file-relative percentage; side panel holds the note and resolve toggle. Open (unresolved) comments are forwarded to the CLI prompt under `## Open comments`. | `backend/src/db/schema.ts`, `backend/src/db/migrations/0002_comments_pin.sql` (new), `backend/src/db/comments.ts` (new), `backend/src/routes/comments.ts` (new), `backend/src/server.ts`, `backend/src/services/context.ts`, `backend/src/harness/prompt-builder.ts`, `shared/src/comment.ts` (new), `frontend/src/api/comments.ts` (new), `frontend/src/components/canvas/CommentLayer.tsx` (new), `frontend/src/components/modes/CommentPanel.tsx` (new), `frontend/src/components/canvas/Canvas.tsx`, `frontend/src/components/canvas/CanvasTopBar.tsx`, `frontend/src/components/modes/ModePanel.tsx`, `frontend/src/views/ProjectView.tsx` | Clicking in comment mode creates a persisted pin that survives a reload; resolve toggles it; unresolved pins appear in the next CLI turn's prompt |
| **P2.5** | ✅ | **Edit mode (hover + property inspector → PATCH)** — `192a3c8`. Hover in Edit mode highlights any `[data-bg-node-id]` via iframe `elementFromPoint`; click locks a persistent orange selection box (200ms poll). Right-side `EditPanel` shows the tag + node id, a `<textarea>` for text, and attribute rows; Save diffs against the target and posts only changed fields to `PATCH /api/projects/:id/fs/*`. `applyHtmlNodePatch` (pure) rewrites only the targeted node; `data-bg-node-id` is immutable so pins don't orphan. Reindex + iframe `refreshTick` after save. | `backend/src/routes/artifacts.ts` (+PATCH), `backend/src/services/file-patch.ts` (new), `frontend/src/components/canvas/EditLayer.tsx` (new), `frontend/src/components/modes/EditPanel.tsx` (new), `frontend/src/api/files.ts` (new), `shared/src/file-patch.ts` (new) | Inline-edit a title → save to disk → iframe reload shows the new value; unit-tested via `bun test` (6 cases). |
| **P2.6** | ✅ | **Permission gate UI for tool calls** — `ec6ac66`. `tool.permission_required` events are derived from the SSE stream; `PermissionDialog` (Radix) surfaces the top-of-queue request with tool + input + callId. Allow/Deny route to `POST /api/sessions/:id/tool-decision`, persisted as `user.tool_decision`; Deny calls `interruptUserTurn` so the CLI exits cleanly. Derivation covers replay + live so a reload mid-prompt reopens the dialog. `POST /api/sessions/:id/dev/synthesize-permission` (BG_DEV-gated) publishes a synthetic event for end-to-end exercise since the Claude Code adapter doesn't surface real prompts yet. | `frontend/src/components/chat/PermissionDialog.tsx` (new), `frontend/src/api/session.ts` (+submitToolDecision), `frontend/src/views/ProjectView.tsx` (pending queue + dialog), `backend/src/routes/session.ts` (+tool-decision, +dev synth) | Synthesized permission event triggers a modal; Deny aborts the turn cleanly. Manual exercise steps in `doc/07-manual-smoke-test.md` §2.3. |

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
- DS extraction from uploaded design files / GitHub / Figma (Phase 4)
- macOS / Linux builds (Phase 3 P3.10 / P3.11)
- Auto-update, SmartScreen signing (Phase 4)
