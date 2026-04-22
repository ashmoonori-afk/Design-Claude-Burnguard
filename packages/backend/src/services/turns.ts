import { readdir } from "node:fs/promises";
import { ulid } from "ulid";
import type { NormalizedEvent, UserEvent } from "@bg/shared";
import { assignAttachmentsToTurn } from "../db/attachments";
import {
  bumpSessionUsage,
  insertNormalizedEvent,
  insertUserEvent,
  setSessionStatus,
} from "../db/events";
import { getSessionInfo } from "../db/seed";
import { broker } from "./broker";
import { buildSessionContext } from "./context";
import { writePreTurnSnapshot, writeTurnCheckpoint } from "./checkpoints";
import { indexProjectFiles } from "./files";
import { appendSessionTrace } from "./trace";
import { detectBackends } from "./backends";
import { buildPrompt } from "../harness/prompt-builder";
import { runAdapterTurn } from "../adapters/registry";

type ToolDecision = Extract<UserEvent, { type: "user.tool_decision" }>;

interface ActiveTurn {
  abortController: AbortController;
  interrupted: boolean;
  /**
   * Tool decisions that arrived before the adapter registered a
   * handler. Drained when `onDecision` is called. When flush is done
   * the queue is kept for safety — any late registration still sees
   * the backlog exactly once.
   */
  decisionQueue: ToolDecision[];
  decisionHandler: ((decision: ToolDecision) => void) | null;
}

const activeTurns = new Map<string, ActiveTurn>();

async function listDirSafe(dir: string): Promise<string[] | string> {
  try {
    return await readdir(dir);
  } catch (err) {
    return `<error: ${err instanceof Error ? err.message : String(err)}>`;
  }
}

async function persistAndPublish(sessionId: string, event: NormalizedEvent) {
  await insertNormalizedEvent(sessionId, event);
  await appendSessionTrace(sessionId, {
    level: "event",
    event,
  });
  broker.publish(sessionId, event);
}

/**
 * Drives a single user turn end-to-end:
 *   1. Persist the user.message
 *   2. Build the prompt (harness/prompt-builder)
 *   3. Detect and invoke the CLI adapter (claude-code or codex)
 *   4. Stream normalized events back through the broker + persist to SQLite
 *   5. Reindex project files + checkpoint the turn
 *
 * No templated HTML is written here — all artifact creation comes from the
 * real LLM CLI. See doc/03-backend-adapters.md for the event-normalization
 * contract the adapters must satisfy.
 */
export function isUserTurnRunning(sessionId: string) {
  return activeTurns.has(sessionId);
}

export function interruptUserTurn(sessionId: string) {
  const active = activeTurns.get(sessionId);
  if (!active) {
    return false;
  }

  active.interrupted = true;
  active.abortController.abort();
  return true;
}

/**
 * Delivers a tool decision to the running turn's adapter. Called from
 * `routes/session.ts` after a `POST /tool-decision`. Returns:
 *
 *   - `"delivered"`  — an adapter handler consumed the decision
 *   - `"queued"`     — no handler yet; it will be drained on register
 *   - `"no_active_turn"` — no active turn for this session
 *
 * Denies currently continue to interrupt the turn at the route layer
 * regardless of return value because today's Claude Code `-p` mode
 * can't actually skip a tool call. That fallback is the right
 * behaviour until an adapter upgrades to a mode where a real round-
 * trip through stdin is possible.
 */
export function submitToolDecisionToTurn(
  sessionId: string,
  decision: ToolDecision,
): "delivered" | "queued" | "no_active_turn" {
  const active = activeTurns.get(sessionId);
  if (!active) return "no_active_turn";
  if (active.decisionHandler) {
    try {
      active.decisionHandler(decision);
    } catch {
      // Handlers shouldn't throw. If one does, queue so a replacement
      // handler can retry.
      active.decisionQueue.push(decision);
      return "queued";
    }
    return "delivered";
  }
  active.decisionQueue.push(decision);
  return "queued";
}

export function startUserTurn(
  sessionId: string,
  payload: Extract<UserEvent, { type: "user.message" }>,
) {
  if (activeTurns.has(sessionId)) {
    return null;
  }

  const activeTurn: ActiveTurn = {
    abortController: new AbortController(),
    interrupted: false,
    decisionQueue: [],
    decisionHandler: null,
  };
  activeTurns.set(sessionId, activeTurn);
  return runUserTurnInternal(sessionId, payload, activeTurn).finally(() => {
    activeTurns.delete(sessionId);
  });
}

async function runUserTurnInternal(
  sessionId: string,
  payload: Extract<UserEvent, { type: "user.message" }>,
  activeTurn: ActiveTurn,
) {
  const sessionContext = await buildSessionContext(sessionId);
  if (!sessionContext) {
    throw new Error("session_not_found");
  }

  const session = await getSessionInfo(sessionId);
  if (!session) {
    throw new Error("session_not_found");
  }

  const backendId = session.backend_id;
  const turnId = ulid();
  const attachmentCount = await assignAttachmentsToTurn(
    sessionId,
    payload.attachments ?? [],
    turnId,
  );

  await insertUserEvent(sessionId, payload);
  await appendSessionTrace(sessionId, {
    level: "input",
    payload,
    attachment_count: attachmentCount,
  });
  await setSessionStatus(sessionId, "running");

  const startTs = Date.now();

  // Persist the user's own message as a normalized event so that replay
  // (page reload, history fetch) renders the full conversation — not just
  // the agent side. `direction=up` user events are filtered out by
  // listSessionEvents, so without this the user bubble would disappear.
  await persistAndPublish(sessionId, {
    id: ulid(),
    ts: startTs,
    type: "chat.user_message",
    turnId,
    text: payload.text,
    attachmentCount,
  });

  await persistAndPublish(sessionId, {
    id: ulid(),
    ts: startTs,
    type: "status.running",
  });

  const detection = await detectBackends();
  const backend = detection.backends.find((b) => b.id === backendId);

  if (!backend?.found || !backend.binary_path) {
    await persistAndPublish(sessionId, {
      id: ulid(),
      ts: Date.now(),
      type: "status.error",
      message: `${backendId} CLI not found on PATH. ${backend?.install_hint ?? "Install and retry."}`,
      recoverable: true,
    });
    await persistAndPublish(sessionId, {
      id: ulid(),
      ts: Date.now(),
      type: "status.idle",
      stopReason: "error",
    });
    await setSessionStatus(sessionId, "idle");
    return;
  }

  // Snapshot the project tree before the adapter touches anything so
  // the rollback UI (P3.7) can restore to the exact pre-turn state.
  // Non-fatal: if the copy blows up the turn still proceeds, just
  // without an available checkpoint for this turn.
  try {
    const snapshot = await writePreTurnSnapshot(
      sessionContext.project.project_id,
      turnId,
    );
    if (snapshot) {
      await appendSessionTrace(sessionId, {
        level: "pre_turn_snapshot",
        turnId,
        path: snapshot.path,
      });
    }
  } catch (err) {
    await appendSessionTrace(sessionId, {
      level: "pre_turn_snapshot_failed",
      turnId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const prompt = await buildPrompt(sessionContext, payload);
  await appendSessionTrace(sessionId, {
    level: "prompt_built",
    turnId,
    prompt_chars: prompt.length,
    backend_id: backendId,
    binary: backend.binary_path,
  });

  const projectDir = sessionContext.project.project_dir;
  const preTurnListing = await listDirSafe(projectDir);
  console.log(
    `[turn] pre-turn projectDir=${projectDir} contents=`,
    preTurnListing,
  );
  await appendSessionTrace(sessionId, {
    level: "pre_turn_dir",
    turnId,
    projectDir,
    entries: preTurnListing,
  });

  try {
    await runAdapterTurn(backendId, {
      sessionId,
      turnId,
      projectDir: sessionContext.project.project_dir,
      binaryPath: backend.binary_path,
      prompt,
      signal: activeTurn.abortController.signal,
      userEvent: payload,
      onEvent: async (event) => {
        await persistAndPublish(sessionId, event);
        if (event.type === "usage.delta") {
          await bumpSessionUsage(sessionId, {
            input: event.input,
            output: event.output,
            cached: event.cached ?? 0,
          });
        }
      },
      onStderr: async (line) => {
        await appendSessionTrace(sessionId, {
          level: "stderr",
          turnId,
          line,
        });
      },
      onDecision: (handler) => {
        activeTurn.decisionHandler = handler;
        // Drain decisions that arrived before the adapter was ready.
        if (activeTurn.decisionQueue.length > 0) {
          const queued = activeTurn.decisionQueue.splice(0);
          for (const decision of queued) {
            try {
              handler(decision);
            } catch {
              // Handler error — put the decision back so a future
              // re-register can retry.
              activeTurn.decisionQueue.push(decision);
            }
          }
        }
        return () => {
          if (activeTurn.decisionHandler === handler) {
            activeTurn.decisionHandler = null;
          }
        };
      },
    });
  } catch (err) {
    if (activeTurn.interrupted || activeTurn.abortController.signal.aborted) {
      await persistAndPublish(sessionId, {
        id: ulid(),
        ts: Date.now(),
        type: "status.idle",
        stopReason: "interrupted",
      });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      await persistAndPublish(sessionId, {
        id: ulid(),
        ts: Date.now(),
        type: "status.error",
        message,
        recoverable: true,
      });
      await persistAndPublish(sessionId, {
        id: ulid(),
        ts: Date.now(),
        type: "status.idle",
        stopReason: "error",
      });
    }
  }

  const postTurnListing = await listDirSafe(projectDir);
  const spawnCwdListing = await listDirSafe(process.cwd());
  console.log(
    `[turn] post-turn projectDir=${projectDir} contents=`,
    postTurnListing,
  );
  console.log(
    `[turn] post-turn process.cwd=${process.cwd()} contents=`,
    Array.isArray(spawnCwdListing)
      ? spawnCwdListing.filter(
          (name) => name.endsWith(".html") || name.endsWith(".css"),
        )
      : spawnCwdListing,
  );
  await appendSessionTrace(sessionId, {
    level: "post_turn_dir",
    turnId,
    projectDir,
    entries: postTurnListing,
  });

  // Reindex so any file the CLI wrote appears in the file tree + artifact API.
  await indexProjectFiles(sessionContext.project.project_id);
  await setSessionStatus(sessionId, "idle");

  const checkpoint = await writeTurnCheckpoint(
    sessionContext.project.project_id,
    turnId,
  );
  await appendSessionTrace(sessionId, {
    level: "turn_complete",
    turnId,
    checkpoint,
  });
}
