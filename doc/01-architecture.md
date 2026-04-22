# Architecture

## 1. Process Topology

Everything lives in a single Bun process. The target artifact is a **single Windows `.exe`** produced by `bun build --compile`.

```
┌─ burnguard-design.exe (Bun onefile, Windows x64) ──────────────────┐
│                                                                    │
│  Bun runtime (main event loop)                                     │
│    ├─ Hono HTTP + native SSE  (127.0.0.1:RANDOM_PORT)              │
│    ├─ bun:sqlite  (embedded)                                       │
│    ├─ Static file serving  (bundled React SPA)                     │
│    └─ LLM Harness  ★ heart of the product                          │
│         ├─ Process manager (node-pty children)                     │
│         ├─ Adapter registry (Claude Code, Codex)                   │
│         ├─ Event normalizer                                        │
│         ├─ Fanout broker (multi-subscriber SSE)                    │
│         ├─ Context builder (tweak / DS / file-tree injection)      │
│         └─ Permission gate (tool-call interception)                │
│                                                                    │
│  Worker threads                                                    │
│    ├─ Export worker  (Playwright / pptxgenjs / sharp / jszip)      │
│    ├─ DS extraction worker  (Phase 3)                              │
│    └─ File watcher  (chokidar → file.changed events)               │
│                                                                    │
│  Child processes (node-pty)                                        │
│    ├─ `claude`  (Claude Code CLI, per session)                     │
│    └─ `codex`   (Codex CLI, per session)                           │
│                                                                    │
│  External (not bundled)                                            │
│    └─ Playwright Chromium  (~/.cache/ms-playwright/, first-run DL) │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
         ↓ bootstrap
  `start http://127.0.0.1:PORT` → OS default browser
         ↓
  React SPA (embedded static files inside the exe)
```

## 2. Process Lifecycle

1. User runs `.exe`
2. Port scan (pick first free port in `14070–14170`)
3. Initialize `~/.burnguard/` (first run only):
   - Copy embedded `goldman-sachs` sample into `data/systems/goldman-sachs/`
   - Create empty `data/projects/`
   - Initialize `data/burnguard.db` (SQLite) and run migrations
4. Start Hono server, serve the SPA
5. Detect Playwright Chromium; if absent, show first-export toast to download
6. Auto-detect CLIs (`which claude`, `which codex`), surface results in UI
7. Open default browser to local URL
8. Process stays alive even if all browser tabs close (Phase 2+ tray icon; Phase 1 requires manual shutdown via `Ctrl+C` or task manager)

## 3. Final Tech Stack

### 3.1 Runtime & server

| Component | Choice | Note |
|---|---|---|
| Runtime | **Bun 1.1+** | Bundles packager, test runner, native SQLite |
| HTTP | **Hono** | Lightweight, native SSE support |
| DB driver | **bun:sqlite** | No external native module |
| ORM | **drizzle-orm** | Type-safe, SQL-friendly |

### 3.2 LLM harness

| Component | Choice | Reason |
|---|---|---|
| PTY | **node-pty** | Interactive CLIs, interrupt signals |
| Non-PTY fallback | **execa** | One-shot commands, version probes |
| File watching | **chokidar** | Cross-platform change detection |
| Compression | **tar-stream** + **zstd-napi** | Checkpoint tarballs |

### 3.3 Export

| Format | Library | Note |
|---|---|---|
| HTML zip | **jszip** | Standard ZIP |
| PDF | **playwright** (Node) | `page.pdf()`. First-run downloads Chromium |
| PPTX | **pptxgenjs** | Text layers + background screenshots |
| Images | **sharp** | Thumbnails, color extraction |
| Font metadata | **fontkit** | Family/weight/style parsing |

### 3.4 Frontend

| Component | Choice | Reason |
|---|---|---|
| Framework | **React 18** + **Vite 5** | Artifacts-compatible, token-efficient for LLMs |
| Language | **TypeScript 5** | Type safety |
| CSS | **Tailwind 3** + **Shadcn/ui** | Shadcn is copy-paste components, not a dependency |
| Local state | **Zustand** | Small, clean API |
| Server state | **@tanstack/react-query** | Cache + mutations |
| Canvas runtime | **esbuild-wasm** | In-iframe JSX → JS transform |
| Icons | **lucide-react** | 1.5px stroke, matches GS sample |
| Stream | Native `EventSource` | No extra dependencies |

### 3.5 Distribution

| Component | Choice |
|---|---|
| Compiler | `bun build --compile --target=bun-windows-x64 --minify` |
| Icon embed | Post-build via `rcedit` |
| Target size | < 100 MB (excluding Playwright) |
| Code signing | Phase 3+ (budget-dependent; Phase 1 ships a SmartScreen bypass guide) |

## 4. Source Tree

```
BurnGuard/
├── doc/                          # This documentation (7 files)
├── ref/                          # Real UI screenshots for reference
├── design system sample/         # Sample DS (embedded at build time)
├── packages/
│   ├── shared/                   # Common types (frontend + backend)
│   │   └── src/
│   │       ├── events.ts         # NormalizedEvent, UserEvent
│   │       ├── harness.ts        # LLMBackend, Session interfaces
│   │       └── schema.ts         # DB row types re-exported
│   ├── backend/                  # Bun + Hono + Harness
│   │   ├── src/
│   │   │   ├── index.ts          # Entry point (bootstrap)
│   │   │   ├── server/           # HTTP + SSE
│   │   │   │   ├── app.ts        # Hono app composition
│   │   │   │   ├── routes/       # projects, systems, sessions, events, files, exports
│   │   │   │   ├── sse.ts        # /sessions/:id/stream handler
│   │   │   │   └── static.ts     # SPA serving + fallback
│   │   │   ├── db/
│   │   │   │   ├── client.ts     # drizzle + bun:sqlite
│   │   │   │   ├── schema.ts     # Table definitions
│   │   │   │   └── migrations/
│   │   │   ├── harness/          # ★ core
│   │   │   │   ├── broker.ts     # Fanout
│   │   │   │   ├── context-builder.ts
│   │   │   │   ├── fs-watcher.ts
│   │   │   │   ├── permission-gate.ts
│   │   │   │   ├── checkpoint.ts
│   │   │   │   ├── scheduler.ts
│   │   │   │   └── registry.ts
│   │   │   ├── adapters/
│   │   │   │   ├── claude-code/
│   │   │   │   │   ├── index.ts  # LLMBackend implementation
│   │   │   │   │   ├── runner.ts # PTY + stdin/stdout
│   │   │   │   │   └── parser.ts # stream-json → NormalizedEvent
│   │   │   │   └── codex/
│   │   │   │       ├── index.ts
│   │   │   │       ├── runner.ts
│   │   │   │       └── parser.ts
│   │   │   ├── exports/
│   │   │   │   ├── html-zip.ts
│   │   │   │   ├── pdf.ts        # Phase 2
│   │   │   │   ├── pptx.ts       # Phase 2
│   │   │   │   └── handoff.ts    # Phase 3
│   │   │   ├── systems/          # DS management
│   │   │   │   ├── loader.ts     # Sample preload
│   │   │   │   └── extractor.ts  # Phase 3 (GitHub/Figma)
│   │   │   └── lib/              # path, id, logger
│   │   └── package.json
│   └── frontend/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── views/
│       │   │   ├── HomeView.tsx
│       │   │   ├── ProjectView.tsx
│       │   │   └── DesignSystemView.tsx
│       │   ├── components/
│       │   │   ├── chat/         # ChatPane, Composer, MessageRenderer
│       │   │   ├── canvas/       # Canvas, ArtifactTabs, SelectorOverlay, RefreshButton
│       │   │   ├── files/        # DesignFilesView, FileTree, FilePreview
│       │   │   ├── modes/        # Tweaks(P3), Comment(P2), Edit(P2), Draw(P3)
│       │   │   └── common/       # Button, Input, Dialog (Shadcn)
│       │   ├── state/            # Zustand stores
│       │   │   ├── projectStore.ts
│       │   │   ├── sessionStore.ts
│       │   │   └── uiStore.ts
│       │   ├── api/              # REST client + SSE
│       │   │   ├── client.ts
│       │   │   └── sse.ts
│       │   └── lib/
│       ├── index.html
│       ├── vite.config.ts
│       └── package.json
├── scripts/
│   ├── build-binary.ts           # bun compile wrapper
│   ├── prepare-samples.ts        # Validate + embed design system sample/
│   └── release.ts                # Version bump + changelog
├── tests/
│   ├── e2e/                      # Playwright (dev-only)
│   └── fixtures/                 # CLI output captures
├── package.json                  # workspaces
├── tsconfig.json
├── bunfig.toml
└── README.md
```

## 5. SSE Event Sequences

### 5.1 Project creation + first design request

```
Browser                    Hono Server                  Harness            claude CLI
   │                            │                          │                     │
   │ POST /api/projects         │                          │                     │
   │───────────────────────────►│                          │                     │
   │                            │ createProject()          │                     │
   │                            │ createSession()          │                     │
   │                            │─────────────────────────►│                     │
   │                            │                          │ spawn node-pty      │
   │                            │                          │────────────────────►│
   │                            │                          │◄───── ready ────────│
   │◄── 201 {id, sessionId} ────│                          │                     │
   │                            │                          │                     │
   │ GET /api/sessions/:id/     │                          │                     │
   │     stream                 │                          │                     │
   │───────────────────────────►│                          │                     │
   │                            │ broker.subscribe()       │                     │
   │◄══ event: status.running ══│                          │                     │
   │                            │                          │                     │
   │ POST /api/sessions/:id/    │                          │                     │
   │      events                │                          │                     │
   │ {type:user.message, ...}   │                          │                     │
   │───────────────────────────►│                          │                     │
   │                            │ contextBuilder.build()   │                     │
   │                            │   + DS inject            │                     │
   │                            │   + file tree            │                     │
   │                            │ session.send()           │                     │
   │                            │─────────────────────────►│                     │
   │                            │                          │ write(prompt)       │
   │                            │                          │────────────────────►│
   │                            │                          │◄── stream-json ─────│
   │                            │                          │ parser → Normalized │
   │                            │                          │ broker.publish()    │
   │                            │                          │  + db.insert(event) │
   │◄══ event: chat.delta ══════│                          │                     │
   │◄══ event: tool.started ════│                          │                     │
   │◄══ event: chat.delta ══════│                          │                     │
   │◄══ event: file.changed ════│                          │                     │
   │◄══ event: usage.delta ═════│                          │                     │
   │◄══ event: status.idle ═════│                          │                     │
```

### 5.2 Message with attached files

```
Browser                                      Hono Server                 Harness
   │                                              │                          │
   │ POST /api/sessions/:id/events (multipart)    │                          │
   │   text: "make hero using this image"         │                          │
   │   files: [image.png]                         │                          │
   │─────────────────────────────────────────────►│                          │
   │                                              │ save to .attachments/    │
   │                                              │ paths = [abs/path.png]   │
   │                                              │ contextBuilder appends:  │
   │                                              │   <image>paths[0]</image>│
   │                                              │ session.send()           │
   │                                              │─────────────────────────►│
   │                                              │                          │ (CLI reads image)
   │◄═══ events stream... ════════════════════════│                          │
```

### 5.3 Refresh canvas (no new chat turn)

```
Browser                                    Hono Server
   │                                            │
   │ click [↻ Refresh]                          │
   │ GET /api/projects/:id/files                │
   │───────────────────────────────────────────►│
   │◄── { tree, entrypoint, updatedAt } ────────│
   │                                            │
   │ for each *.tsx entry:                      │
   │   esbuild-wasm.transform(src) → js         │
   │   blob = Blob([html_with_script], type)    │
   │   iframe.src = URL.createObjectURL(blob)   │
   │                                            │
```

### 5.4 Session resume after browser refresh

```
Browser (refreshed)                        Hono Server
   │                                            │
   │ GET /api/sessions/:id/events               │
   │   ?since={lastSeenTs}                      │
   │───────────────────────────────────────────►│
   │◄── { data: [past events...] } ─────────────│
   │                                            │
   │ GET /api/sessions/:id/stream               │
   │───────────────────────────────────────────►│
   │◄══ event: ... (live tail) ═════════════════│
   │                                            │
   │ client-side: dedupe by event.id            │
```

## 6. Parent ↔ iframe Messaging

The canvas iframe renders project HTML from a `blob:` URL. Messages between parent (SPA) and iframe:

```
parent → iframe
  { kind: "select", nodeId: "..." }             // enter select mode
  { kind: "tweak.apply", nodeId, prop, value }  // Phase 3
  { kind: "comment.show", nodeId, body }        // Phase 2

iframe → parent
  { kind: "element.clicked", nodeId, rect, computed }
  { kind: "ready", tree: [...] }
  { kind: "tweak.committed", nodeId, prop, oldValue, newValue }
```

Helper script injected into iframe:
- Auto-assigns `data-bg-node-id` to every DOM element (MutationObserver)
- Posts click events to parent
- Applies `element.style` patches received from parent

## 7. Security Model (local binary)

| Area | Policy |
|---|---|
| Network bind | **127.0.0.1 only** — never bind public IPs |
| CORS | Only `http://localhost:PORT` allowed |
| CSRF | N/A (single user, local) |
| Filesystem access | **Restricted to `~/.burnguard/`**, path traversal blocked |
| CLI command execution | Harness intercepts; writes outside the project dir are **always denied** |
| iframe sandbox | `sandbox="allow-scripts allow-same-origin"` |
| CSP | Self-host + Tailwind CDN; external fetches blocked |
| Attachments | MIME check + 50 MB per-file limit |
| SQLite file | `chmod 600` on POSIX; Windows uses user-profile defaults |

## 8. Observability (Phase 1 minimum)

- **Logs**: `~/.burnguard/logs/app.log` — structured JSON, 10 MB rotation × 10 files
- **Log level**: `BG_LOG=debug|info|warn|error` env var
- **Harness trace**: per-session `~/.burnguard/logs/session-{id}.log` — raw CLI stdout included
- **Export**: zip trace for bug reports
- **Phase 2+**: in-app "Report" button → bundles logs + screenshot as ZIP

## 9. Configuration

`~/.burnguard/config.json`:

```jsonc
{
  "defaultBackend": "claude-code",       // "claude-code" | "codex"
  "theme": "light",                      // "light" | "dark" | "auto"
  "port": null,                          // null = auto-select
  "autoOpenBrowser": true,
  "playwright": {
    "installed": false,
    "installPath": null
  },
  "harness": {
    "maxConcurrentSessions": 3,
    "checkpointEveryTurns": 5,
    "toolAutoAllow": true                // Phase 1 default; flip to false in Phase 2
  },
  "logs": {
    "level": "info"
  }
}
```

Edited via Settings modal. Changes hot-reload without harness restart.
