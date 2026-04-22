# BurnGuard Design — Overview

> A self-hosted reimplementation of Anthropic's Claude Design as a **single-user local binary**. The full prompt → canvas → export pipeline runs on your own machine.

## 1. Product Definition

### 1.1 What it is

BurnGuard Design is a **prompt-driven design tool** that wraps a locally-installed `claude` (Claude Code) or `codex` CLI as its LLM backend. It ships as a single Bun executable (`.exe`); all data (projects, design systems, exports) lives on local disk.

### 1.2 Value proposition

- **No API keys required** — reuses already-authenticated CLIs
- **Fully local** — the only outbound traffic is whatever the LLM CLI itself makes (an Ollama adapter in Phase 4+ enables full air-gap)
- **Two-way Claude Code compatibility** — design systems use `SKILL.md` + `colors_and_type.css` format, so they install into Claude Code as skills verbatim
- **Handoff-first** — export produces a bundle ready to hand to Claude Code

### 1.3 Target user

- Individual designers / full-stack engineers / design engineers
- Users who already run Claude Code or Codex CLI
- People who prefer fast local prototyping over team-shared cloud tools

## 2. Core Loop

```
┌─ Home ────┐   ┌─ Project ──────────────────────────┐   ┌─ Export ─────┐
│ Recent    │   │ ┌─Chat──┐ ┌─Canvas───┐ ┌─Mode────┐ │   │ html zip     │
│ Your...   │ → │ │stream │ │iframe    │ │ Tweaks  │ │ → │ pdf (P2)     │
│ Examples  │   │ │attach │ │render    │ │ Comment │ │   │ pptx (P2)    │
│ Systems   │   │ │       │ │refresh   │ │ Edit    │ │   │ handoff (P3) │
└───────────┘   │ └───────┘ └──────────┘ └─────────┘ │   └──────────────┘
                └────────────────────────────────────┘
```

## 3. Phase Summary

| Phase | Theme | Duration | Core deliverables |
|---|---|---|---|
| **1** | Prove the harness | 4–5 weeks | Harness + Claude Code/Codex adapters + Prototype type + sample DS + read-only selector + HTML zip export + Windows exe |
| **2** | Decks & Modes & Exports | 3–4 weeks | Slide deck type + Comment/Edit modes + PDF + PPTX + Permission gate UI |
| **3** | Power user | 4–5 weeks | **Full Tweaks panel** + Draw/Present + DS extraction (GitHub/Figma) + Handoff bundle + macOS/Linux builds |
| 4+ | Backlog | — | Ollama adapter, code signing, auto-update, team sync |

## 4. Scope boundaries

### In scope (by Phase 3)
- Four project types: Prototype / Slide deck / From template / Other
- Split canvas (chat left · artifact center · mode panel right)
- Design system management in sample format · Claude Code skill-compatible
- Exports: HTML zip · PDF · PPTX · Claude Code handoff
- Streaming chat (tool badges, thinking, file refs)
- SQLite-backed persistence for projects / sessions / events
- File attachments (images, docs, Figma URL as input)

### Out of scope
- Multi-user / organizations / RBAC
- Cloud deploy / hosting
- Two-way Figma real-time editing (URL **input** only)
- Canva export
- Template marketplace
- Real-time collaboration
- Mobile devices (desktop only)

### Anti-goals
- Not a pixel-perfect replica of Claude Design — the goal is feature parity
- Not a Figma replacement — prompt-driven generation is the core; no manual vector editing

## 5. Reference Index

### Anthropic official
| Source | URL |
|---|---|
| Claude Design launch | https://www.anthropic.com/news/claude-design-anthropic-labs |
| Get started | https://support.claude.com/en/articles/14604416 |
| Set up design system | https://support.claude.com/en/articles/14604397 |
| Admin guide | https://support.claude.com/en/articles/14604406 |
| Pricing | https://support.claude.com/en/articles/14667344 |
| Managed Agents overview | https://platform.claude.com/docs/en/managed-agents/overview |
| Events and streaming | https://platform.claude.com/docs/en/managed-agents/events-and-streaming |
| Agent setup | https://platform.claude.com/docs/en/managed-agents/agent-setup |
| Tools | https://platform.claude.com/docs/en/managed-agents/tools |
| Environments | https://platform.claude.com/docs/en/managed-agents/environments |

### Local references
- `ref/스크린샷 2026-04-22 *.png` — six captures of the real Claude Design UI
- `design system sample/` — the full Goldman Sachs sample design system tree

## 6. Glossary

| Term | Definition |
|---|---|
| **Harness** | The TypeScript module that manages CLI subprocesses and normalizes their output. The heart of the product. |
| **Backend / Adapter** | An LLM CLI wrapper that implements the `LLMBackend` interface (Claude Code, Codex, …). |
| **Session** | A 1:1 LLM conversation context bound to one project. Maps to a single PTY-managed CLI process. |
| **Artifact** | A single HTML/JSX file rendered by the canvas. |
| **NormalizedEvent** | The unified event type every adapter's output converges to. The common unit for UI, storage, and SSE fanout. |
| **Tweak** | A user-authored CSS property override recorded against a node (Phase 3). |
| **Design System (DS)** | A bundle of `README.md + SKILL.md + colors_and_type.css + fonts/ + assets/` that defines a brand. |
| **ContextPatch** | Context the harness injects before each turn: tweak diff / file tree / DS link. |
| **Refresh** | Rerenders the canvas iframe against the current file tree without sending a new chat turn. Phase 1 essential. |

## 7. Versioning

`MAJOR.MINOR.PATCH` semver.

| Version | Phase | Trigger |
|---|---|---|
| v0.1.x | Phase 1 complete | Internal alpha (personal use) |
| v0.2.x | Phase 2 complete | Public beta (GitHub Releases) |
| v1.0.0 | Phase 3 complete | GA + landing page |

DB schema changes → MINOR bump. Event schema breaking changes → MAJOR bump.
