# LLM Harness & Backend Adapters

> **This document is the core of the project.** Harness quality caps product quality. Invest heavily in tests, retry logic, and observability.

## 1. Design Principles

1. **Absorb CLI diversity** — Claude Code and Codex have different output formats and interfaces; upper layers see one unified API.
2. **Normalize events** — every backend's output converges to a single `NormalizedEvent` type.
3. **Inject context** — before each turn, automatically inject DS contents / file tree / tweak diff as a prompt prefix.
4. **Fail-soft** — a broken parser must not kill the session (fall back to raw mode).
5. **Resumable** — checkpoint-based restart. Browser refresh continues the same conversation.

## 2. Core Interfaces

`packages/shared/src/harness.ts`:

```typescript
import type { NormalizedEvent, UserEvent } from "./events";

export interface LLMBackend {
  readonly id: string;                       // 'claude-code', 'codex', ...
  readonly displayName: string;
  readonly capabilities: BackendCapabilities;

  /** PATH scan + version probe */
  detect(): Promise<DetectionResult>;

  /** Create a new session instance (does not spawn the process yet) */
  createSession(config: SessionConfig): Promise<Session>;
}

export interface BackendCapabilities {
  streaming: true;
  interruption: boolean;
  multimodalInput: boolean;       // Image/file attachments
  toolConfirmation: boolean;      // Can gate tool calls
  ptyMode: boolean;
  contextInjection: boolean;      // Custom system prompt supported
  resumeBySessionId: boolean;     // CLI supports session-id based resume
}

export interface DetectionResult {
  found: boolean;
  version?: string;
  binaryPath?: string;
  installHint?: string;
}

export interface SessionConfig {
  sessionId: string;               // ULID, matches DB row
  projectDir: string;              // cwd
  designSystemDir?: string;        // Context injection source
  historyLimit?: number;           // Number of prior turns to include in prefix
  onToolRequest?: (r: ToolRequest) => Promise<ToolDecision>;
}

export interface Session {
  readonly id: string;
  readonly backendId: string;
  status: SessionStatus;

  /** Send a user event */
  send(event: UserEvent): Promise<void>;

  /** Abort the current turn (SIGINT or CLI-specific) */
  interrupt(): Promise<void>;

  /** Subscribe to normalized events */
  subscribe(listener: (e: NormalizedEvent) => void): () => void;

  /** Inject a context patch (takes effect on next send) */
  inject(patch: ContextPatch): void;

  /** Create a checkpoint */
  checkpoint(): Promise<CheckpointRef>;

  /** Terminate session + clean up process */
  close(): Promise<void>;
}

export type SessionStatus = 
  | "idle" 
  | "running" 
  | "awaiting_tool" 
  | "error" 
  | "terminated";

export interface ContextPatch {
  designSystem?: { id: string; dirPath: string };
  fileTree?: FileInfo[];
  tweaks?: TweakDiff[];               // Phase 3
  conversationSummary?: string;
}

export interface ToolRequest {
  toolCallId: string;
  tool: string;
  input: unknown;
  sensitivity: "low" | "medium" | "high";
}
export interface ToolDecision {
  decision: "allow" | "deny";
  reason?: string;
}

export interface CheckpointRef {
  turnId: string;
  path: string;                      // .meta/checkpoints/turn-N.tar.zst
  createdAt: number;
}
```

## 3. NormalizedEvent Schema

`packages/shared/src/events.ts`:

```typescript
export type NormalizedEvent =
  | { id: string; ts: number; type: "chat.delta"; turnId: string; text: string }
  | { id: string; ts: number; type: "chat.thinking"; turnId: string; text: string }
  | { id: string; ts: number; type: "chat.message_end"; turnId: string }
  | { id: string; ts: number; type: "tool.started"; turnId: string; toolCallId: string; tool: string; input: unknown }
  | { id: string; ts: number; type: "tool.finished"; turnId: string; toolCallId: string; tool: string; ok: boolean; output?: unknown }
  | { id: string; ts: number; type: "tool.permission_required"; turnId: string; toolCallId: string; tool: string; input: unknown }
  | { id: string; ts: number; type: "file.changed"; turnId: string; action: "created"|"edited"|"deleted"; path: string }
  | { id: string; ts: number; type: "status.running" }
  | { id: string; ts: number; type: "status.idle"; stopReason: "end_turn" | "requires_action" | "interrupted" | "error" }
  | { id: string; ts: number; type: "status.error"; message: string; recoverable: boolean }
  | { id: string; ts: number; type: "usage.delta"; input: number; output: number; cached?: number };

export type UserEvent =
  | { type: "user.message"; text: string; attachments?: string[] }   // abs paths
  | { type: "user.interrupt" }
  | { type: "user.tool_decision"; toolCallId: string; decision: "allow" | "deny"; reason?: string };
```

**Rules**
- `id` is a ULID, guaranteeing chronological sort.
- `ts` is creation time (ms since epoch).
- `turnId` groups all events belonging to a single `user.message` turn. Assigned by the harness.
- `file.changed` is emitted by the fs-watcher, not by adapters — it is a **harness** responsibility.

## 4. 14 Responsibilities

| # | Responsibility | Location | Phase |
|---|---|---|---|
| 1 | CLI auto-discovery (PATH + version + feature probe) | `adapters/{id}/index.ts::detect` | P1 |
| 2 | PTY-based execution | `adapters/{id}/runner.ts` | P1 |
| 3 | Output parser | `adapters/{id}/parser.ts` | P1 |
| 4 | Event fanout | `harness/broker.ts` | P1 |
| 5 | Context injection | `harness/context-builder.ts` | P1 |
| 6 | Tool call interception + permission gate | `harness/permission-gate.ts` | P1 (auto-allow) · P2 (UI modal) |
| 7 | Artifact change detection | `harness/fs-watcher.ts` | P1 |
| 8 | Token/usage tracking | `harness/usage-tracker.ts` | P1 |
| 9 | Interrupt + redirect | `Session.interrupt()` | P1 |
| 10 | Checkpoints (tar.zst) | `harness/checkpoint.ts` | P1 |
| 11 | Reconnection safety (history + dedupe) | `harness/history.ts` | P1 |
| 12 | Error classification + auto-retry | `harness/retry.ts` | P1 |
| 13 | Multi-session scheduler (concurrency cap) | `harness/scheduler.ts` | P1 |
| 14 | Third-party adapter plugin loader | `harness/plugins.ts` | P3 |

## 5. Claude Code Adapter

### 5.1 Detection

```typescript
// packages/backend/src/adapters/claude-code/index.ts
import { execa } from "execa";
import which from "which";

export const claudeCodeBackend: LLMBackend = {
  id: "claude-code",
  displayName: "Claude Code",
  capabilities: {
    streaming: true,
    interruption: true,
    multimodalInput: true,
    toolConfirmation: true,
    ptyMode: true,
    contextInjection: true,
    resumeBySessionId: true,
  },

  async detect() {
    const bin = await which("claude", { nothrow: true });
    if (!bin) {
      return { found: false, installHint: "Install: https://claude.com/code" };
    }
    try {
      const { stdout } = await execa(bin, ["--version"], { timeout: 5000 });
      return { found: true, version: stdout.trim(), binaryPath: bin };
    } catch (e) {
      return { found: false, installHint: "Claude Code found but not executable" };
    }
  },

  createSession(config) {
    return new ClaudeCodeSession(config);
  },
};
```

### 5.2 Execution Mode

**Phase 1**: non-interactive `--print --output-format stream-json`

```bash
claude --print \
  --output-format stream-json \
  --session-id {ulid} \
  --cwd {projectDir} \
  < prompt_with_context.txt
```

**Rationale**: stream-json emits one JSON object per line, which is the most stable to parse. The `--session-id` option allows turn-to-turn resume (the CLI persists state internally).

**Phase 2+**: interactive PTY mode (for tool confirmation modals).

### 5.3 Parser

Claude Code `stream-json` schema (observed):

```
{"type":"system","subtype":"init","session_id":"...","cwd":"...","tools":[...]}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."}]},"session_id":"..."}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"..."}]}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_...","name":"Edit","input":{...}}]}}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_...","content":"..."}]}}
{"type":"result","subtype":"success","total_cost_usd":0.12,"usage":{"input_tokens":1234,"output_tokens":567,"cache_read_input_tokens":4321}}
```

**Mapping table**

| Claude Code event | → NormalizedEvent |
|---|---|
| `{type:"system",subtype:"init"}` | `status.running` |
| `{type:"assistant",content:[{type:"text"}]}` | `chat.delta{text}` |
| `{type:"assistant",content:[{type:"thinking"}]}` | `chat.thinking{text}` |
| `{type:"assistant",content:[{type:"tool_use",name,input}]}` | `tool.started{toolCallId, tool:name, input}` |
| `{type:"user",content:[{type:"tool_result",tool_use_id,content,is_error}]}` | `tool.finished{toolCallId, ok:!is_error, output:content}` |
| `{type:"result",subtype:"success",usage}` | `usage.delta` + `status.idle{stopReason:"end_turn"}` |
| `{type:"result",subtype:"error_max_turns"}` | `status.idle{stopReason:"error"}` |
| stderr line matching `^Error:` | `status.error{recoverable:true}` |

**Parser principles**
- Try `JSON.parse` on each stdout line; on failure, accumulate into a raw text buffer and emit as `chat.delta`
- Parser is a pure reducer function
- Tests: snapshot tests against `tests/fixtures/claude-code/*.jsonl` recorded sessions

### 5.4 Context Injection (prompt prefix)

Text built before every `send(user.message)`:

```
<design_system>
<!-- from SKILL.md -->
---
name: goldman-sachs-design
description: ...
user-invocable: true
---
(SKILL.md body)

<!-- from README.md first 200 lines -->
# Goldman Sachs Design System
...

<!-- from colors_and_type.css first 150 lines -->
:root {
  --gray-100: #FFFFFF;
  ...
}
</design_system>

<project_state>
Type: prototype
Working directory: {projectDir}
Files:
- index.html (2.3KB)
- styles.css (800B)
- app.tsx (1.1KB)
Entry point: index.html
</project_state>

<user_tweaks>
<!-- Phase 3 only -->
data-bg-node-id="hero-title": font-size=220px; letter-spacing=-12.1px;
data-bg-node-id="subtitle": font-family="KoPub Batang";
</user_tweaks>

<conversation_summary>
<!-- Last 5 turns summarized from checkpoint -->
T1: User requested "15-slide investor deck" → Investor Deck.html created.
T2: User requested "bigger impact on first slide" → title size increased.
...
</conversation_summary>

<attachments>
  <image path="C:/.../.attachments/hero-reference.png"/>
  <doc path="C:/.../.attachments/brief.pdf"/>
</attachments>

<current_request>
{user input text}
</current_request>
```

Claude Code receives this as the first user message. We deliberately do **not** use `--system-prompt`; keeping everything in the user message yields more stable resume behavior.

### 5.5 Attachments

Image paths are passed as absolute paths. Claude Code natively recognizes them as vision input.

```xml
<image path="C:\Users\lg\.burnguard\data\projects\01J.../.attachments\hero.png"/>
```

The CLI reads each file and converts it to an `image` content block in its upstream API call.

### 5.6 Session Resume

Claude Code's `--session-id {id}` flag lets us reuse a logical conversation. The CLI loads internal checkpoints on startup, so our DB session ID maps 1:1 to the Claude Code session ID.

## 6. Codex Adapter

### 6.1 Detection

```typescript
async detect() {
  for (const name of ["codex", "openai-codex"]) {
    const bin = await which(name, { nothrow: true });
    if (bin) {
      try {
        const { stdout } = await execa(bin, ["--version"], { timeout: 5000 });
        return { found: true, version: stdout.trim(), binaryPath: bin };
      } catch { /* ignore */ }
    }
  }
  return { found: false, installHint: "Install: https://github.com/openai/codex" };
}
```

### 6.2 Execution Mode

Codex CLI is primarily interactive. We run it under PTY.

```bash
codex --cwd {projectDir}
```

Feed prompts via stdin, parse stdout line by line.

**Phase 1 stance**: best-effort parser + raw-mode fallback. Codex output is less structured than Claude Code, so perfect normalization is unattainable.

### 6.3 Parser (heuristic)

| Codex line pattern | → NormalizedEvent |
|---|---|
| `> {user prompt}` echo | ignore |
| `Thinking...` or `>>> thinking` | start `chat.thinking` |
| `--- tool: {name} ---` or `Running: {tool}` | `tool.started{tool}` |
| `--- result ---` or `done` | `tool.finished` |
| `Tokens: in={n} out={n}` | `usage.delta` |
| Prompt prefix (`> `) re-appears after blank line | `status.idle{end_turn}` |
| `Error: ...` | `status.error` |
| Anything else | `chat.delta` |

**Parser tests**: `tests/fixtures/codex/*.txt` — recordings captured in Phase 1 week 1.

### 6.4 Raw Mode Fallback

If the parser fails to identify anything other than `chat.delta` for 3 consecutive turns, the UI surfaces:

> Codex output structure not recognized. Running in raw mode — tool calls may not be tracked.

In this mode stdout is passed through as `chat.delta`. File changes are still detected by `fs-watcher` (adapter-independent).

### 6.5 Context Injection

Same strategy as Claude Code, but Codex may not parse XML-like tags well, so we format as Markdown:

```markdown
## Design System
(SKILL.md + README.md contents)

## Project State
...

## Current Request
{user text}
```

## 7. Harness Core Components

### 7.1 Broker (resp. #4)

```typescript
// packages/backend/src/harness/broker.ts
export class EventBroker {
  private subs = new Map<string, Set<(e: NormalizedEvent) => void>>();

  publish(sessionId: string, event: NormalizedEvent) {
    // 1. Persist (synchronous, to preserve ordering)
    db.insert(eventsTable).values({
      id: event.id,
      session_id: sessionId,
      direction: "down",
      type: event.type,
      payload_json: JSON.stringify(event),
      turn_id: (event as any).turnId ?? null,
      processed_at: event.ts,
      created_at: Date.now(),
    }).run();

    // 2. Fanout to subscribers
    this.subs.get(sessionId)?.forEach(cb => {
      try { cb(event); } catch (e) { logger.error({ e }, "subscriber failed"); }
    });
  }

  subscribe(sessionId: string, cb: (e: NormalizedEvent) => void): () => void {
    if (!this.subs.has(sessionId)) this.subs.set(sessionId, new Set());
    this.subs.get(sessionId)!.add(cb);
    return () => this.subs.get(sessionId)?.delete(cb);
  }
}
```

### 7.2 Context Builder (resp. #5)

```typescript
export class ContextBuilder {
  async build(sessionId: string, userText: string, attachments: string[]): Promise<string> {
    const session = await getSession(sessionId);
    const project = await getProject(session.project_id);
    const ds = project.design_system_id ? await getDS(project.design_system_id) : null;
    const files = await listProjectFiles(project.id);
    const tweaks = await listProjectTweaks(project.id);     // P3
    const summary = await buildConversationSummary(sessionId);

    return renderPrompt({
      ds, project, files, tweaks, summary, attachments, userText
    });
  }
}
```

### 7.3 FS Watcher (resp. #7)

```typescript
import chokidar from "chokidar";

export class ProjectWatcher {
  private watchers = new Map<string, chokidar.FSWatcher>();

  watch(projectId: string, dir: string, broker: EventBroker, sessionIdResolver: () => string) {
    const w = chokidar.watch(dir, { 
      ignored: /(^|[\/\\])\.|(\.attachments\/)|(\.meta\/)/,
      ignoreInitial: true,
    });
    w.on("add", p => this.emit(projectId, broker, sessionIdResolver(), "created", p, dir));
    w.on("change", p => this.emit(projectId, broker, sessionIdResolver(), "edited", p, dir));
    w.on("unlink", p => this.emit(projectId, broker, sessionIdResolver(), "deleted", p, dir));
    this.watchers.set(projectId, w);
  }

  private emit(projectId, broker, sessionId, action, absPath, baseDir) {
    const relPath = path.relative(baseDir, absPath);
    // Update files table
    syncFileRow(projectId, relPath, action);
    // Emit normalized event
    broker.publish(sessionId, {
      id: ulid(), ts: Date.now(), type: "file.changed",
      turnId: getCurrentTurn(sessionId),
      action, path: relPath,
    });
  }
}
```

### 7.4 Permission Gate (resp. #6)

Phase 1 default: `config.harness.toolAutoAllow = true`. Traversal / writes outside the project dir are **always denied**.

```typescript
export async function gateToolRequest(req: ToolRequest, projectDir: string): Promise<ToolDecision> {
  // Always-deny rules
  if (req.tool === "Write" || req.tool === "Edit") {
    const target = (req.input as any).file_path;
    if (!target || !isWithin(projectDir, target)) {
      return { decision: "deny", reason: "outside_project_dir" };
    }
  }
  // Phase 1: auto-allow
  if (config.harness.toolAutoAllow) return { decision: "allow" };
  // Phase 2+: UI modal
  return await askUser(req);
}
```

### 7.5 Retry (resp. #12)

| Error | Class | Action |
|---|---|---|
| CLI exit != 0 (1st occurrence) | transient | wait 1s, restart |
| CLI exit != 0 (3 in a row) | permanent | `status.terminated` |
| stdin write EPIPE | transient | restart session |
| stdout timeout (5 min) | transient | `interrupt()` then restart |
| JSON parse failure | logged, session survives | passthrough as raw chat.delta |
| Context build failure (e.g. missing DS) | user error | `status.error{recoverable:true}` + UI guidance |

Backoff: 1s → 4s → 10s, then permanent.

### 7.6 Checkpoint (resp. #10)

Auto-checkpoint every 5 turns:

```typescript
export async function checkpoint(sessionId: string): Promise<CheckpointRef> {
  const session = await getSession(sessionId);
  const project = await getProject(session.project_id);
  const turnId = session.last_turn_id ?? "init";
  const outPath = path.join(project.dir_path, ".meta", "checkpoints", `turn-${turnId}.tar.zst`);
  
  await tarZst([
    project.dir_path,                        // full project tree
    // plus events for this session exported as JSON
  ], outPath);
  
  return { turnId, path: outPath, createdAt: Date.now() };
}
```

Restore = extract `.tar.zst` and re-insert events into DB.

### 7.7 Scheduler (resp. #13)

Max N concurrent sessions (default 3). Above cap → queue + "waiting for slot" status.

```typescript
class SessionScheduler {
  private running = new Set<string>();
  private queue: Array<() => void> = [];
  private max = config.harness.maxConcurrentSessions;

  async acquire(sessionId: string): Promise<void> {
    if (this.running.size < this.max) {
      this.running.add(sessionId);
      return;
    }
    return new Promise(resolve => this.queue.push(() => {
      this.running.add(sessionId);
      resolve();
    }));
  }

  release(sessionId: string) {
    this.running.delete(sessionId);
    const next = this.queue.shift();
    next?.();
  }
}
```

### 7.8 Plugins (resp. #14, Phase 3)

Dynamic import of `~/.burnguard/plugins/*.js` at boot.

```typescript
// Example: ~/.burnguard/plugins/gemini-cli.js
export default {
  id: "gemini-cli",
  displayName: "Gemini CLI",
  capabilities: { /* ... */ },
  async detect() { /* ... */ },
  createSession(config) { /* ... */ },
};
```

Security: plugins are constrained — cannot touch files outside `~/.burnguard/`. Wrapped in vm2 or isolated-vm (decided during Phase 3 detailed design).

## 8. Testing Strategy

### 8.1 Unit

- Parser pure-function snapshot tests (fixture in → NormalizedEvent[] out)
- Context builder template rendering
- Permission gate rule matrix (allow/deny cases)
- Retry backoff timing (fake timers)

### 8.2 Integration (CLI stub)

Spin up `tests/stubs/claude-code-stub.ts` as a fake CLI and verify the harness parses/injects/terminates correctly.

```typescript
// Stub: print a pre-recorded fixture and exit
const fixture = await fs.readFile("./tests/fixtures/session-create-hero.jsonl");
process.stdout.write(fixture);
process.exit(0);
```

### 8.3 E2E (Playwright)

Phase 1 smoke x5:
1. Project creation → session starts
2. Send chat message → SSE events received
3. File drop → attachments saved
4. Refresh button → file tree reloaded
5. HTML zip export → inspect archive contents

## 9. Observability

Per-session **raw trace** written to `~/.burnguard/logs/session-{id}.log`:

```
[2026-04-22T09:30:45.123Z] [claude-code] [stdin] {prompt text...}
[2026-04-22T09:30:45.456Z] [claude-code] [stdout] {"type":"system","subtype":"init"}
[2026-04-22T09:30:45.789Z] [claude-code] [stdout] {"type":"assistant","message":{...}}
[2026-04-22T09:30:46.012Z] [harness] normalized → chat.delta text="Building hero..."
[2026-04-22T09:30:47.345Z] [harness] tool.started Edit {file_path:"styles.css"}
[2026-04-22T09:30:47.500Z] [fs-watcher] edited → styles.css
```

Bug reports zip this log + `meta_schema` + `config.json`.
