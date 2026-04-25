# Documentation Index

This folder contains the authoritative product and engineering documentation for BurnGuard Design.

## Current Repo Stage

As of April 22, 2026, the codebase is in **late Phase 1 / internal alpha**:
- the end-to-end prompt -> render -> refresh -> HTML zip loop works
- Claude Code is wired through a real runner/parser path
- Codex is wired through a raw streamed path
- slide deck scaffolding has landed earlier than the original Phase 2 plan
- several Phase 2 and Phase 3 UI surfaces still exist only as placeholders

If you only read one planning document, start with [06-milestones.md](./06-milestones.md).

## Read In Order

1. [00-overview.md](./00-overview.md)
   Product definition, scope, current implementation snapshot, and roadmap
2. [01-architecture.md](./01-architecture.md)
   Actual runtime topology, data flow, source tree, and current technical constraints
3. [02-data-model.md](./02-data-model.md)
   Filesystem layout, SQLite schema, and persistence model
4. [03-backend-adapters.md](./03-backend-adapters.md)
   Current turn orchestration, Claude Code/Codex adapter behavior, and event normalization
5. [04-ui-spec.md](./04-ui-spec.md)
   Screen-by-screen UI specification
6. [05-design-system-format.md](./05-design-system-format.md)
   Design system directory format and authoring contract
7. [06-milestones.md](./06-milestones.md)
   Current delivery stage, remaining Phase 1 work, and forward roadmap
8. [07-decisions.md](./07-decisions.md)
   Architectural decisions log

## Jump By Topic

| Topic | Where |
|---|---|
| Product scope and non-goals | [00-overview.md](./00-overview.md) |
| Current runtime topology | [01-architecture.md](./01-architecture.md) |
| SQLite schema | [02-data-model.md](./02-data-model.md) |
| Normalized event types and adapter behavior | [03-backend-adapters.md](./03-backend-adapters.md) |
| UI screen contract | [04-ui-spec.md](./04-ui-spec.md) |
| Design system sample format | [05-design-system-format.md](./05-design-system-format.md) |
| Phase status and remaining work | [06-milestones.md](./06-milestones.md) |
| Engineering decisions | [07-decisions.md](./07-decisions.md) |
| Dev setup and conventions | [CONTRIBUTING.md](./CONTRIBUTING.md) |

## Out-of-Band References

Stored at repo root, outside `doc/`:

| Folder | Purpose |
|---|---|
| `ref/` | Reference screenshots of the real Claude Design UI |
| `design system sample/` | Canonical Northvale Capital sample design system |
| `devplan/` | Execution plans and implementation notes |

## Document Conventions

- Docs are written in English
- Code blocks use fenced triple-backtick blocks with a language hint when useful
- Relative links are preferred for cross-references
- Concrete dates are used when describing status snapshots to avoid ambiguity
- `git log` remains the source of truth for document history
