# BurnGuard Design - Overview

> A self-hosted reimplementation of Claude Design as a single-user local Windows app. The prompt, canvas, persistence, and export loop run on the user's machine.

## 1. Product Definition

### 1.1 What it is

BurnGuard Design is a prompt-driven design tool that wraps a locally installed `claude` (Claude Code) or `codex` CLI as its LLM backend. It ships as a Bun-powered local app and stores project, session, event, and export data on local disk.

### 1.2 Value proposition

- No API key plumbing inside BurnGuard itself; it reuses already-installed CLIs
- Local-first workflow with persistent project/session history
- Design system packaging that is compatible with Claude Code skill-style assets
- Fast prototype iteration through chat, canvas refresh, and export

### 1.3 Target user

- Individual designers, design engineers, and full-stack engineers
- Users who already run Claude Code or Codex locally
- People who prefer desktop-local prototyping over cloud-hosted collaboration tools

## 2. Current Snapshot

As of April 22, 2026, the repository is in **late Phase 1 / internal alpha**.

Implemented now:
- prototype and slide deck project creation
- local SQLite persistence for projects, sessions, events, files, and exports
- Home, Project, Design System, and Settings views against real APIs
- turn orchestration with prompt building, attachment persistence, event replay, and SSE streaming
- real Claude Code execution with `stream-json` parsing
- best-effort Codex execution with raw streamed output
- per-project file indexing, refresh, slide deck runtime serving, and HTML zip export

Known gaps:
- selector remains a placeholder overlay and is not yet backed by parent/iframe DOM messaging
- interrupt is exposed as an API route but does not terminate a live subprocess
- Codex does not emit structured tool or file events
- PDF, PPTX, and handoff exports are not implemented
- comments, edit mode, tweaks, and draw remain placeholder panels
- automated test coverage is still missing

## 3. Core Loop

The current end-to-end loop that works in the repo is:

1. Detect installed backend CLIs
2. Create a project (`prototype` or `slide_deck`)
3. Choose the seeded sample design system
4. Send a prompt, optionally with attachments
5. Stream normalized events into the chat timeline
6. Render the current artifact in the canvas
7. Refresh or auto-refresh when files change
8. Export the project as `html_zip`

## 4. Scope Boundaries

### In scope today

- single-user local desktop workflow
- prompt-driven artifact generation
- chat, canvas, file list, and design system browsing
- local persistence and replay
- HTML zip export

### Planned but not complete yet

- real DOM-backed selector inspection
- stronger Codex normalization
- full interruption semantics
- PDF and PPTX export
- comments, edit mode, tweaks, and draw mode

### Out of scope

- multi-user collaboration
- hosted/cloud deployment
- organization and RBAC features
- mobile support
- real-time Figma sync

## 5. Roadmap Summary

| Phase | Theme | Status on April 22, 2026 |
|---|---|---|
| 1 | Prove the harness | In late implementation / internal alpha |
| 2 | Decks, modes, and richer exports | Partially scaffolded, not delivered |
| 3 | Power-user features | Not started beyond placeholder UI and schema prep |
| 4+ | Backlog | Future |

Notable deviation from the original plan:
- `slide_deck` scaffolding and runtime landed before full Phase 1 sign-off
- several Phase 2/3 surfaces exist in schema or UI placeholders even though the behavior is not shipped

## 6. Reference Index

### External references

| Source | URL |
|---|---|
| Claude Design launch | https://www.anthropic.com/news/claude-design-anthropic-labs |
| Claude Design getting started | https://support.claude.com/en/articles/14604416 |
| Claude Design design system setup | https://support.claude.com/en/articles/14604397 |

### Local references

- `ref/` contains screenshots of the real Claude Design UI
- `design system sample/` contains the canonical Northvale Capital sample design system
- `devplan/` contains implementation plans and handoff notes

## 7. Glossary

| Term | Definition |
|---|---|
| Harness | The backend turn orchestration layer that runs CLIs and normalizes their output |
| Adapter | A backend-specific runner/parser pair for one CLI |
| Session | A persisted conversation context bound to one project |
| Artifact | The file currently rendered in the canvas |
| NormalizedEvent | The shared event type used by storage, SSE, and the frontend |
| Design System | A packaged bundle of branding guidance and assets |
| Refresh | Re-index and reload the current artifact without sending a new turn |

## 8. Versioning

The intended release track is still:

| Version | Milestone |
|---|---|
| v0.1.x | Phase 1 complete / internal alpha |
| v0.2.x | Phase 2 complete / beta |
| v1.0.0 | Phase 3 complete / general availability |

The current repository has not reached Phase 1 sign-off yet.
