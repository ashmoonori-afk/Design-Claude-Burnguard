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

## What It Does

- Creates local projects for `prototype`, `slide_deck`, `from_template`, and `other`
- Detects local `claude` and `codex` CLIs and lets you switch backend per session
- Streams normalized chat/tool/file/status events into the app UI
- Renders the current artifact in a live iframe canvas
- Supports comments, inline edit mode, tweaks mode, draw mode, and present mode
- Tweaks inspector has typed controls — numeric `px` inputs for sizes, a brand-palette color picker, and 4-side padding / margin / border-radius shorthand composer
- Supports interrupt, rollback, and export workflows
- Exports `html_zip`, `pdf`, `pptx`, and `handoff`
- **Auto-extracts a draft design system from any github repo URL or live website URL** — clone / fetch → parse tokens + fonts + logos → scaffold the canonical BurnGuard folder under `~/.burnguard/data/systems/<id>/` with 16 preview cards

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
