# Design Claude - Burnguard system

> Working title: **BurnGuard Design**

A self-hosted alternative to Anthropic's [Claude Design](https://claude.ai/design), packaged as a single Windows executable. Describe what you want, Claude Code or Codex builds it on your machine, you export it to HTML / PDF / PPTX or hand it off to Claude Code.

> Status: **pre-alpha — Phase 1 in active development.** Specification is complete; implementation has not started. See [doc/06-milestones.md](./doc/06-milestones.md).

---

## What it is

BurnGuard Design wraps a locally-installed LLM CLI (Claude Code or Codex) and gives it a chat-and-canvas interface for prompt-driven design work. Everything — projects, design systems, generated files, exports — lives in `~/.burnguard/` on your machine. There are no API keys to configure; whichever CLI you already use for coding is the backend.

It reproduces the critical slice of Claude Design:

- Prompt-driven **Prototype** and **Slide deck** generation
- Chat with file attachments (images, docs, Figma URLs)
- Live canvas with refresh
- **Tweaks** panel for direct CSS inspection and editing *(Phase 3)*
- Design-system-aware generation (tokens, fonts, logos, rules)
- Exports: HTML zip, PDF, PPTX, and a **Claude Code handoff** bundle
- Two-way **Claude Code skill compatibility** — design systems are `SKILL.md`-formatted

It is explicitly **not**: a multi-user SaaS, a Figma replacement, a vector editor, a hosted service.

---

## Requirements

- **Windows 10/11** (x64) — macOS and Linux arrive in Phase 3
- At least one installed LLM CLI:
  - **[Claude Code](https://claude.com/code)** — recommended
  - **[Codex CLI](https://github.com/openai/codex)** — best-effort support
- ~200 MB free disk for the binary + working data (additional ~130 MB on first PDF/PPTX export when Playwright downloads Chromium)

---

## Quick start (ships with v0.1)

```powershell
# Download the binary from GitHub Releases (once v0.1 ships)
curl -LO https://github.com/<owner>/BurnGuard/releases/latest/download/burnguard-design.exe

# Run it
./burnguard-design.exe
```

The binary opens in your default browser at `http://127.0.0.1:<port>`. A sample design system (Goldman Sachs) is preinstalled so you can create a project immediately.

---

## Repository layout

```
BurnGuard/
├── doc/                     # Authoritative specification — start here
│   └── README.md            # Documentation index + reading order
├── ref/                     # Screenshots of the real Claude Design UI for reference
├── design system sample/    # The Goldman Sachs sample DS (embedded into the binary)
├── packages/                # Source — scaffold coming in Phase 1
│   ├── shared/              # TypeScript types shared by frontend + backend
│   ├── backend/             # Bun + Hono + LLM harness
│   └── frontend/            # Vite + React SPA
└── README.md                # This file
```

---

## Documentation

Every design decision and interface contract is captured under [`doc/`](./doc/README.md). Key entry points:

| Reading | File |
|---|---|
| Product scope & phases | [doc/00-overview.md](./doc/00-overview.md) |
| Architecture & tech stack | [doc/01-architecture.md](./doc/01-architecture.md) |
| Data model | [doc/02-data-model.md](./doc/02-data-model.md) |
| **LLM harness (core)** | [doc/03-backend-adapters.md](./doc/03-backend-adapters.md) |
| UI specification | [doc/04-ui-spec.md](./doc/04-ui-spec.md) |
| Design system format | [doc/05-design-system-format.md](./doc/05-design-system-format.md) |
| Milestones & DoDs | [doc/06-milestones.md](./doc/06-milestones.md) |
| Architecture Decision Records | [doc/07-decisions.md](./doc/07-decisions.md) |
| Contributing | [doc/CONTRIBUTING.md](./doc/CONTRIBUTING.md) |

---

## Tech stack at a glance

- **Runtime**: Bun 1.1+ (produces a single Windows `.exe` via `bun build --compile`)
- **Server**: Hono + native SSE
- **DB**: `bun:sqlite` + drizzle-orm
- **Harness**: TypeScript + `node-pty`, normalizing Claude Code (`stream-json`) and Codex output into a shared event schema
- **Frontend**: React 18 + Vite + Tailwind + Shadcn/ui (copy-paste components, not a dependency)
- **Exports**: `jszip`, Playwright (PDF), `pptxgenjs` (PPTX), `sharp` (images), `fontkit` (font metadata)

Full rationale in [ADR-002](./doc/07-decisions.md) and [doc/01-architecture.md §3](./doc/01-architecture.md).

---

## Contributing

Development conventions, commit style, testing rules, performance and security budgets: [doc/CONTRIBUTING.md](./doc/CONTRIBUTING.md).

The harness is the product. Before changing anything in `packages/backend/src/harness/` or `packages/backend/src/adapters/`, read [doc/03-backend-adapters.md](./doc/03-backend-adapters.md) in full.

---

## Acknowledgements

- Anthropic's **Claude Design** is the product this project re-implements locally. All design credit is theirs; we only rebuild the thin shell around a local CLI.
- The Goldman Sachs sample design system is derived from [`balajisr/gs-design-system-scss`](https://github.com/balajisr/gs-design-system-scss) and the public Goldman Sachs logo set. This repository is not affiliated with Goldman Sachs Group, Inc.
- Bundled fonts (Pretendard, KoPub, Zen Serif) ship under their respective open licenses.

---

## License

TBD. Pending choice between MIT and Apache-2.0. All contributions made prior to license selection are licensed under the license eventually chosen (by contributing you agree to this).
