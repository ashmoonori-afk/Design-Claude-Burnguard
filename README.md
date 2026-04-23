<p align="right">
  <a href="README.ko.md"><img alt="한국어 README" src="https://img.shields.io/badge/한국어-README-004fff?style=for-the-badge" /></a>
</p>

# BurnGuard Design

BurnGuard Design is a local-first AI design workspace that wraps already-installed `claude` and `codex` CLIs into a chat + canvas workflow. It is built for generating, editing, reviewing, and exporting prototypes and slide decks without moving your project files into a hosted SaaS.

Current release: `0.3.1`

## Status

- Current stage: **Phase 3 mostly shipped; Phase 4 started**
- Shipped: Phase 1, Phase 2 A/B/C, Phase 3 A/B, most of Phase 3 C, and **P4.1 DS auto-extract**
- Still open: **P3.11 Linux build**, Phase 4 remaining slices (file upload extract, Figma sync, auto-update, signing)
- Validation status: `bun test` 67/67 green, `npm run typecheck` green (backend + frontend)

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
`tool.permission_required`.

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

### Design systems

Each DS ships 16 preview cards: Brand (logos / icons), Colors
(brand / neutrals / ramps / semantic / charts), Typography
(display / headings / body), Foundations (spacing, radii + shadows),
Components (buttons / cards / forms / badges + table). A validation
card on the detail view surfaces extraction caveats (missing tokens,
substituted fonts, logo count).

### Design system auto-extract (P4.1)

`POST /api/design-systems/extract` clones a shallow git repo or fetches
a live homepage + same-origin CSS, parses CSS custom properties, font
families, and logo-like assets, then scaffolds a canonical BurnGuard
system under `~/.burnguard/data/systems/<id>/` (README.md / SKILL.md /
`colors_and_type.css` / `fonts/` / `assets/logos/` / `preview/*.html` ×
16 / `ui_kits/website/` / `uploads/`). The new row lands as Draft so
you can review it before promoting to Published.

### Exports

Four formats:

- **`html_zip`** — self-contained offline snapshot of the project tree.
- **`pdf`** — Playwright-rendered deck with zero nav-bar artifacts and
  per-slide page breaks.
- **`pptx`** — per-slide editable text boxes (not flattened screenshots)
  via `pptxgenjs`; bold / italic / alignment / font-family preserved.
- **`handoff`** — developer bundle (`source/` tree + `spec.json` token
  index + `tokens/` CSS + README).

PDF and PPTX both need Chromium; install it from Settings with one
click (backed by `npx playwright install chromium`).

### Settings & backend switch

- Live Chromium install status (grey / amber-pulsing / green) with a
  reinstall button and a polled 12-line tail of the install log.
- Per-session backend toggle reappears on the chat pane and PATCHes
  `/api/sessions/:id/backend` so the next idle turn uses the new CLI.

## Remaining Work Compared To The Claude Design Goal

- Linux packaging and release path (P3.11)
- Uploaded-file DS extract (PDF / PPTX / Figma export) + Figma REST sync (P4.2 / P4.3)
- Full browser E2E automation
- True live tool-decision round-trip once upstream CLI streaming supports it fully
- Auto-update channel and Windows SmartScreen / macOS notarization signing (P4.4 / P4.5)

## Running Locally

Prerequisites:

- Bun
- Node.js
- At least one CLI available on `PATH`
  - `claude`
  - `codex`

Install and verify:

```powershell
bun install
cmd /c npm.cmd run typecheck
```

Run backend and frontend together:

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
