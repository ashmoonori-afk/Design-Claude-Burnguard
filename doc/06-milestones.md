# Milestones and Delivery

> **Latest status (2026-04-24):**
>
> - BurnGuard is now best described as **late Phase 3 with Phase 4
>   actively underway**.
> - Phase 3 core slices are shipped in practice: present mode, handoff
>   export, structured Codex parsing, tool-decision channel, rollback
>   UI, watcher-driven `file.changed`, macOS packaging, and structured
>   Tweaks controls.
> - P4.1 is shipped, and P4.2 has broadly landed: Python-backed
>   PDF/PPTX upload ingest, compact attachment summaries plus
>   `.extracted.md` text-safe sidecars that the prompt steers the CLI
>   toward, Python/pypdf health checks, client-side upload-size gates,
>   and design-system rename / delete flows with template / project
>   reference guards. P4.2 exit criterion (primary brand colours within
>   10 % delta of a manual pick) still needs a dedicated acceptance
>   harness before we flip its badge to ✅.
> - Cross-cutting polish shipped on top of the Phase 3 / 4 base:
>   configurable mid-turn **Interrupt** button (Settings → Interrupt
>   button delay, default 300 s) that routes through the existing
>   `interruptUserTurn` / `AbortController` / SIGKILL path; rotating
>   composer waiting-state placeholder; upgraded project-type skills
>   (slide deck layout archetypes + strict per-slide rules, prototype
>   section archetypes + strict per-section rules + framework-free
>   artifact contract).
> - This-cycle polish on top of that: **compact chat context mode**
>   (`d148923`) plus a pre-extracted deck/prototype structure summary
>   and token-budget rules in the compact skill (`f5505d3`) so
>   multi-edit deck turns stop accumulating ~580 K cached tokens;
>   sticky-to-bottom chat with a "New messages" jump pill (`16e1388`);
>   one-click double-click launchers (`Start-BurnGuard.bat` /
>   `Start-BurnGuard.command`) backed by a sequenced
>   `scripts/dev-launcher.ts` that probes 14070, health-gates the
>   backend before starting Vite, opens the browser when frontend is
>   ready, and tears both children down on SIGINT or window close
>   (`36059ea` + `81c068c`).
> - `bun test` is currently 117/117 green and `npm run typecheck` is green.
> - Immediate remaining product priorities: close P4.2 acceptance,
>   implement P4.3 Figma sync, add stronger E2E coverage, then complete
>   signing and managed auto-update.

> **Progress key:** ✅ done · 🟡 in progress · 🔲 not started
>
> **Next-session pickup (2026-04-24):** Phase 3 **Milestone A + B fully
> shipped; Milestone C 4/5 shipped** (P3.11 Linux build still open).
> Phase 4 P4.1 DS auto-extract shipped; P4.2 upload ingest substantially
> landed (PDF / PPTX DS uploads, compact manifests + `.extracted.md`
> sidecars, Python health, upload-size gates, DS rename / delete).
> Cross-cutting polish shipped: configurable mid-turn Interrupt button
> (`c9cb760`), composer waiting-state placeholder (`162112d`),
> attachment extracted-text sidecar (`14e1691`), deck-skill layout
> archetype catalog (`6b182da`), prototype-skill section archetype
> catalog (`7c118bc`), **compact chat context mode** (`d148923`),
> **sticky-to-bottom chat scroll + "New messages" pill** (`16e1388`),
> **one-click double-click launchers + sequenced dev-launcher**
> (`36059ea` + `81c068c`), **deck/prototype structure summary +
> token-budget rules in compact skill** (`f5505d3`). `bun test`:
> 117/117 pass. **Resume at P3.11 (Linux build)** to close Milestone
> 3.C, or pick up Phase 4 — formalise P4.2 acceptance (primary-brand-
> colour delta harness), then P4.3 Figma sync. P3.10 Mac bundle still
> awaits hands-on Mac verification.

## 1. Current Stage

As of April 22, 2026, BurnGuard Design is **Phase 2 code-complete / awaiting
Windows smoke-test pass**. Phase 1 sign-off rows 1–4 are closed in code
(selector, interrupt, Codex decision, regression tests); row 5 (manual
smoke-test) is the last blocker and its checklist lives at
`doc/07-manual-smoke-test.md`.

The repo supports:

1. detect local backend CLIs + per-session backend switch
2. create a project (prototype / slide_deck) — two tutorials auto-seed on
   first launch
3. seed and inspect a design system
4. send a prompt with optional attachments
5. stream normalized events into the chat view
6. render the project artifact in the canvas — iframe DOM selector +
   computed styles, comment pins scoped to active slide, inline Edit of
   `[data-bg-node-id]` elements
7. refresh or auto-refresh the current file; interrupt mid-turn kills the
   CLI subprocess cleanly
8. export as HTML zip / PDF / PPTX (deck only); "Install Chromium" button
   in Settings bootstraps PDF/PPTX on demand
9. surface a permission-gate modal for `tool.permission_required` (wired
   end-to-end via a BG_DEV synthesize hook)

That means the phase is no longer "just planned". Phase 1 plus the entire
Phase 2 slice plan is merged; flipping the phase headings to ✅ just
requires working through `doc/07-manual-smoke-test.md` at a keyboard.

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
| 5 | Re-run and document a clean Windows smoke-test pass | 🟡 Partial — **checklist at `doc/07-manual-smoke-test.md`**. 1.2 Selector was initially failing ("cursor swapped to crosshair but no hover box"); root cause was cross-realm `instanceof HTMLElement` on iframe nodes in all four overlays. Fixed in `49892a4` — re-run of §1.2 pending. 1.3 Interrupt not verifiable this session (turns finished before interrupt click); recorded under "Known gaps" in `doc/07-manual-smoke-test.md`. §2 Milestone 2.B/2.C items never exercised yet. Human at the keyboard only. |

When #5 passes without re-opening any of 1–4, the repo flips from "late Phase 1" to "Phase 1 complete".

## 4. Original Phase Plan Versus Current Reality

The original Phase 1 plan assumed:
- only prototype project type
- no slide deck runtime yet
- real selector in Phase 1
- adapter and export work landing before extra template/runtime work

Current reality:
- Phase 2 ran ahead of the original schedule — slide_deck runtime, comment
  + edit + permission-gate modes, PDF/PPTX export, and settings all landed
  as part of what was supposed to be "Phase 1 cleanup + Phase 2 intro".
- The Phase 1 sign-off gaps that motivated §3 (placeholder selector, no real
  interrupt, no regression tests) are all closed in code.
- Codex remains on raw-mode for Phase 1 by design; structured parsing
  waits for Codex's own structured output format to land.

Net: the repo is functionally broad **and** the harness proofs are in
place. The only blocker is walking the smoke-test checklist on Windows.

## 5. Updated Roadmap

### Phase 1 - Prove the harness

Status: **code-complete; awaiting smoke-test pass**

Exit criteria (all met in code, awaiting manual verification):
- ✅ full prompt → render → refresh → HTML zip loop works on Windows
- ✅ selector is real, not placeholder-only (`ef7dedd`)
- ✅ turns can be interrupted safely (`de33be2`)
- ✅ a minimum automated regression suite exists (`9e22903`, `6069dab`;
  `bun test` → 23/23)

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

Status: **Milestones A + B shipped; M3.C 3/4 shipped (Linux build only remaining)**

Planned focus (see §8 for the commit-sized sprint plan):
- ✅ real tweaks panel (P3.1 `a1cf1f9`)
- ✅ draw mode (P3.2 `905d0ec`)
- ✅ present mode (P3.3 `b609101`)
- ✅ handoff export (P3.4 `92b7a64`, + review fix `8ff541f`)
- ✅ structured Codex parser (P3.5 `29431aa`)
- ✅ tool-decision channel to adapter (P3.6 `ff27231`)
- ✅ turn rollback UI (P3.7 `860fc1e`)
- ✅ light polish — brand palette, dead buttons, version 0.3.0 (P3.8 `fabc070` / `5cae730` / `c7e4f09`)
- ✅ watcher-driven `file.changed` (P3.9 `cea4a53`)
- ✅ macOS build — .app + optional dmg (P3.10 `9c26d7c`; Mac verification pending)
- 🔲 Linux build (P3.11)

### Phase 4 - Design system ingestion and platform polish

Status: **P4.1 shipped, P4.2 substantially shipped** (missing only the
formal colour-delta acceptance test). Remaining slices queued for
pickup any time after P3.11 closes.

Planned focus:
- ✅ DS auto-extract from github + website URLs (P4.1 — `68a8103` +
  `eafcd0c` + `e0bdae5`); see §9 for the slice detail
- 🟡 upload a designed file (PDF / PPTX / Figma export) and extract
  a reusable design system (P4.2) — PDF / PPTX path landed end-to-end,
  chat-attachment path landed, DS rename / delete flows landed, size
  gates landed; still owes the 10 %-delta colour-accuracy harness
- 🔲 Figma REST sync (P4.3)
- 🔲 Auto-update channel (P4.4)
- 🔲 Windows SmartScreen signing + macOS notarization (P4.5)

## 6. Delivery Guidance

For the next stretch, the engineering priority should be:

1. walk `doc/07-manual-smoke-test.md` to flip Phase 1 / M2.B / M2.C to ✅
2. keep docs synchronized with what actually ships in the repo
3. hold the Phase 3 slicing in §8 — resist bundling UI polish with new
   features; each P3 slice lands in one commit

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
- Draw mode / Present mode (Phase 3 P3.2 / P3.3)
- DS extraction from uploaded design files / GitHub / Figma (Phase 4)
- macOS / Linux builds (Phase 3 P3.10 / P3.11)
- Auto-update, SmartScreen signing (Phase 4)

## 8. Phase 3 Sprint Plan

Broken into 11 commit-sized slices across four milestones. Same rules as
§7: one slice per commit, each ends green, each carries its own DoD.

### Milestone 3.A — Productivity modes ✅

| # | Status | Slice | Key files | DoD |
|---|---|---|---|---|
| **P3.1** | ✅ | **Tweaks mode (two-way CSS inspector)** — `a1cf1f9`. TweaksLayer reuses the Edit mode overlay pattern (hover + click + 200ms poll for selection-box tracking) but keyed on `[data-bg-node-id]` elements and emerald-themed. TweaksPanel exposes 9 CSS properties across Typography + Box; each field shows the computed value as placeholder and the current inline override as the editable value. Commit on blur / Enter / empty-to-reset. PATCHes land on `/fs/*` with a new `styles` field that merges into the element's inline style (null removes a property; dropping every property removes the style attribute). `applyInlineStylePatch` / `parseInlineStyle` / `serializeInlineStyle` are exported pure helpers — 8 new unit tests (`file-patch.test.ts`) cover add / merge / remove / coexist-with-attributes / parse-tolerance / round-trip. Global Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z hooks up an undo/redo stack in ProjectView, idle when the focus is inside an input. | `frontend/src/components/canvas/TweaksLayer.tsx` (new), `frontend/src/components/modes/TweaksPanel.tsx` (new), `backend/src/services/file-patch.ts`, `shared/src/file-patch.ts`, `backend/src/routes/artifacts.ts`, `backend/tests/file-patch.test.ts`, `frontend/src/views/ProjectView.tsx` | Drag a font-size input → iframe rerenders → reload preserves the change. Ctrl+Z reverts. |
| **P3.2** | ✅ | **Draw mode (SVG overlay sketching)** — `905d0ec`. DrawLayer is a forwardRef'd SVG layer exposing `undo / redo / clear`. Pen / rect / arrow tools; tiny drags (< 4px / < 2 points) are discarded. Shapes serialize as real SVG children wrapped in `<g data-shape data-payload>` so the round-trip survives without a bespoke parser and the .svg renders standalone too. DrawPanel: tool selector, 5-color swatch, 3 stroke widths, undo / redo / clear buttons. Persistence via new `GET/PUT /api/projects/:id/draws/*` backed by `resolveDrawFile()` → `<project>/.meta/draws/<rel>.svg`. `.meta/` is already in IGNORED_DIRS, so exports + the file watcher skip annotations. On tab change: GET + deserialize + seed layer via `resetKey`. On every commit: serialize current shapes → PUT. Cmd/Ctrl+Z / Shift+Z routed through the layer ref while `mode === "draw"`. | `frontend/src/components/canvas/DrawLayer.tsx` (new), `frontend/src/components/modes/DrawPanel.tsx` (new), `frontend/src/api/draws.ts` (new), `backend/src/routes/artifacts.ts`, `backend/src/services/files.ts`, `frontend/src/views/ProjectView.tsx` | Sketch over a slide → navigate away and back → sketch still there |
| **P3.3** | ✅ | **Present mode** — `b609101`. PresentOverlay mounts a `position: fixed` z-9999 wrapper with its own iframe pointing at the deck's `/fs/` URL plus `?present=1`. deck-stage already handles that param by setting `body[data-presenter]`, which the slide-deck template CSS uses to reveal `.deck-notes`. Browser fullscreen is requested on mount; a `fullscreenchange` listener dismisses the overlay when the user exits via Esc / F11 so they never end up stuck in a dim non-fullscreen duplicate. Top-right Exit button, top-left elapsed-time chip (mm:ss, 500ms tick). ProjectTopBar's Play button gains `onPresent` + `canPresent`; enabled only when `project.type === "slide_deck"` AND the active tab resolves to a canvasSrc. Arrow / space / Home / End / F / Esc all continue to flow into deck-stage inside the overlay iframe. | `frontend/src/components/present/PresentOverlay.tsx` (new), `frontend/src/components/project/ProjectTopBar.tsx`, `frontend/src/views/ProjectView.tsx` | Click Present → deck fullscreens without nav → arrows advance → Esc returns |

### Milestone 3.B — Distribution & CLI fidelity ✅

| # | Status | Slice | Key files | DoD |
|---|---|---|---|---|
| **P3.4** | ✅ | **Handoff export** — `92b7a64` + `8ff541f` (review fix). zip bundles the full project tree under `source/` (minus `.meta` + `.attachments`) so every asset the HTML references — images, fonts, CSS, JS — ships. `spec.json` at the bundle root lists one entry per `[data-bg-node-id]` with tag, text, parent_bg_id, slide-local rect, and a fixed 18-key style subset; decks split into one page per slide. `tokens/` carries the linked design system's tokens CSS when available. README.txt documents the layout. Chromium fallback chain (bundled → chrome → msedge) matches PDF / PPTX. | `backend/src/services/export-handoff.ts` (new + bundle copy helper), extends `services/exports.ts`, `backend/tests/export-handoff.test.ts` (+ copyProjectIntoBundle tests), `frontend/src/components/export/ExportMenu.tsx` | Open zip → `source/<entrypoint>` renders in a browser with assets intact; `spec.json` gives a reader enough to reconstruct in React. |
| **P3.5** | ✅ | **Structured Codex parser** — `29431aa`. `parseCodexLine(line, ctx)` pure helper maps JSON lines with a `type` tag into `NormalizedEvent`s: tool_start / tool_end / file_change / usage / done / text / message / thinking / error, each accepting snake_case and dot.case variants. Unknown JSON / missing type / malformed JSON / plain text all fall through to `chat.delta` so raw-mode is preserved byte-for-byte until Codex actually emits structured lines. Tool correlation across start/end via a `toolNames` Map in the context. | `backend/src/adapters/codex/parser.ts` (new), `adapters/codex/index.ts` refactor, `backend/tests/codex-parser.test.ts` (14 cases) | Codex-emitted `{"type":"tool_start"}` produces tool.started + tool.finished events in chat — parity with Claude Code adapter. Raw-mode fallback preserved. |
| **P3.6** | ✅ | **Tool-decision round-trip channel** — `ff27231`. `AdapterRunInput.onDecision` registers a handler that receives `user.tool_decision` payloads. `submitToolDecisionToTurn(sessionId, decision)` returns `"delivered" / "queued" / "no_active_turn"`; queued decisions drain into the handler on register, a throwing handler requeues. Claude Code + Codex adapters both register and log decisions today — real stdin forwarding awaits a CLI-mode upgrade (Claude Code's `--input-format stream-json`). Deny continues to hard-abort as a safety fallback. | `backend/src/adapters/types.ts` (+ DecisionHandler, onDecision), `services/turns.ts` (queue / drain / submitToolDecisionToTurn), adapters register handlers, `routes/session.ts` routes decisions through the channel, `backend/tests/tool-decision-channel.test.ts` | Server-side channel delivers decisions; functional round-trip lands when an adapter upgrades its CLI mode. |
| **P3.7** | ✅ | **Turn rollback UI** — `860fc1e`. `writePreTurnSnapshot` now takes a full-file snapshot (excluding `.meta` + `.attachments`) to `<project>/.meta/checkpoints/snapshots/<turnId>/` before the adapter runs. `restoreFromSnapshot` wipes non-reserved top-level entries then copies the snapshot back. `POST /api/projects/:id/checkpoints/:turnId/restore` is 409 while a turn is running. `UserMessage` bubble gains a hover-in revert button (native confirm → mutation → refetch files/artifacts + bump iframe refreshTick). | `services/checkpoints.ts` (+snapshot/restore/hasSnapshot), `services/turns.ts` calls snapshot, `routes/session.ts` (+restore route), `api/checkpoints.ts` (new), `components/chat/blocks/UserMessage.tsx` (+revert button), `MessageStream.tsx` / `ChatPane.tsx` / `ProjectView.tsx` thread the mutation, `backend/tests/checkpoints.test.ts` | Send a bad turn → click revert on the user bubble → files roll back to pre-turn state, iframe reloads. |

### Milestone 3.C — Platform & polish 🟡

| # | Status | Slice | Key files | DoD |
|---|---|---|---|---|
| **P3.8** | ✅ | **Light polish — scope redefined** per user: palette + dead buttons + version management, explicitly not a11y sweep. <br/> Landed as `fabc070` (palette) + `5cae730` (dead buttons) + `c7e4f09` (version bump). <br/> **Palette:** `src/index.css` now exposes a raw `--color-white / --color-grey-{50..900} / --color-black / --color-blue-{50..900} / --color-green-500 / --color-red-500 / --color-orange-500 / --color-yellow-{100,500}` palette. Semantic tokens stored as RGB triples so Tailwind alpha modifiers keep working (`bg-accent/10`). Mapping: background/card/popover=white, foreground=grey-900, muted=grey-50, muted-foreground=grey-500, border=grey-100, accent=blue-500, destructive=red-500. `tailwind.config.ts` switches to `rgb(var(--xxx) / <alpha-value>)` + exposes the raw palette under `grey-*` and `brand-*` scales. <br/> **Dead buttons removed:** ProjectTopBar Pencil rename affordance + Share (no backend), CanvasTopBar 75% zoom dropdown (no handler). <br/> **Version:** 0.0.1-phase0 → 0.3.0 across root + all packages + `APP_VERSION`. | `frontend/src/index.css`, `frontend/tailwind.config.ts`, `frontend/src/components/project/ProjectTopBar.tsx`, `frontend/src/components/canvas/CanvasTopBar.tsx`, `package.json` (× 4), `shared/src/app.ts` | Palette centralized; no button in the UI is a dead link; version number is single-source-of-truth and bumped to 0.3.0. |
| **P3.9** | ✅ | **Watcher-driven `file.changed`** — `cea4a53`. FS watcher publishes real `file.changed` events to the session broker whenever a project file is edited / created / deleted outside of a CLI turn (e.g. a VS Code save). `file-change-broker.ts` dedupes against adapter-emitted events by (projectId, path) within a 2s window, so an adapter write doesn't produce a duplicate when the watcher catches its own write. Watcher events carry `turnId: "external"` as a sentinel. `.meta/` and `.attachments/` top-level paths are skipped. | `services/file-change-broker.ts` (new — dedupe cache + publish helper), `services/watchers.ts` (emit + debounce + session cache), `services/turns.ts` (notes adapter events into dedupe cache), `backend/tests/file-change-broker.test.ts` | Save a deck file in VS Code → chat shows `file.changed` within 1s, canvas reloads. |
| **P3.10** | ✅ | **macOS build** — `9c26d7c`. `scripts/build-mac.ts` cross-compiles `bun-darwin-arm64` and assembles a real `.app` bundle (Info.plist with APP_VERSION, minimum macOS 11, staged frontend inside `Contents/MacOS/`, icon slot for `assets/icon.icns` when present). `--dmg` path calls `hdiutil create -format UDZO` on macOS only. `package.json` gains `build:mac` + `build:mac:dmg`. Fixed `--external electron` on both mac + windows compile scripts (playwright-core's optional electron loader was failing the bun compile). | `scripts/build-mac.ts` (new), `scripts/build-binary.ts` (+ external electron), `package.json` scripts, README build section | `bun run build:mac` produces a runnable `.app` bundle; on macOS, `build:mac:dmg` produces a working `.dmg`. Mac-side hands-on verification pending. |
| **P3.11** | 🔲 | **Linux build** — AppImage via `bun-linux-x64`. Falls back to a plain tarball if AppImage tooling isn't available. | `scripts/build-linux.ts` (new), `package.json` scripts | `bun run build:linux` produces an AppImage that runs on Ubuntu 22.04+ |
| **P3.12** | ✅ | **Tweaks structured controls** — `432521c`. Replaces the generic text-input grid with typed controls: numeric `px` inputs with trailing unit label for `font-size` / `line-height` / `letter-spacing`; dropdown of common weights for `font-weight`; popover-style color pickers backed by the brand palette (`src/index.css` → 28 swatches in Grey / Blue / Accent groups) + hex input + Clear for `color` / `background-color`; 4-side compact inputs for `padding` / `margin` / `border-radius` that recompose the shortest CSS shorthand on commit. `background` shorthand renamed internally to `background-color` so the picker operates on a clean colour value. No changes to the PATCH contract or ProjectView's undo/redo wiring. Helpers extracted to `tweaks-utils.ts` (`parseSides` / `composeSides` / `numericFromLength` / `normalizeHex`); palette data in `tweaks-palette.ts`. | `frontend/src/components/modes/TweaksPanel.tsx` (rewrite), `frontend/src/components/modes/tweaks-palette.ts` (new), `frontend/src/components/modes/tweaks-utils.ts` (new), `frontend/src/components/canvas/TweaksLayer.tsx` (key rename) | Opening Tweaks on any deck element exposes numeric-only size inputs, a clickable palette for colours, and 4-side shorthand controls that match the node's computed values. Polish follow-up on P3.1 that unblocks real design work. |

### Ground rules for Phase 3

1. **One commit per slice.** Same as Phase 2. Bundle only if two slices
   share a single surface that would be churn to split (rare).
2. **UI polish (P3.8) is strictly no-behaviour-change.** If a slot calls
   for a new widget or layout rearrangement, it belongs in a fresh
   numbered slice, not inside P3.8.
3. **Tests track the surface area being shipped.** Tweaks inline-style
   PATCH gets a pure-function unit test the same way EditLayer did
   (`applyInlineStylePatch`). Handoff export spec JSON shape gets a
   snapshot test.
4. **No Phase 4 creep.** DS ingestion from uploads / Figma / GitHub and
   auto-update stays Phase 4 even when adjacent to P3.4 or P3.10.
5. **Merge boundaries:** M3.A (P3.3), M3.B (P3.7), M3.C (P3.11) are
   three reasonable PR split points.

### Out of scope for Phase 3 (Phase 4 or later)

- Upload a design file → auto-extract a reusable design system
- Figma / GitHub sync
- Auto-update + SmartScreen signing
- Full dark-mode visual design (P3.8 covers the token / focus work but
  not a polished dark palette)

## 9. Phase 4 Sprint Plan

Sliced commit-by-commit. Same rules as Phase 2 / 3 — one commit per
slice, each ends green, each carries its own DoD.

| # | Status | Slice | Key files | DoD |
|---|---|---|---|---|
| **P4.1** | ✅ | **DS auto-extract — github + website URLs.** `POST /api/design-systems/extract` clones a shallow git repo (`git clone --depth=1`) or fetches a live homepage HTML (+ same-origin linked CSS) into a temp dir, walks the tree collecting CSS custom properties, font-families, and logo-like asset candidates, then templates a canonical BurnGuard design system under `~/.burnguard/data/systems/<id>/` (README.md, SKILL.md, colors_and_type.css, fonts/, assets/logos/, preview/*.html × 16, ui_kits/website/, uploads/). Companion `GET /api/design-systems/:id/files/*` serves any file under the system dir with a sniffed Content-Type so iframe previews + linked CSS resolve without a separate static host. Drizzle enum grows a `"website"` source_type; migration `0004_design_systems_website_source_type.sql` rebuilds the SQLite CHECK constraint to match (migrate.ts toggles `PRAGMA foreign_keys` off/on around the loop so the DROP+RENAME doesn't trip the projects FK). Home → **Systems** tab carries the import form (source URL + auto/github/website selector + optional name); submission navigates to the new DS and shows a validation card. Test coverage: 4 unit tests for the pure helpers (`inferSourceType` / `extractCssCustomProperties` / `contentTypeForDesignSystemFile`); `bun test` 67/67. | `backend/src/services/design-system-extract.ts` (new ~1100 lines), `backend/src/routes/system.ts`, `backend/src/db/schema.ts`, `backend/src/db/seed.ts` (+createDesignSystemRecord), `backend/src/db/migrate.ts` (FK toggle), `backend/src/db/migrations/0004_design_systems_website_source_type.sql` (new), `shared/src/design-system.ts` (+DesignSystemSourceType / request+response types), `frontend/src/api/design-system.ts` (new), `frontend/src/views/HomeView.tsx` (+import form on Systems tab), `frontend/src/views/DesignSystemView.tsx` (+validation card), `frontend/src/components/systems/*` (drop "preview route pending" copy), `backend/tests/design-system-extract.test.ts` (new), `doc/05-design-system-format.md` | Import a small public repo or any homepage → new DS appears in Home → Systems tab as a Draft → preview cards render → files under `~/.burnguard/data/systems/<id>/` match the canonical layout |
| **P4.2** | 🟡 | **Upload-file DS extract (PDF / PPTX).** Reuses the canonical writer; swaps the source ingest stage for a multipart upload → Python-backed extractor (`pypdf` + `python-pptx`) → compact manifest (`uploads/manifest.json`) with colors, fonts, headings, bodies, per-page / per-slide summaries. The same manifest path feeds chat attachments, and each attachment also emits a `.extracted.md` text sidecar the prompt steers the CLI toward (instead of the raw binary). Draft validation card surfaces extraction notes + page-limit warnings. Settings → Python for uploads installs `pypdf` on demand. Client-side upload-size gates + design-system rename / delete flows (with template and project-reference guards) landed on this slice. Figma export extraction deferred to P4.3. | `backend/src/services/design-system-extract.ts` (+uploadIngest + normalizers), `backend/src/services/upload-extractor-py.ts` (new), `backend/src/services/upload-component-detect.ts` (new), `backend/src/services/attachments.ts` (+extracted sidecar), `backend/src/services/python-health.ts` (new), `backend/src/routes/settings.ts` (+python routes), `backend/src/harness/prompt-builder.ts` (sidecar steer), `packages/backend/requirements.txt`, `frontend/src/views/HomeView.tsx` (upload form), `frontend/src/views/DesignSystemView.tsx` (rename/delete + validation card), `frontend/src/components/settings/SettingsModal.tsx` (python install card) | Upload a 10-slide PPTX → canonical DS created; primary brand colors within 10% delta of manually picked values (acceptance harness still owed before closing) |
| **P4.3** | 🔲 | **Figma REST sync.** Accept a Figma PAT (stored in `config.json`, chmod 600) + a file URL; fetch styles + component thumbnails; emit the same canonical bundle. Two-way sync (publish back) stays out of scope for P4.3. | `backend/src/services/figma.ts` (new), `backend/src/services/design-system-extract.ts` (+figmaIngest), `backend/src/routes/system.ts` (+POST /extract with source_type=figma), UI secret form | Authenticate with a test Figma file; tokens extract matches the styles page |
| **P4.4** | 🔲 | **Auto-update channel.** Publish signed releases to a static bucket; app checks on launch, offers download + restart; fall back to the current manual download path. | `scripts/release.ts`, `backend/src/services/updater.ts` (new), `shared/src/release.ts` (new), `frontend/src/components/updater/UpdateBanner.tsx` (new) | New release available → in-app banner → one-click download + restart reopens with the new binary |
| **P4.5** | 🔲 | **Windows SmartScreen signing + macOS notarization.** Wire `signtool.exe` (Windows) + `codesign` + `notarytool` (macOS) into the existing `build:windows` / `build:mac` scripts. Requires an EV code signing cert (Windows) + Apple Developer ID. | `scripts/build-binary.ts` / `scripts/build-mac.ts`, CI workflow, signing secrets | Windows SmartScreen no longer flags the binary on first run; macOS Gatekeeper admits the .app without right-click-open |

| **P4.6** | ?뵴 | **Easy install / launch packages.** Add user-friendly distributables so people can install and open BurnGuard without cloning the repo or touching a terminal. **Windows:** ship a real installer (`Setup.exe` or `.msi`) that places the app in a managed install root, creates shortcuts, and can run first-launch bootstrap checks. **macOS:** ship a user-friendly package (`.dmg` with `.app`, optionally later `.pkg`) with a clear drag-and-drop install path and first-run bootstrap inside the app. Bootstrap scope: verify or guide Chromium / Python prerequisites, create the managed app root, and hand off to the normal app launch. This is separate from auto-update: the goal here is frictionless first install and first launch. | `scripts/build-installer-win.ts` (new), `scripts/build-package-mac.ts` (new or extends `build-mac.ts`), first-run bootstrap hooks, release packaging workflow, docs / first-run copy | A non-technical user can download one package, install or open BurnGuard in one guided flow, and reach the app without manual repo, shell, or dependency setup |

### Ground rules for Phase 4

1. **One commit per slice.** Same as Phase 2 / 3.
2. **Every new extraction source reuses `writeCanonicalDesignSystem`.**
   Source-specific ingest is the only variant; the canonical layout
   stays identical across github / website / upload / figma.
3. **No schema drift without a migration.** Anything that widens an
   enum or adds a column ships with its own `NNNN_*.sql` plus the
   migrate.ts FK toggle pattern that landed in P4.1.
4. **Merge boundaries:** P4.3 is a natural PR cut (covers all the
   "ingest a design system" work); P4.6 is the next one (covers all
   the "make it publishable" work).

## 10. Phase 5 Sprint Plan

Focused on post-packaging distribution work that should happen only
after the Windows/macOS binary layouts are stable.

| # | Status | Slice | Key files | DoD |
|---|---|---|---|---|
| **P5.1** | ?뵴 | **Windows + macOS managed auto-update channel.** Do not update the git repo directly. Publish a release manifest (`latest.json`) plus per-platform zip artifacts, detect updates on launch, download into `~/.burnguard/cache/updates/`, and apply via platform-specific installers. Windows uses a helper/updater process to replace the running `.exe`; macOS replaces the managed `.app` bundle and relaunches it. Linux remains out of scope for this slice. | `scripts/release.ts`, `shared/src/release.ts` (new), `backend/src/services/updater.ts` (new), `backend/src/services/install-paths.ts` (new), `backend/src/services/apply-update-win.ts` (new), `backend/src/services/apply-update-mac.ts` (new), `backend/src/routes/updater.ts` (new), `frontend/src/api/updater.ts` (new), `frontend/src/components/updater/UpdateBanner.tsx` (new) | A managed Windows or macOS install detects a newer release, downloads the correct platform asset, applies it, and relaunches on the new version without touching user data in `~/.burnguard` |

### Ground rules for Phase 5

1. **Managed installs only.** Auto-update must target a known app root,
   not a random zip extraction or git clone location.
2. **Release artifacts, not repo sync.** Update from staged zip bundles
   described by a manifest; never `git pull` the repo at runtime.
3. **Windows and macOS first.** Linux remains out of scope until the
   packaging format is stable.
