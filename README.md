<p align="right">
  <a href="README.ko.md"><img alt="한국어 README" src="https://img.shields.io/badge/한국어-README-004fff?style=for-the-badge" /></a>
</p>

# BurnGuard Design

BurnGuard Design is a local-first AI design workspace that wraps already-installed `claude` and `codex` CLIs into a chat + canvas workflow. It is built for generating, editing, reviewing, and exporting prototypes and slide decks without moving your project files into a hosted SaaS.

Current release: `0.4.0`

## Why BurnGuard vs. Claude Design

Claude Design is a hosted AI design experience delivered through
claude.ai; BurnGuard is a local-first workspace that wraps the `claude`
and `codex` CLIs already installed on your machine. The two solve
overlapping problems, but the local harness gives BurnGuard a set of
concrete advantages for real design work:

- **Your files never leave the machine.** Projects, design systems,
  SQLite metadata, exports, and logs all live under `~/.burnguard/`.
  No upload of proprietary decks or brand assets into a hosted tenant.
- **No separate API key management.** BurnGuard reuses the CLI you
  already signed in to. No `keyfile`, no secrets UI, no "paste your
  API key" flow — see [Key File / API Key](#key-file--api-key).
- **Pluggable backend.** A per-session `cc | cx` toggle switches
  between Claude Code and Codex for the next idle turn. The same
  project works with either CLI.
- **Open, auditable prompt.** The prompt builder
  (`packages/backend/src/harness/prompt-builder.ts`) is deterministic
  and inspectable — you can see exactly what the CLI receives every
  turn, including the project type skill, design-system tokens, open
  comments, and attachment summaries.
- **Prompt cache budgeting.** A `compact` chat context mode
  pre-extracts a structural map of the entrypoint
  (`structure-extractor.ts` — slide / section count, ids, layouts,
  heading snippets, CSS variable list) and ships it as a ~600-token
  summary, then enforces token-budget rules in the compact skill so
  the agent reads `deck.html` / `index.html` at most once per turn.
  On a real 130 KB deck this cuts the per-turn cached-token count from
  ~580 K toward an order of magnitude lower.
- **Per-turn rollback.** Every user message keeps a full pre-turn file
  snapshot (`services/checkpoints.ts`); a hover Revert on any bubble
  restores the project tree exactly. No manual undo stacks.
- **First-class design systems.** Import a DS from a GitHub repo, a
  live homepage, a PPTX, or a PDF into a canonical folder (README,
  SKILL.md, `colors_and_type.css`, fonts, logos, 16 preview pages,
  website UI kit, uploads). Every turn then references those tokens;
  skills forbid introducing new palettes or font stacks.
- **Six canvas modes, not just a prompt box.** Select / Comment / Edit
  / Tweaks / Draw / Present are first-class interaction modes with
  iframe DOM messaging, typed CSS controls, SVG annotation, and
  fullscreen presenter. Comment pins feed the next turn's prompt
  under `## Open comments` so the CLI can address them directly.
- **Rich export formats.** HTML zip, Playwright-rendered PDF, editable
  PPTX (text boxes per slide, not flattened screenshots), and a
  handoff bundle with `source/` tree plus `spec.json` token index.
- **Attachment intelligence.** `.pptx` / `.pdf` attachments produce a
  compact manifest plus an `.extracted.md` text sidecar; the prompt
  explicitly steers the CLI toward the sidecar and away from
  `Read / Glob / Bash` against the original binary.
- **Deterministic project-type skills.** Slide decks ship with a
  12-entry layout archetype catalog and strict per-slide content
  rules; prototypes ship with 13 section archetypes and a
  framework-free single-file artifact contract.
- **Mid-turn interrupt.** If a turn runs past the configurable
  threshold (Settings → Interrupt button delay, default 5 min), a
  red Stop button surfaces in the composer and SIGKILLs the child
  CLI cleanly via `AbortController`.
- **Apache 2.0 open source.** Fork, audit, self-host, or extend; see
  [LICENSE](LICENSE).

## Status

- Current stage: **Phase 3 shipped in practice; Phase 4 actively underway**
- Shipped: Phase 1, Phase 2 A/B/C, Phase 3 A/B/C except Linux packaging,
  **P4.1 DS auto-extract**, and **P4.2 upload ingest** (PDF/PPTX design-system
  uploads + chat attachments with Python-backed compact manifests +
  text-safe extracted sidecars + design-system delete / edit flows +
  client-side file-size gates)
- Newest shipped (this cycle):
  - **P4.3 Figma sync** — config-stored Figma personal access token
    (Settings → Figma access), `figma.com` URLs as a first-class
    extraction source alongside github / website, published color +
    text styles flow into the canonical DS bundle as
    `--color-<slug>` tokens and a typography list. PAT is never
    echoed back through the API.
  - **Export audit** (7 fixes) — cross-platform zip via JSZip
    (PowerShell-only `Compress-Archive` removed); correct
    Content-Type per format; friendly download filenames
    (`<project>-<format>-<date>.<ext>`) with RFC 5987 Unicode
    support; async-failure toasts with a Chromium-install hint;
    one-click retry on failed jobs; 7-day GC of stale export
    artifacts on bootstrap; PDF paper presets (A4 / Letter / 16:9)
    and PPTX slide-size presets (16:9 / 4:3).
  - **P4.7 Sample library hardening** — fictional Northvale Capital
    + Splash sample brands replace the prior real-trademark
    placeholders, all 12 GS logo files removed, the
    `design system sample/uploads/` bucket is gitignored + skipped
    by the seed copy, Examples tab now shows the real working
    tutorials and prompt-samples (was hidden behind a
    `from_template`-only filter), one-click "Restore samples" and
    "Try this prompt" affordances, the five fixture projects ship
    real starter HTML so opening any Home card lands on a non-empty
    canvas, and two new prompt-samples cover Korean SaaS + a non-
    landing fund-ops dashboard.
  - **Design-engine audit** (11 fixes + 2 bonus iframe attrs) —
    push-based active-slide updates from the deck-stage runtime
    (drops the 5-Hz polling loop), bridge timeout 200 ms → 1 s for
    busy iframes, inline error overlay with Retry when artifact
    fetch fails (was silent), atomic file writes via tempfile +
    rename so a process crash mid-write can no longer leave half a
    file on disk, robust inline-style parser that survives
    `url(data:…)`, `linear-gradient(…)`, `var(--x, fallback)` and
    quoted strings, single-step file-level undo on Edit / Tweaks
    GUI patches with a new Undo button on the canvas top bar, XSS
    test pinning the `escapeHtmlText` contract, and a shared
    `useFrameElementRect` hook collapsing three near-identical
    overlay polling loops. Bonus: canvas iframe now allows popups
    and fullscreen so deck F-key + external `<a target="_blank">`
    actually work. Plus: tight selection box around visible text
    via Range bounds (block leaves no longer paint a parent-width
    box around a short headline).
  - **Cross-cutting verification loop** (13 fixes + 23 new tests
    across Mac, SSE, adapters, FS watcher, DB, comments) —
    widened the Mac launcher's bun probe (Homebrew + npm-prefix
    paths) and chmod-600s `~/.burnguard/config.json` after each
    save; SSE broker isolates per-listener throws so one failing
    subscriber can't starve the rest, heartbeat lifecycle no
    longer leaks unhandled rejections after a disconnect,
    `EventSource` parse / connection failures route through a
    typed `onError` instead of silently breaking; CLI adapters
    trap parser exceptions inside the readLines callback and
    release the decision sink in `finally` so a malformed line or
    mid-turn throw can't wedge the subprocess; FS watcher closes
    on project delete (was leaking one watcher per delete plus
    pending debounce timers) and writes its error trail to the
    correct sessionId-keyed log; `createProjectRecord` now
    inserts project + session inside a single SQLite transaction;
    comment-pin coordinates clamped to 0..100 on create.
- Recent polish: **compact chat context mode**
  (Settings → Chat context: `compact` / `full`) plus a pre-extracted
  deck/prototype structure summary and token-budget rules in the
  compact skill so multi-edit turns stop ballooning to ~580 K cached
  tokens; sticky-to-bottom chat with a "New messages" jump pill;
  one-click double-click launchers (`Start-BurnGuard.bat` /
  `Start-BurnGuard.command`) backed by a sequenced
  `scripts/dev-launcher.ts` that health-gates the backend on 14070
  before starting Vite, opens the browser when frontend is ready, and
  tears both children down on SIGINT / window close.
- Earlier polish: configurable mid-turn Interrupt button (Settings → Interrupt
  button delay), rotating waiting-state placeholder in the composer,
  upgraded project-type skills for slide decks and prototypes (layout /
  section archetype catalogs + strict per-slide content rules)
- Still open: **P3.11 Linux build**, full browser E2E automation,
  **P4.5 signing / notarization**, **P4.6 install packages**, and
  **P5.1 Windows / macOS managed auto-update**
- Validation status: `bun test` 215/215 green, `npm run typecheck` green
  (backend + frontend)

## Feature Tour

### Home & workspace

Four tabs: **Recent** (recently opened), **Mine** (projects you created),
**Examples** (seeded tutorials), **Systems** (design systems, including the
auto-extract import form). Project cards show the thumbnail, backend
indicator, last-activity timestamp, and a delete affordance.

### Create-project sidebar

Type switcher for `Prototype` / `Slide deck` / `From template` / `Other`. The
design-system dropdown lists every DS (Draft / Review / Published, sorted
by most recent activity) so a just-imported system shows up immediately with
its status suffix.

### Chat pane

Normalized event stream: user messages, chat deltas, tool starts / ends,
file changes, usage deltas, session status. A compact `cc | cx` toggle
on the tab header switches between Claude Code and Codex for the next
idle turn. Each user bubble gets a hover-visible **Revert** button that
restores the pre-turn snapshot (`services/checkpoints.ts`). A permission
modal appears mid-turn whenever an adapter emits
`tool.permission_required`. While the CLI is warming up the composer
placeholder cycles through friendly Korean waiting-state lines; if a turn
keeps running past the configurable threshold (default 5 minutes,
Settings → Interrupt button delay) the Send button swaps to a red **Stop**
that aborts the active turn via `/api/sessions/:id/interrupt`, killing
the child CLI process cleanly. The stream is sticky to the bottom while
new chunks arrive, releases the moment you scroll up so reading older
content is never interrupted, and exposes a "New messages" jump pill so
you can re-attach explicitly.

### Canvas & interaction modes

Live iframe of the current project artifact. Five one-at-a-time modes:

- **Select** — hover highlights any element; click reveals the computed
  `font-family / font-size / color / padding / ...` in the right panel.
- **Comment** — click drops a pin anchored to slide index + normalized
  percentage. Unresolved pins append to the next CLI prompt under
  `## Open comments`.
- **Edit** — hover-selects `[data-bg-node-id]` elements; edit text and
  attributes in the inspector; Save PATCHes the HTML on disk and the
  iframe auto-reloads.
- **Tweaks** — structured CSS controls (shipped in P3.12). Numeric `px`
  inputs for `font-size / line-height / letter-spacing`, a popover color
  picker backed by the brand palette (+ hex fallback) for
  `color / background-color`, 4-side compact inputs for
  `padding / margin / border-radius` that recompose the shortest CSS
  shorthand on commit, and a dropdown for `font-weight`.
- **Draw** — SVG overlay with pen / rect / arrow tools and 5-color
  swatches. Persists to `.meta/draws/<file>.svg`; Cmd/Ctrl+Z for
  undo / redo.

A **Present** button (visible when the active tab is a slide deck) flips
into fullscreen playback with arrow-key / space navigation and speaker
notes (`?present=1` → `body[data-presenter]`).

The canvas top bar carries a **Refresh** + a **single-step Undo** for
the active file. Undo lights up after any GUI patch (Edit / Tweaks
save) and rolls the file back via the new in-memory undo store —
recovery between turns without touching the per-turn checkpoint
system. If the artifact fails to load, the canvas surfaces an inline
error overlay with a Retry button instead of silently rendering the
placeholder. Active-slide updates from the deck-stage runtime arrive
via push (`postMessage`), not polling, so the slide indicator and
panel switch frame-accurately even on long sessions. The iframe
sandbox grants `allow-popups`, `allow-popups-to-escape-sandbox`, and
`allow="fullscreen"` so external links inside an artifact open in a
new tab and the deck `F` key actually toggles fullscreen.

### Design systems

Each DS ships 16 preview cards: Brand (logos / icons), Colors
(brand / neutrals / ramps / semantic / charts), Typography
(display / headings / body), Foundations (spacing, radii + shadows),
Components (buttons / cards / forms / badges + table). A validation
card on the detail view surfaces extraction caveats (missing tokens,
substituted fonts, logo count).

### Design system ingest

`POST /api/design-systems/extract` accepts three source types and
produces the same canonical bundle for all of them:

- **`source_type: github`** — shallow `git clone --depth=1` of any
  public design-system repo, parses CSS custom properties + font
  families + logo-like asset filenames out of the tree.
- **`source_type: website`** — fetches the homepage + same-origin
  CSS within a download budget, runs the same extractor.
- **`source_type: figma`** *(P4.3, shipped)* — pulls published
  color + text styles via the Figma REST API. Requires a personal
  access token configured at Settings → Figma access; the value
  lives only in `~/.burnguard/config.json` and is never echoed
  back through the public settings API. Effect / grid styles are
  out of MVP scope.

Each path scaffolds the same canonical layout under
`~/.burnguard/data/systems/<id>/` (README.md / SKILL.md /
`colors_and_type.css` / `fonts/` / `assets/logos/` /
`preview/*.html` × 16 / `ui_kits/website/` / `uploads/`). The new
row lands as Draft so you can review it before promoting to
Published.

`POST /api/design-systems/upload` now accepts `.pptx` and `.pdf`
sources. Those uploads go through a Python-backed compact manifest
extractor so BurnGuard keeps the review payload token-light while still
capturing brand colors, fonts, headings, body samples, and per-page /
per-slide summaries. The same summary path is also used for chat
attachments, so a PPT or PDF reference can feed prototype or slide-deck
generation without dumping the whole document into the prompt. Each
attachment also emits an `.extracted.md` sidecar alongside the compact
manifest so the CLI can `Read` safe text excerpts instead of the raw
binary — the prompt explicitly steers the agent toward the sidecar and
away from `Read / Glob / Bash` against the original `.pptx` / `.pdf`.
Uploaded files are size-gated in the UI before round-trip, and every
design system supports rename + delete flows with template / project-
reference guards.

### Project-type skills in the prompt

Every CLI turn is prefixed with a project-type authoring skill so the
agent produces artifacts that the canvas runtime, edit/comment modes,
and exporters can all consume. Both skills describe STRUCTURE only —
colour and typography always flow from the linked design system's
`colors_and_type.css` tokens.

- **Slide deck skill** — `<section data-slide data-layout="...">`
  contract, a 12-entry layout archetype catalog (`cover`, `agenda`,
  `two-column-problem-solution`, `photo-list-split`, `big-number`,
  `vertical-timeline`, `three-step-columns`, `arrow-steps`,
  `quote-callout`, `logo-grid`, `chart`, `closing`), strict per-slide
  content rules (title ≤ 8 words, 2–4 bullets ≤ 12 words each, one
  takeaway per slide), and a default 15-slide pitch narrative.
- **Prototype skill** — single-file `index.html` contract (no
  framework, no bundler), a 13-entry section archetype catalog
  (`hero-centered`, `hero-split`, `hero-video`, `feature-grid-3`,
  `feature-alternating`, `logo-strip`, `quote-hero`,
  `testimonial-grid`, `pricing-tiered`, `stats-row`, `faq-accordion`,
  `cta-banner`, `footer-minimal`), per-section content rules, and
  interaction conventions (CSS transitions + a single
  `IntersectionObserver` for scroll reveals).

### Exports

Four formats, each with size / layout presets:

- **`html_zip`** — self-contained offline snapshot of the project
  tree. Cross-platform via JSZip (no PowerShell / shell tools).
- **`pdf`** — Playwright-rendered deck with zero nav-bar artifacts
  and per-slide page breaks. Paper presets: A4 landscape, Letter
  landscape, 16:9 widescreen.
- **`pptx`** — per-slide editable text boxes (not flattened
  screenshots) via `pptxgenjs`; bold / italic / alignment /
  font-family preserved. Slide-size presets: 16:9 widescreen, 4:3
  classic.
- **`handoff`** — developer bundle (`source/` tree + `spec.json`
  token index + `tokens/` CSS + README). Same JSZip pipeline as
  html_zip.

Downloads carry the correct per-format MIME (PDF / PPTX no longer
mis-served as `application/zip`) and a friendly filename
(`<project>-<format>-<date>.<ext>`) with full Unicode preserved via
RFC 5987. Failed jobs show a Retry button on the row; if the failure
mentions Chromium the toast points the user straight to Settings →
"Chromium for exports". Succeeded export artifacts older than 7 days
are garbage-collected on next bootstrap so the cache directory does
not grow without bound.

PDF and PPTX both need Chromium; install it from Settings with one
click (backed by `npx playwright install chromium`).

### Settings & backend switch

- Live Chromium install status (grey / amber-pulsing / green) with a
  reinstall button and a polled 12-line tail of the install log.
- Live Python / pypdf status with a one-click `pip install --user pypdf`
  button, shared tail format with Chromium.
- **Interrupt button delay** input (0–3600 s, default 300 s) that controls
  when the composer's mid-turn Stop button surfaces.
- **Chat context** toggle (`compact` / `full`, default `compact`) — picks
  whether per-turn prompts inline the design-system SKILL.md, tokens, and
  README excerpts (`full`) or reference them by path while shipping a
  compact deck/prototype structure summary plus token-budget rules
  (`compact`). Compact mode keeps long slide-deck sessions an order of
  magnitude lighter on cached tokens; flip to `full` for one-off
  brand-precision turns.
- **Figma access** — paste a Figma personal access token (input is
  password-masked; value is never echoed back through the API) to
  enable the `figma` source type in Systems → Import. Disconnect at
  any time. Token lives only in `~/.burnguard/config.json`.
- Per-session backend toggle reappears on the chat pane and PATCHes
  `/api/sessions/:id/backend` so the next idle turn uses the new CLI.

## Remaining Work Compared To The Claude Design Goal

- Linux packaging and release path (P3.11)
- Full browser E2E automation
- True live tool-decision round-trip once upstream CLI streaming supports it fully
- Easy install / launch packages for Windows and macOS: Windows installer (`Setup.exe` / `.msi`) and macOS package (`.dmg` / later optional `.pkg`) with first-run bootstrap (P4.6)
- Windows/macOS managed auto-update channel (Phase 5 P5.1)
- Windows SmartScreen / macOS notarization signing (P4.5)

## Running Locally

Prerequisites:

- Bun
- Node.js
- At least one CLI available on `PATH`
  - `claude`
  - `codex`
- Python 3.10+ on `PATH` (optional — only needed for PDF / PPTX
  design-system uploads). See
  [`packages/backend/requirements.txt`](packages/backend/requirements.txt)
  for the Python dependency list, or install it from Settings →
  "Python for uploads" → Install pypdf.

Install and verify:

```powershell
bun install
cmd /c npm.cmd run typecheck
```

One-click launch (no terminal needed):

- **Windows:** double-click `Start-BurnGuard.bat` at the repo root.
- **macOS:** double-click `Start-BurnGuard.command` at the repo root.

Both launchers run `bun install` on first run if `node_modules` is
missing, then call `scripts/dev-launcher.ts`, which probes port 14070
first, boots the backend, waits until `/api/projects` actually answers,
then starts Vite, then opens `http://127.0.0.1:5173/`. Closing the
launcher window tears both children down. Set `BG_LAUNCHER_NO_OPEN=1`
to skip the auto-open.

Run backend and frontend together (terminal):

```powershell
bun run dev
```

Run separately:

```powershell
bun run dev:backend
bun run dev:frontend
```

Build:

```powershell
bun run build
```

macOS bundle:

```powershell
bun run build:mac
bun run build:mac:dmg
```

## Export Notes

- `html_zip`: self-contained project snapshot
- `pdf`: deck-focused Playwright export
- `pptx`: editable text-box deck export
- `handoff`: developer bundle with project files plus `spec.json`

If Chromium is missing for Playwright-based exports, install it from Settings or run:

```powershell
npx playwright install chromium
```

## Config And Data Paths

BurnGuard stores user data under:

```text
~/.burnguard
```

Typical Windows path:

```text
C:\Users\<username>\.burnguard
```

Important files:

```text
~/.burnguard/
  config.json
  data/
    burnguard.sqlite
    projects/
    systems/
  cache/
  exports/
  logs/
```

## Key File / API Key

BurnGuard does **not** use its own `keyfile`, `secrets.json`, or built-in API key form.

It reuses the authentication state of the local CLI you already installed:

- If `claude` is installed and signed in, BurnGuard uses that CLI
- If `codex` is installed and ready, BurnGuard uses that CLI

That means:

- BurnGuard does not directly store provider API keys
- CLI auth is managed by the CLI itself, not by BurnGuard

## Recommended First Run

1. Start the app
2. Open one of the seeded tutorial projects
3. Try a prompt on a `slide_deck` project
4. Review the result in canvas
5. Add a comment or use Edit/Tweaks mode
6. Export as `html_zip`, `pdf`, or `pptx`

## Docs

See [doc/README.md](doc/README.md) for the fuller documentation set.

## License

BurnGuard Design is released under the
[Apache License 2.0](LICENSE). You may use, modify, and distribute
the software commercially or privately, provided that you preserve
copyright notices, state any changes you make, and include a copy of
the licence in your distribution. The project is provided "as is"
without warranty — see the licence text for the full terms.
