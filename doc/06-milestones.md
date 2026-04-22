# Milestones & Delivery

## Phase 1 — "Prove the harness" (4–5 weeks)

### Goal

A Windows binary where the user can complete one full cycle: **"select CLI → create project → pick sample DS → chat (with attachments) → render → refresh → zip export"**.

### Tasks

| # | Task | Difficulty | Est. (days) |
|---|---|---|---|
| 1.1 | Monorepo scaffold (Bun workspaces + tsconfig refs + ESLint) | S | 0.5 |
| 1.2 | `packages/shared`: event types, interfaces | S | 1 |
| 1.3 | `packages/backend`: Hono server + health check + static SPA serving | S | 1 |
| 1.4 | DB: drizzle schema + migrations + seed (sample DS preload) | M | 2 |
| 1.5 | Harness core: broker, fanout, event persistence | M | 3 |
| 1.6 | Harness core: context-builder (DS injection) | M | 2 |
| 1.7 | Harness core: fs-watcher (chokidar → file.changed) | S | 1 |
| 1.8 | Harness core: checkpoint (tar.zst) | M | 2 |
| 1.9 | Claude Code adapter: detect + runner + parser | L | 4 |
| 1.10 | Codex adapter: detect + runner + parser (best-effort) | L | 3 |
| 1.11 | REST API: /projects, /systems, /sessions, /events, /attachments, /files | M | 3 |
| 1.12 | SSE: /sessions/:id/stream + resume | M | 2 |
| 1.13 | Export: HTML zip | S | 1 |
| 1.14 | Frontend scaffold: Vite + React + Tailwind + Shadcn setup | S | 1 |
| 1.15 | Frontend: HomeView (list, creation panel) | M | 3 |
| 1.16 | Frontend: ProjectView layout (3-pane) | M | 2 |
| 1.17 | Frontend: ChatPane stream renderer (tool badges, thinking, file refs, error cards) | L | 4 |
| 1.18 | Frontend: Composer + file drop + attachment upload | M | 2 |
| 1.19 | Frontend: Canvas iframe + Refresh button | M | 2 |
| 1.20 | Frontend: read-only selector overlay | M | 2 |
| 1.21 | Frontend: DesignFilesView + file preview | M | 3 |
| 1.22 | Frontend: DesignSystemView (read-only preview) | S | 1 |
| 1.23 | Frontend: Settings modal (CLI selection, Playwright install) | S | 1 |
| 1.24 | Tutorial project + sample DS preload | S | 1 |
| 1.25 | Bun compile Windows x64 + icon + updater skeleton | M | 2 |
| 1.26 | Integration tests (e2e smoke x5) | M | 2 |
| 1.27 | README + install guide | S | 1 |

**Total estimate**: ~49 days ≈ 10 weeks solo, 5 weeks for 2 people, 3–4 weeks for 3.

### DoD
1. `burnguard-design.exe` builds successfully (< 100 MB, code signing optional)
2. Running the binary opens the default browser automatically
3. At least one of Claude Code / Codex (if installed) successfully starts a session
4. Prototype project creation works, using the Goldman Sachs sample DS
5. Chat with image attachment (e.g. "make a landing hero using this") renders something onto the canvas
6. Refresh button reflects latest file tree
7. Clicking a canvas element displays its computed style in the right panel (read-only)
8. HTML zip export succeeds; extracted `index.html` renders in a browser
9. Re-launching the binary restores projects/sessions/events

### Test Strategy

- **Unit**: harness parsers, context builder, event normalization (Vitest / bun:test, 80%+ coverage)
- **Integration**: 
  - Claude Code CLI stub (fixture output) → full session lifecycle
  - Codex CLI stub → full session lifecycle
  - DB migrations up/down
- **E2E**: Playwright (dev-only, not bundled into the binary)
  - 5 smoke tests: project creation, chat send, file drop, Refresh, zip export

### Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Claude Code `--print --output-format stream-json` under-documented | M | H | Week 1 spike — lock parser contract against real output |
| Codex CLI stability (frequent updates) | H | M | Best-effort parser + raw-mode fallback |
| Bun Windows PTY (`node-pty`) compatibility | M | H | Alternative: direct `conpty` or `execa` piping |
| PyInstaller → Bun compile transition unverified | L | M | Phase 0 one-day PoC |
| Unsigned binary → SmartScreen warning | H | M | Ship bypass guide; revisit signing in Phase 3 |

## Phase 2 — "Decks & Modes & Exports" (3–4 weeks)

### Tasks

| # | Task | Difficulty |
|---|---|---|
| 2.1 | Slide deck project type + template | M |
| 2.2 | `deck-stage.js` runtime (pagination, present-mode hooks) | L |
| 2.3 | Comment mode (pin + thread) | M |
| 2.4 | Edit mode (contenteditable + save back to file) | M |
| 2.5 | PDF export (Playwright: slide-split rendering) | M |
| 2.6 | PPTX export (pptxgenjs: separate text layers) | L |
| 2.7 | Settings screen: adapter choice / Playwright reinstall | S |
| 2.8 | Two more tutorials added (prototype, slide deck) | S |
| 2.9 | Permission gate UI (confirmation modal) | M |

### DoD
- 15-slide investor pitch deck generated, exported to PDF/PPTX, opens in PowerPoint
- Comments can be placed and resolved
- Edit mode changes persist to disk
- Runtime backend switching works

## Phase 3 — "Power user" (4–5 weeks)

### Tasks

| # | Task | Difficulty |
|---|---|---|
| 3.1 | **Full Tweaks panel** (two-way CSS inspector) | L |
| 3.2 | Tweak diff → context injection (preservation hint on next turn) | M |
| 3.3 | Draw mode (canvas overlay + save as SVG layer) | M |
| 3.4 | Present mode (fullscreen + keyboard nav) | S |
| 3.5 | DS extraction: GitHub URL → git clone + parsers | L |
| 3.6 | DS extraction: Figma URL → REST API | L |
| 3.7 | DS review UI (draft → review → published state machine) | M |
| 3.8 | Handoff export (`spec.json + tokens.json + PROMPT.md`) | M |
| 3.9 | `From template` project type | M |
| 3.10 | macOS arm64 build + code signing | M |
| 3.11 | Linux x64 build | S |

### DoD
- Given a GitHub DS SCSS repo URL, a complete DS is generated
- A tweak made in Phase 3 panel is respected on the next Claude turn
- `burnguard handoff {project}` copies a Claude Code command to clipboard
- macOS and Linux binaries build successfully

## Phase 4+ (backlog)

- Ollama adapter
- Auto-update (release manifest + binary download)
- Windows SmartScreen signing
- Automated regression snapshot tests (existing project + fake LLM output → visual diff)
- Team sync (git-backed, opt-in)

## Delivery Cadence

- End of Phase 1: **v0.1 internal alpha** (personal use)
- End of Phase 2: **v0.2 beta** — binaries uploaded to GitHub Releases
- End of Phase 3: **v1.0** — GA with a simple landing page + screenshots

## Engineering Principles

1. **The harness is the product.** Harness quality is the ceiling on product quality. Invest heavily in tests, retries, and logging.
2. **One-way doors first.** Irreversible decisions (stack, event schema, DB schema) are locked in Phase 1.
3. **No premature multi-tenancy.** The local-single-user assumption only breaks when there is a concrete user demand.
4. **Ship the sample, not the framework.** Getting the GS sample DS right is a higher priority than a general extraction pipeline (Phase 3).
5. **Dogfood.** Each phase's artifact gets used to make the next phase's docs/tutorials.

## Definition of Done Standard

Every task is "done" only when **all** of the following are true:
1. Code merged to main
2. Unit tests passing (new behavior covered)
3. Integration test passing (if it touches harness, DB, or frontend-backend wire)
4. Logging added for any new error paths
5. README or relevant doc updated if the interface changed
6. Manual smoke test by the author, verified on Windows

## Build & Release Flow

### Local dev
```bash
bun install
bun run dev            # vite + hono watch mode
```

### Build binary
```bash
bun run build:frontend   # vite build → packages/frontend/dist
bun run build:backend    # bun build --compile --target=bun-windows-x64 --minify
# → dist/burnguard-design.exe
```

### Release (Phase 2+)
```bash
bun run release -- --version=0.2.0
# 1. Bumps package.json versions
# 2. Generates changelog from conventional commits
# 3. Builds Windows binary
# 4. Creates GitHub Release with binary attached
```

## Observability During Phase 1

The single most valuable piece of diagnostic data is the **per-session raw trace log**. Whenever something behaves unexpectedly:
1. Reproduce the issue
2. Grab `~/.burnguard/logs/session-{id}.log`
3. Diff against `tests/fixtures/` to see whether the parser misread the CLI output or the harness misbehaved

Fixture parity is the fastest path to debugging parser drift as Claude Code / Codex update their output formats.
