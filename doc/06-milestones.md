# Milestones and Delivery

> **Progress key:** ✅ done · 🟡 in progress · 🔲 not started
>
> **Next-session pickup (2026-04-22):** Phase 2 code-complete.
> Phase 1 sign-off items 1–4 closed in code; item 5 (Windows smoke
> test) blocks phase flip — checklist at
> `doc/07-manual-smoke-test.md`. **Milestones A + B + C all shipped
> (P2.1 – P2.10).** Latest commits: `6069dab` (P2.10 tutorials +
> smoke harness), `90f80be` (P2.9 settings panel / chromium install /
> per-session backend switch), `e8bd337` (P2.8 PPTX via pptxgenjs),
> `83f71f1` (P2.7 PDF via Playwright). `bun test`: 23/23 pass;
> chromium-dependent cells opt-in via `BG_EXPORT_SMOKE=1`. **Resume
> at Phase 1 / M2.B / M2.C smoke-test pass**; once green, flip the
> phase headings to ✅ and plan Phase 3.

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
- Phase 2 entire Milestone B/C stack has shipped — awaiting the manual smoke-test pass at `doc/07-manual-smoke-test.md` to close

### 2.3 Not done

- full end-to-end (Playwright UI) tests — backend unit + opt-in export smoke exist (`9e22903`, `6069dab`)
- structured Codex parser (decision: ship raw-mode for Phase 1; upgrade deferred — see §6)
- handoff export (Phase 3)
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

Status: **Milestones A + B + C code-complete; awaiting smoke-test pass**

High-level focus (see §7 for the concrete commit-sized sprint plan):
- ✅ slide deck workflow foundation (template, runtime, prompt skill)
- ✅ comment and edit modes (P2.4, P2.5)
- ✅ permission gate UI (P2.6)
- ✅ PDF and PPTX export (P2.7, P2.8)
- ✅ settings panel with chromium install + per-session backend switch (P2.9)
- ✅ tutorial seeds + export smoke harness (P2.10)

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

### Milestone 2.C — Exports & Settings ✅

| # | Status | Slice | Key files | DoD |
|---|---|---|---|---|
| **P2.7** | ✅ | **PDF export via Playwright** — `83f71f1`. `runExport` gains a `pdf` branch that stages the deck and hands it to `renderDeckToPdf`, which uses playwright-core to open `file:///deck.html?print=1`, waits for `data-deck-ready`, injects `PDF_PRINT_CSS` (overrides the active-slide gate, page-break-after:always per slide, nav hidden), and calls `page.pdf({ format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true })`. Browser launch chain: bundled → `channel:chrome` → `channel:msedge` → `PdfExportError("chromium_not_installed")`. | `backend/src/services/exports.ts`, `backend/src/services/export-pdf.ts` (new), `backend/tests/export-pdf.test.ts` (new), `playwright-core` dep, `frontend/src/components/export/ExportMenu.tsx` (un-gate + deck-only), `ProjectTopBar.tsx` (pass projectType) | 15-slide deck exports to a 15-page PDF; zero nav-bar artifacts. Manual step in smoke-test §2.4. |
| **P2.8** | ✅ | **PPTX export via `pptxgenjs`** — `e8bd337`. `renderDeckToPptx` runs Playwright, extracts per-slide text anchors via `page.evaluate(EXTRACT_SLIDES_FN)` — walks [data-slide] subtrees collecting elements with direct text nodes, reads computed font-size / family / weight (≥600 → bold) / style / color / text-align, records slide-local bounding rects. `writePptx` (pure) maps viewport px → pptx inches on a 10×5.625 16:9 layout, px → pt×0.75 for font sizes, emits one addText per extract so PowerPoint opens it with editable text boxes (not screenshots). | `backend/src/services/export-pptx.ts` (new), `backend/tests/export-pptx.test.ts` (new), `pptxgenjs` dep | Deck → .pptx opens in PowerPoint with editable text boxes per slide. Manual step in smoke-test §2.5. |
| **P2.9** | ✅ | **Settings panel** — `90f80be`. `SettingsModal` gets a "Chromium for exports" section with a live state dot, Install/Reinstall button, and a 12-line tail auto-polled every 1.5s while state=installing. Backend `startPlaywrightInstall()` spawns `npx -y playwright install chromium` (cmd.exe on Windows) as a singleton; `GET /api/settings/playwright` returns status. Separately: `ChatPane` carries a compact `cc | cx` toggle that PATCHes `/api/sessions/:id/backend` when the session is idle so the next turn uses the new CLI. | `backend/src/routes/settings.ts` (new), `backend/src/services/playwright-install.ts` (new), `backend/src/routes/session.ts` (+PATCH /backend), `backend/src/db/events.ts` (+setSessionBackend), `frontend/src/components/settings/SettingsModal.tsx`, `frontend/src/components/chat/ChatPane.tsx`, `shared/src/settings.ts` (new) | Switch backend at runtime (next turn uses new CLI); Playwright install button actually runs the command. Manual step in smoke-test §2.6. |
| **P2.10** | ✅ | **Tutorial projects + export smoke tests** — `6069dab`. `seedTutorialsOnce()` wired into `bootstrap.ts` creates `[burnguard:tutorial] Prototype demo` and `[burnguard:tutorial] Slide deck demo` on first launch. HTML is self-contained (no remote assets) with `data-bg-node-id` anchors. `tests/exports.test.ts` sanity-checks the tutorial HTML structure and (opt-in via `BG_EXPORT_SMOKE=1`) runs the real `renderDeckToPdf`/`renderDeckToPptx` against a staged deck. Default `bun test` stays green without Chromium: 23 pass. | `backend/src/db/seed-tutorials.ts` (new), `backend/src/bootstrap.ts` (+seedTutorialsOnce), `backend/tests/exports.test.ts` (new) | First launch creates tutorials; `bun test` green. Manual step in smoke-test §2.7. |

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
