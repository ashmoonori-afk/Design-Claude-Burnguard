# BurnGuard Design

BurnGuard Design is a local-first AI design workspace that wraps already-installed `claude` and `codex` CLIs into a chat + canvas workflow. It is built for generating, editing, reviewing, and exporting prototypes and slide decks without moving your project files into a hosted SaaS.

Current release: `0.3.1`

## Status

- Current stage: **Phase 3 mostly shipped**
- Shipped: Phase 1, Phase 2 A/B/C, Phase 3 A/B, and most of Phase 3 C
- Still open: **P3.11 Linux build**
- Validation status: `bun test` green, `npm run typecheck` green

## What It Does

- Creates local projects for `prototype`, `slide_deck`, `from_template`, and `other`
- Detects local `claude` and `codex` CLIs and lets you switch backend per session
- Streams normalized chat/tool/file/status events into the app UI
- Renders the current artifact in a live iframe canvas
- Supports comments, inline edit mode, tweaks mode, draw mode, and present mode
- Supports interrupt, rollback, and export workflows
- Exports `html_zip`, `pdf`, `pptx`, and `handoff`

## Remaining Work Compared To The Claude Design Goal

- Linux packaging and release path
- Full browser E2E automation
- True live tool-decision round-trip once upstream CLI streaming supports it fully
- Auto-update, signing, and design-system ingestion from external design files

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
