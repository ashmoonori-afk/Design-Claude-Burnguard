import { ulid } from "ulid";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ApiErrorBody, ApiSuccess, NormalizedEvent, UserEvent } from "@bg/shared";
import {
  insertNormalizedEvent,
  insertUserEvent,
  listSessionEvents,
  setSessionBackend,
  setSessionStatus,
} from "../db/events";
import {
  getLatestProjectSession,
  getProjectDetail,
  getSessionInfo,
} from "../db/seed";
import { saveSessionAttachments } from "../services/attachments";
import { broker } from "../services/broker";
import {
  hasSnapshot,
  restoreFromSnapshot,
} from "../services/checkpoints";
import { appendSessionTrace } from "../services/trace";
import { indexProjectFiles } from "../services/files";
import {
  interruptUserTurn,
  isUserTurnRunning,
  startUserTurn,
  submitToolDecisionToTurn,
} from "../services/turns";

function ok<T>(data: T): ApiSuccess<T> {
  return { data };
}

function fail(
  code: string,
  message: string,
  details?: unknown,
): ApiErrorBody {
  return { error: { code, message, details } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const sessionRoutes = new Hono();

sessionRoutes.get("/api/sessions/:id/events", async (c) => {
  const id = c.req.param("id");
  const session = await getSessionInfo(id);
  if (!session) {
    return c.json(fail("session_not_found", "Session not found", { id }), 404);
  }
  const sinceRaw = c.req.query("since");
  const since = sinceRaw ? Number.parseInt(sinceRaw, 10) : undefined;
  const events = await listSessionEvents(id, Number.isFinite(since) ? since : undefined);
  return c.json(ok(events));
});

sessionRoutes.post("/api/sessions/:id/events", async (c) => {
  const id = c.req.param("id");
  const session = await getSessionInfo(id);
  if (!session) {
    return c.json(fail("session_not_found", "Session not found", { id }), 404);
  }
  if (isUserTurnRunning(id)) {
    return c.json(
      fail("session_busy", "A turn is already running for this session", { id }),
      409,
    );
  }

  const contentType = c.req.header("content-type") ?? "";
  let payload: UserEvent | null = null;

  if (contentType.includes("application/json")) {
    const body = await c.req.json<unknown>();
    if (
      isRecord(body) &&
      body.type === "user.message" &&
      typeof body.text === "string"
    ) {
      payload = {
        type: "user.message",
        text: body.text,
        attachments: Array.isArray(body.attachments)
          ? body.attachments.filter((value): value is string => typeof value === "string")
          : undefined,
      };
    }
  } else if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const type = form.get("type");
    const text = form.get("text");
    if (type === "user.message" && typeof text === "string") {
      const fileEntries = form
        .getAll("files")
        .filter((value): value is File => value instanceof File);
      const attachmentPaths = await saveSessionAttachments(id, fileEntries);
      payload = {
        type: "user.message",
        text,
        attachments: attachmentPaths,
      };
    }
  }

  if (!payload || payload.type !== "user.message") {
    return c.json(
      fail("invalid_body", "Expected a user.message payload with text"),
      400,
    );
  }

  const turn = startUserTurn(id, payload);
  if (!turn) {
    return c.json(
      fail("session_busy", "A turn is already running for this session", { id }),
      409,
    );
  }

  // Fire-and-forget — the CLI can take minutes. Let the broker stream
  // events to SSE subscribers. The outer catch is a safety net in case
  // runUserTurn throws before its own try/catch is set up.
  void turn.catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    const errEvent: NormalizedEvent = {
      id: ulid(),
      ts: Date.now(),
      type: "status.error",
      message,
      recoverable: true,
    };
    await insertNormalizedEvent(id, errEvent).catch(() => {});
    broker.publish(id, errEvent);
    const idle: NormalizedEvent = {
      id: ulid(),
      ts: Date.now(),
      type: "status.idle",
      stopReason: "error",
    };
    await insertNormalizedEvent(id, idle).catch(() => {});
    broker.publish(id, idle);
    await setSessionStatus(id, "idle").catch(() => {});
  });
  return c.json(ok({ accepted: true }));
});

sessionRoutes.post("/api/sessions/:id/interrupt", async (c) => {
  const id = c.req.param("id");
  const session = await getSessionInfo(id);
  if (!session) {
    return c.json(fail("session_not_found", "Session not found", { id }), 404);
  }

  const interrupted = interruptUserTurn(id);
  if (!interrupted && session.status === "running") {
    const event: NormalizedEvent = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      type: "status.idle",
      stopReason: "interrupted",
    };
    await insertNormalizedEvent(id, event);
    await setSessionStatus(id, "idle");
    broker.publish(id, event);
  }

  return c.json(ok({ accepted: true, interrupted }));
});

/**
 * Records a user's allow/deny decision for a pending
 * `tool.permission_required` event. Phase 2 wiring: the Claude Code
 * adapter does not yet surface permission prompts, so this endpoint is
 * exercised end-to-end via the dev-only `/dev/synthesize-permission`
 * route below. Deny aborts the active turn so the CLI exits cleanly.
 */
/**
 * Switches the CLI backend a session will use on its next turn. Only
 * allowed while the session is idle — switching mid-turn is undefined.
 */
sessionRoutes.patch("/api/sessions/:id/backend", async (c) => {
  const id = c.req.param("id");
  const session = await getSessionInfo(id);
  if (!session) {
    return c.json(fail("session_not_found", "Session not found", { id }), 404);
  }
  if (isUserTurnRunning(id) || session.status === "running") {
    return c.json(
      fail("session_busy", "Cannot switch backend while a turn is running", {
        id,
      }),
      409,
    );
  }

  const body = await c.req.json<unknown>().catch(() => null);
  if (!isRecord(body)) {
    return c.json(fail("invalid_body", "Expected a JSON object"), 400);
  }
  const backend = body.backend_id;
  if (backend !== "claude-code" && backend !== "codex") {
    return c.json(
      fail("invalid_backend", "backend_id must be 'claude-code' or 'codex'"),
      400,
    );
  }

  await setSessionBackend(id, backend);
  const refreshed = await getSessionInfo(id);
  return c.json(ok(refreshed));
});

sessionRoutes.post("/api/sessions/:id/tool-decision", async (c) => {
  const id = c.req.param("id");
  const session = await getSessionInfo(id);
  if (!session) {
    return c.json(fail("session_not_found", "Session not found", { id }), 404);
  }

  const body = await c.req.json<unknown>().catch(() => null);
  if (!isRecord(body)) {
    return c.json(fail("invalid_body", "Expected a JSON object"), 400);
  }
  const { toolCallId, decision, reason } = body;
  if (typeof toolCallId !== "string" || !toolCallId.trim()) {
    return c.json(
      fail("invalid_tool_call_id", "toolCallId is required"),
      400,
    );
  }
  if (decision !== "allow" && decision !== "deny") {
    return c.json(
      fail("invalid_decision", "decision must be 'allow' or 'deny'"),
      400,
    );
  }

  const payload: Extract<UserEvent, { type: "user.tool_decision" }> = {
    type: "user.tool_decision",
    toolCallId,
    decision,
    reason: typeof reason === "string" ? reason : undefined,
  };
  await insertUserEvent(id, payload);

  // Hand the decision to the adapter that owns this session's turn
  // so it can forward it into the CLI's own channel (stdin pipe
  // today, structured mode later). This is the P3.6 round-trip
  // path — independent of the fallback below.
  const delivery = submitToolDecisionToTurn(id, payload);

  if (decision === "deny") {
    // Today's Claude Code `-p` invocation cannot actually skip a
    // pending tool — keep the hard-abort fallback so Deny always
    // stops the CLI. When an adapter upgrades to a mode where it
    // can resume after a deny, it can clear the abort itself via
    // the channel.
    const aborted = interruptUserTurn(id);
    if (!aborted && session.status === "running") {
      const idleEvent: NormalizedEvent = {
        id: ulid(),
        ts: Date.now(),
        type: "status.idle",
        stopReason: "interrupted",
      };
      await insertNormalizedEvent(id, idleEvent);
      await setSessionStatus(id, "idle");
      broker.publish(id, idleEvent);
    }
  }

  return c.json(ok({ accepted: true, decision, delivery }));
});

/**
 * Dev-only hook for exercising the permission gate UI without the
 * upstream CLI emitting a real `tool.permission_required`. Gated by
 * BG_DEV so a production build never exposes it.
 */
if (process.env.BG_DEV === "1") {
  sessionRoutes.post(
    "/api/sessions/:id/dev/synthesize-permission",
    async (c) => {
      const id = c.req.param("id");
      const session = await getSessionInfo(id);
      if (!session) {
        return c.json(
          fail("session_not_found", "Session not found", { id }),
          404,
        );
      }

      const body = await c.req.json<unknown>().catch(() => ({}));
      const rec = isRecord(body) ? body : {};
      const tool = typeof rec.tool === "string" ? rec.tool : "Bash";
      const input = rec.input ?? { command: "echo 'synthetic permission demo'" };
      const event: NormalizedEvent = {
        id: ulid(),
        ts: Date.now(),
        type: "tool.permission_required",
        turnId: typeof rec.turnId === "string" ? rec.turnId : "dev-synthesis",
        toolCallId: ulid(),
        tool,
        input,
      };
      await insertNormalizedEvent(id, event);
      broker.publish(id, event);
      return c.json(ok({ accepted: true, toolCallId: event.toolCallId }));
    },
  );
}

/**
 * Rolls a project's file tree back to the pre-turn snapshot captured
 * before `turnId`. Refuses while a turn is running — a concurrent
 * restore would race with the adapter writing fresh files.
 */
sessionRoutes.post(
  "/api/projects/:projectId/checkpoints/:turnId/restore",
  async (c) => {
    const projectId = c.req.param("projectId");
    const turnId = c.req.param("turnId");
    const project = await getProjectDetail(projectId);
    if (!project) {
      return c.json(
        fail("project_not_found", "Project not found", { projectId }),
        404,
      );
    }

    if (!(await hasSnapshot(projectId, turnId))) {
      return c.json(
        fail("snapshot_not_found", "No pre-turn snapshot for this turn", {
          projectId,
          turnId,
        }),
        404,
      );
    }

    const session = await getLatestProjectSession(projectId);
    if (session && isUserTurnRunning(session.id)) {
      return c.json(
        fail("session_busy", "Cannot restore while a turn is running", {
          sessionId: session.id,
        }),
        409,
      );
    }

    const result = await restoreFromSnapshot(projectId, turnId);
    if (!result) {
      return c.json(
        fail("restore_failed", "Snapshot disappeared during restore", {
          projectId,
          turnId,
        }),
        500,
      );
    }

    await indexProjectFiles(projectId);
    if (session) {
      await appendSessionTrace(session.id, {
        level: "turn_restored",
        turnId,
        restoredAt: result.restoredAt,
        removed: result.removedEntries,
        copied: result.copiedEntries,
      });
    }
    return c.json(ok(result));
  },
);

sessionRoutes.get("/api/sessions/:id/stream", async (c) => {
  const id = c.req.param("id");
  const session = await getSessionInfo(id);
  if (!session) {
    return c.json(fail("session_not_found", "Session not found", { id }), 404);
  }

  return streamSSE(c, async (stream) => {
    const unsubscribe = broker.subscribe(id, async (event: NormalizedEvent) => {
      await stream.writeSSE({
        data: JSON.stringify(event),
        event: "message",
        id: event.id,
      });
    });

    // Heartbeat must fire inside Bun.serve's idleTimeout window (255s max)
    // to keep the SSE connection alive during long Claude Code runs.
    const heartbeat = setInterval(async () => {
      await stream.writeSSE({
        data: JSON.stringify({ type: "heartbeat", ts: Date.now() }),
        event: "heartbeat",
      });
    }, 8000);

    try {
      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener("abort", () => resolve(), { once: true });
      });
    } finally {
      clearInterval(heartbeat);
      unsubscribe();
    }
  });
});
