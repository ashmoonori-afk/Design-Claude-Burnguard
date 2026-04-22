# Documentation Index

This folder contains the authoritative specification for BurnGuard Design. Read in order on first pass; jump by topic afterward.

## Read in order

1. **[00-overview.md](./00-overview.md)** — What the product is, why, scope boundaries, phase summary, glossary
2. **[01-architecture.md](./01-architecture.md)** — Process topology, tech stack, source tree, SSE sequences, security model
3. **[02-data-model.md](./02-data-model.md)** — Filesystem layout, SQLite schema (DDL), ERD, migrations, retention
4. **[03-backend-adapters.md](./03-backend-adapters.md)** — LLM harness interfaces, NormalizedEvent schema, 14 responsibilities, Claude Code + Codex adapters
5. **[04-ui-spec.md](./04-ui-spec.md)** — Screen-by-screen UI specification, component props, keyboard shortcuts, a11y
6. **[05-design-system-format.md](./05-design-system-format.md)** — Design system directory format, extraction pipeline, publish workflow, Claude Code interop
7. **[06-milestones.md](./06-milestones.md)** — Phase 1–3 tasks, DoDs, test strategy, risks, delivery cadence

## Jump by topic

| Topic | Where |
|---|---|
| Product scope & non-goals | [00-overview.md §4](./00-overview.md) |
| Tech stack decisions | [01-architecture.md §3](./01-architecture.md) |
| SSE sequence diagrams | [01-architecture.md §5](./01-architecture.md) |
| SQLite DDL | [02-data-model.md §2](./02-data-model.md) |
| Normalized event types | [03-backend-adapters.md §3](./03-backend-adapters.md) |
| 14 harness responsibilities | [03-backend-adapters.md §4](./03-backend-adapters.md) |
| Claude Code `stream-json` mapping | [03-backend-adapters.md §5.3](./03-backend-adapters.md) |
| Tweaks panel layout | [04-ui-spec.md §1 S-2](./04-ui-spec.md) |
| DS directory layout | [05-design-system-format.md §2](./05-design-system-format.md) |
| Phase 1 DoD | [06-milestones.md](./06-milestones.md) |
| Key architectural decisions (ADRs) | [07-decisions.md](./07-decisions.md) |
| Dev setup & conventions | [CONTRIBUTING.md](./CONTRIBUTING.md) |

## Document conventions

- All docs are written in English
- Code blocks use fenced triple-backtick with language hint
- Diagrams are ASCII (no external renderer dependency)
- Identifiers (variables, tables, fields) use `backticks`
- Document versions are implicit — `git log` is the authoritative history
- Cross-references use relative links: `[link](./01-architecture.md#anchor)`

## Out-of-band references

Stored at repo root, outside `doc/`:

| Folder | Purpose |
|---|---|
| `ref/` | Six real-Claude-Design UI screenshots (2026-04-22) |
| `design system sample/` | Full Goldman Sachs design system as the canonical DS format example |

## Open work

See [06-milestones.md](./06-milestones.md) for the active phase plan and [07-decisions.md](./07-decisions.md) for the decisions log.
