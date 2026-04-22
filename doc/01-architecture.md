# Architecture

## 1. Runtime Topology

As of April 22, 2026, BurnGuard runs as a single Bun backend process plus a React frontend:

```text
burnguard-design.exe or bun run src/index.ts
  |
  +-- Bun runtime
      +-- Hono HTTP server on 127.0.0.1:14070 by default
      +-- SQLite via drizzle-orm
      +-- Static frontend serving from packages/frontend/dist
      +-- Bootstrap (config, sample design system, migrations, seed data)
      +-- Session/event services
      +-- File watchers for project directories
      +-- Export worker logic
      +-- CLI child processes launched with Bun.spawn
            +-- claude
            +-- codex
```

Important current constraint:
- the implementation does **not** use `node-pty`
- the implementation does **not** keep a long-lived interactive CLI session per project
- each user turn is executed as a fresh subprocess invocation

## 2. Boot Sequence

Current startup flow:

1. Create the local BurnGuard app directories
2. Ensure config exists
3. Seed the bundled sample design system if missing
4. Run SQLite migrations
5. Seed core DB data
6. Attach file watchers to existing projects
7. Start the Hono server
8. In non-dev mode, open the local URL in the default browser

Relevant implementation files:
- `packages/backend/src/index.ts`
- `packages/backend/src/bootstrap.ts`
- `packages/backend/src/server.ts`
- `packages/backend/src/lib/paths.ts`

## 3. Tech Stack

### 3.1 Backend

| Area | Current choice |
|---|---|
| Runtime | Bun |
| HTTP server | Hono |
| Persistence | SQLite + drizzle-orm |
| Streaming | native SSE via Hono |
| Child process execution | `Bun.spawn` |
| Project watching | `node:fs.watch` |

### 3.2 Frontend

| Area | Current choice |
|---|---|
| Framework | React 18 |
| Bundler | Vite 5 |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Server-state cache | `@tanstack/react-query` |
| Local UI state | Zustand |

### 3.3 Export

Current export implementation:

| Format | Status |
|---|---|
| `html_zip` | Implemented |
| `pdf` | Schema/UI placeholder only |
| `pptx` | Schema/UI placeholder only |
| `handoff` | Schema/UI placeholder only |

The HTML zip export currently shells out to Windows PowerShell `Compress-Archive`.

## 4. Source Tree

```text
BurnGuard/
  packages/
    shared/
      src/
        app.ts
        artifact.ts
        events.ts
        export.ts
        harness.ts
        project.ts
    backend/
      src/
        adapters/
          claude-code/
          codex/
        db/
          migrations/
          templates/
        harness/
          prompt-builder.ts
        routes/
          artifacts.ts
          health.ts
          home.ts
          project.ts
          runtime.ts
          session.ts
          system.ts
        runtime/
          deck-stage.ts
        services/
          attachments.ts
          backends.ts
          broker.ts
          checkpoints.ts
          context.ts
          exports.ts
          files.ts
          trace.ts
          turns.ts
          watchers.ts
        bootstrap.ts
        config.ts
        index.ts
        server.ts
    frontend/
      src/
        api/
        components/
          canvas/
          chat/
          export/
          files/
          home/
          modes/
          project/
          settings/
          systems/
          ui/
        state/
        views/
          HomeView.tsx
          ProjectView.tsx
          DesignSystemView.tsx
          DesignFilesView.tsx
          SettingsView.tsx
```

## 5. Current Data Flow

### 5.1 Project creation

1. Frontend posts to `/api/projects`
2. Backend creates the project row and initial session row
3. Backend writes starter artifact files from DB template helpers
4. File watcher is attached to the new project
5. Frontend navigates to `/projects/:id`

### 5.2 User turn

1. Frontend posts `user.message` to `/api/sessions/:id/events`
2. Backend rejects the request if another turn is already running for that session
3. `services/turns.ts`:
   - persists the raw user event
   - emits `chat.user_message` and `status.running`
   - builds prompt context
   - invokes the selected adapter
   - persists and publishes normalized events
   - re-indexes project files
   - writes a turn checkpoint
4. Frontend consumes the event stream over SSE and renders chat/canvas updates

### 5.3 File updates

There are two current paths:

- immediate `file.changed` events from the Claude Code parser when write/edit-style tools succeed
- background re-indexing through `services/watchers.ts` using `fs.watch`

The watcher currently refreshes DB file state only. It does not emit chat timeline events.

### 5.4 Canvas rendering

The center pane renders project files through `/api/projects/:id/fs/*`.

Current behavior:
- if a specific file tab is active, the canvas loads that file
- otherwise it falls back to the artifact entrypoint
- when the active file receives `file.changed`, the iframe is reloaded
- selector mode is still a placeholder overlay and does not inspect the real iframe DOM

## 6. Current Route Surface

Important backend routes today:

| Route | Purpose |
|---|---|
| `GET /api/health` | health metadata |
| `GET /api/home` family | home/dashboard data |
| `POST /api/projects` | create project |
| `GET /api/projects/:id` | project detail |
| `GET /api/projects/:id/session` | latest session |
| `GET /api/projects/:id/files` | indexed file list |
| `GET /api/projects/:id/artifacts` | artifact summary |
| `POST /api/projects/:id/refresh` | re-index and rebuild artifact summary |
| `POST /api/projects/:id/exports` | queue export |
| `GET /api/projects/:id/exports` | list export jobs |
| `POST /api/sessions/:id/events` | send user turn |
| `GET /api/sessions/:id/events` | replay session history |
| `GET /api/sessions/:id/stream` | live SSE stream |
| `POST /api/sessions/:id/interrupt` | currently only marks idle/interrupted |
| `GET /runtime/deck-stage.js` | slide deck runtime script |

## 7. Security and Safety Model

Current enforcement:

- server binds to `127.0.0.1`
- project file serving normalizes and bounds relative paths
- file writing is delegated to the underlying CLI working inside the project directory
- turn execution is serialized per session to avoid concurrent writes from overlapping prompts
- iframe uses a sandboxed render surface

Not yet implemented:
- real tool confirmation gate
- hard runtime enforcement of write-deny rules outside the project directory
- cancellable subprocess interruption

## 8. Observability

Current observability is lightweight:

- normalized events are persisted to SQLite
- turn traces are appended through `services/trace.ts`
- stderr lines are captured for adapter runs
- export failures are stored on export jobs

The docs previously described a larger logging/retry stack than what exists today. That is still future work, not current behavior.

## 9. Long-Term Architecture Items Not Yet Landed

These ideas still appear in planning docs but are **not** current implementation:

- PTY-managed interactive sessions
- permission request modal and tool approval flow
- automated retry/backoff framework
- scheduler for multiple concurrent active sessions
- plugin adapter loading
- structured test fixture suite for adapter output drift
