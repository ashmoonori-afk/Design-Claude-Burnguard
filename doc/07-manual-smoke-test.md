# Manual Smoke Test Checklist

Anything here has to be executed by a human at the keyboard — automated
coverage is either impossible (iframe + external CLI) or deferred (E2E
is P2.10). Run this before flipping Phase 1 / Phase 2 Milestone B to
✅ in `doc/06-milestones.md`.

## 0. Prep

```bash
bun install
cd packages/backend && bun run dev   # terminal 1, keep BG_DEV=1 for the synthesize hook
cd packages/frontend && bun run dev   # terminal 2
```

Open http://localhost:5173 in Chrome (Edge is fine; Safari is not a
tier-1 target).

Install a working `claude` CLI on `PATH` before starting so turn tests
actually spawn a subprocess. Codex is optional — detection will
degrade gracefully.

## 1. Phase 1 Sign-Off (blocks "Phase 1 complete")

### 1.1 Project creation + turn

- [ ] Home: create a `slide_deck` project named `smoke-deck`, pick
      the default design system.
- [ ] Composer: send `Make slide 1 a bold hero with a red accent.`
- [ ] Chat pane: streams `status.running` → `chat.delta` chunks →
      `status.idle{stopReason:"end_turn"}`.
- [ ] Canvas iframe: live-renders the updated `deck.html` without a
      manual refresh.
- [ ] Files sidebar: `deck.html` appears with a new `updated_at`.

### 1.2 Selector mode (FE-S1-05, closed in `ef7dedd`)

- [ ] Click **Select** in the top bar. Hover across real slide
      elements — a sky-blue box follows the cursor.
- [ ] Click a heading. Right pane shows the real `font-family`,
      `font-size`, `color`, etc. **not** the old hardcoded
      `placeholder-hero-title` values.
- [ ] Arrow-key through slides (← / →). The selection box stays
      anchored (200ms poll).
- [ ] Click empty space. Selection clears.

### 1.3 Interrupt (closed in `de33be2`)

- [ ] Send a long turn (e.g. `rewrite every slide`).
- [ ] While streaming, click the interrupt control.
- [ ] Chat stream ends with `status.idle{stopReason:"interrupted"}`
      within ~1s; composer unlocks.
- [ ] Task Manager confirms the `claude.cmd` / `node.exe` child is
      gone (no orphan).

### 1.4 HTML zip export

- [ ] Export → HTML zip. Job transitions `queued → running → succeeded`.
- [ ] Download the zip. Unzip. Open `deck.html` in a browser offline —
      renders identically (runtime JS bundled, no external fetch).

### 1.5 Codex raw-mode (decision-only, closed)

- [ ] If Codex is installed, flip backend to Codex in the session,
      send a short turn, confirm chat shows a streaming `chat.delta`
      blob terminated by `status.idle`. Structured tool events are
      **expected to be absent** — that's the documented Phase 1 scope.

## 2. Phase 2 Milestone B (blocks "M2.B complete")

### 2.1 Comment mode (P2.4)

- [ ] Enter Comment mode. Click on slide 2. Pin appears; right pane
      gains a new entry.
- [ ] Type a note, click away. Reload the page — pin and note survive.
- [ ] Advance to slide 3. Slide-2 pin disappears from both the canvas
      and the panel.
- [ ] Return to slide 2. Pin reappears.
- [ ] Resolve the pin. Pin + entry disappear from slide 2.
- [ ] Send a new turn. Server-side prompt must contain the unresolved
      pins under `## Open comments` (inspect `session_trace.jsonl` or
      backend console).

### 2.2 Edit mode (P2.5)

- [ ] Enter Edit mode. Hover an element that has `data-bg-node-id`
      (slide headings in the default deck template). Orange box
      tracks the element.
- [ ] Click to lock selection. Right pane shows the tag + node id +
      text + attributes.
- [ ] Edit the text, click **Save**. PATCH returns 200; iframe
      reloads; new text is visible.
- [ ] Re-open the file from the tab list — change is persisted
      on disk (reopen `deck.html` in VS Code to double-check).
- [ ] Try editing an element without `data-bg-node-id`. Hover should
      **not** highlight it; the panel stays empty.

### 2.4 PDF export (P2.7)

Requires Chromium — if not yet installed, do §2.6 first.

- [ ] From the deck tutorial (§2.7) or any `slide_deck` project, open
      **Export → PDF (deck only)**. The menu option is enabled only for
      slide_deck; verify the "deck only" hint for a prototype project.
- [ ] Export status transitions `queued → running → succeeded` in the
      dropdown.
- [ ] Download the `.pdf`. Open in a PDF viewer.
  - Page count equals slide count (3 for the tutorial, 15 for the
    original milestone target).
  - No nav bar / "1 / 3" counter visible anywhere.
  - Slide backgrounds extend to page edges (zero-margin).
  - Font fidelity is good enough that text is readable (exact font
    rendering depends on what's installed in the browser).

### 2.5 PPTX export (P2.8)

Requires Chromium.

- [ ] Export → PowerPoint (.pptx) — deck only.
- [ ] Download. Open in real PowerPoint (or Keynote / LibreOffice
      Impress as a fallback).
- [ ] Each slide has editable text boxes — clicking a heading lets you
      type. **Not** a flattened screenshot.
- [ ] Slide count matches. Background colours approximate the source.
- [ ] Bold / italic / text-alignment are preserved; font family
      degrades gracefully if PowerPoint can't resolve the webfont
      (substitution is expected).

### 2.6 Chromium install via Settings (P2.9)

- [ ] Before installing: open Settings. The "Chromium for exports"
      section shows a grey dot + "Not installed (or status unknown)."
- [ ] Click **Install Chromium**. Dot turns amber and pulses;
      button flips to "Installing…". Log tail shows `npx` output
      updating every 1.5s.
- [ ] Wait for completion (~1-5 min on first run, ~170MB download).
      Dot turns green; button flips to "Reinstall".
- [ ] Close and reopen Settings — state survives (polled from the
      service singleton, not component state).
- [ ] Trigger a PDF or PPTX export (§2.4/2.5). The Chromium launch
      uses the just-installed binary (no error toast).

### 2.6a Per-session backend switch (P2.9)

- [ ] In ChatPane tab header right side: `cc | cx` toggle. Current
      backend is highlighted.
- [ ] Click the inactive option while the session is idle. Tooltip
      says "Switch to X on next turn". Click commits via PATCH.
- [ ] Send a new turn. Server spawns the newly-selected CLI (watch
      backend console for `[claude-code] spawn` vs `codex` spawn
      logs).
- [ ] While a turn is running, the toggle is disabled with a
      "Cannot switch while a turn is running" tooltip.

### 2.7 Tutorial seeds + export matrix (P2.10)

- [ ] Fresh install (or delete `~/.burnguard/data/burnguard.sqlite`
      then restart the backend). Home page lists two tutorials:
      `[burnguard:tutorial] Prototype demo` and `[burnguard:tutorial]
      Slide deck demo`.
- [ ] Open the prototype tutorial. Entrypoint loads from disk (no
      turn needed). Editable anchors exist on the headline / body /
      CTA for Edit mode.
- [ ] Open the deck tutorial. Three slides render; arrow keys
      navigate; Comment + Edit modes work against the pre-seeded
      `data-bg-node-id` anchors.
- [ ] Export matrix — each cell produces a non-empty file and opens
      correctly:
  | Project            | html_zip | pdf | pptx |
  |--------------------|----------|-----|------|
  | Prototype tutorial | ✅       | n/a | n/a  |
  | Deck tutorial      | ✅       | ✅  | ✅   |
- [ ] Delete one tutorial project. Restart the backend. The deleted
      one is **not** recreated (idempotency). The surviving one
      stays untouched.
- [ ] Run `BG_EXPORT_SMOKE=1 bun test` in `packages/backend` — 23/23
      pass.

### 2.3 Permission gate (P2.6)

- [ ] Confirm `BG_DEV=1` was set for the backend (required for the
      synthesize hook).
- [ ] In devtools console:
      ```js
      fetch(`/api/sessions/${sessionId}/dev/synthesize-permission`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: "Bash", input: { command: "rm -rf /tmp/demo" } }),
      }).then((r) => r.json()).then(console.log);
      ```
      (Grab `sessionId` from the project page URL or the network tab.)
- [ ] Modal opens showing tool=Bash, the command input, and the
      toolCallId.
- [ ] Click **Deny & abort**. If a turn was running, it terminates
      with `status.idle{stopReason:"interrupted"}`. Modal closes.
- [ ] Synthesize again. Click **Allow**. Modal closes; decision is
      recorded (check `user_events` table or backend trace).
- [ ] Reload the page mid-dialog. The modal reopens (derived from
      replay). Decide, confirm it closes and does not reappear.

## 3. Reporting

When you finish, update `doc/06-milestones.md`:
- Flip §3 row 5 (Windows smoke test) to ✅ with the date.
- If every M2.B item passes, flip the Milestone 2.B heading to ✅.
- File any failure under a new `## Known gaps` heading in this doc
  with the item number, expected vs actual, and a link to a commit or
  issue.

## Known gaps

- **1.3 Interrupt (Phase 1)** — 2026-04-23 smoke run could not verify
  the interrupt control because every test turn completed too quickly
  to click the button mid-stream. Needs a retry with a deliberately
  long prompt (e.g. `rewrite every slide with a 500-word rationale`)
  to keep the turn running for ~30s+. Until re-verified, Phase 1
  sign-off stands at 4/5 — §3 row 5 in `doc/06-milestones.md` remains
  un-flipped.
