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
import { broker, sequencedBroker } from "../services/broker";
import { subscribeBeforeBackfill } from "../services/sequenced-event-replay";
import {
  getVerifiedSnapshotPath,
} from "../services/checkpoints";
import { ArtifactCoordinator, ArtifactOperationError } from "../services/artifact-coordinator";
import { materializeManagedTree } from "../services/artifact-tree-storage";
import { getSqlite } from "../db/sqlite-client";
import { assertSafeName } from "../security/path-boundary";
import { appendSessionTrace } from "../services/trace";
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

async function persistAndPublishRoute(sessionId: string, event: NormalizedEvent): Promise<void> {
  const persisted = await insertNormalizedEvent(sessionId, event);
  broker.publish(sessionId, event);
  sequencedBroker.publish(sessionId, persisted);
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
  const afterRaw = c.req.query("after_sequence");
  const afterSequence = afterRaw ? Number.parseInt(afterRaw, 10) : 0;
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) return c.json(fail("invalid_sequence", "after_sequence must be a non-negative integer"), 400);
  const events = await listSessionEvents(id, afterSequence);
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
  let requestedOperationId: string | undefined;

  if (contentType.includes("application/json")) {
    const body = await c.req.json<unknown>().catch(() => null);
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
      if (body.operation_id !== undefined) {
        if (typeof body.operation_id !== "string" || process.env.BG_ARTIFACT_QA !== "1" || body.operation_id !== process.env.BG_ARTIFACT_TURN_OPERATION_ID) return c.json(fail("invalid_operation_id", "Scoped operation identity is invalid"), 400);
        try { requestedOperationId = assertSafeName(body.operation_id); }
        catch (error) { return c.json(fail("invalid_operation_id", error instanceof Error ? error.message : "Scoped operation identity is invalid"), 400); }
      }
    }
  } else if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const type = form.get("type");
    const text = form.get("text");
    if (type === "user.message" && typeof text === "string") {
      const fileEntries = form
        .getAll("files")
        .filter((value): value is File => value instanceof File);
      let attachmentPaths: string[];
      try {
        attachmentPaths = await saveSessionAttachments(id, fileEntries);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json(
          fail("invalid_attachments", "Attachment upload rejected", { message }),
          400,
        );
      }
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

  const turn = startUserTurn(id, payload, requestedOperationId);
  if (!turn) {
    return c.json(
      fail("session_busy", "A turn is already running for this session", { id }),
      409,
    );
  }

  const completed = turn.promise.catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    await persistAndPublishRoute(id, { id: ulid(), ts: Date.now(), type: "status.error", message, recoverable: true });
    await persistAndPublishRoute(id, { id: ulid(), ts: Date.now(), type: "status.idle", stopReason: "error" });
    await setSessionStatus(id, "idle");
  });
  try { await turn.prepared; }
  catch (error) {
    await completed;
    return c.json(fail("artifact_prepare_failed", error instanceof Error ? error.message : "Artifact operation preparation failed"), 500);
  }
  void completed;
  return c.json(ok({ accepted: true, turn_id: turn.turnId, operation_id: turn.operationId }));
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
    await persistAndPublishRoute(id, event);
    await setSessionStatus(id, "idle");
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
      await persistAndPublishRoute(id, idleEvent);
      await setSessionStatus(id, "idle");
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
      await persistAndPublishRoute(id, event);
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

    const snapshotPath = await getVerifiedSnapshotPath(projectId, turnId);
    if (snapshotPath === null) return c.json(fail("snapshot_not_found", "No verified pre-turn snapshot for this turn", { projectId, turnId }), 410);
    const body = await c.req.json<unknown>().catch(() => null);
    if (!isRecord(body) || typeof body.expected_revision !== "number" || typeof body.expected_artifact_digest !== "string") return c.json(fail("invalid_artifact_identity", "Expected artifact identity is required"), 400);

    const session = await getLatestProjectSession(projectId);
    if (session && isUserTurnRunning(session.id)) {
      return c.json(
        fail("session_busy", "Cannot restore while a turn is running", {
          sessionId: session.id,
        }),
        409,
      );
    }

    let operationId: string | undefined;
    if (body.operation_id !== undefined) {
      if (typeof body.operation_id !== "string" || process.env.BG_ARTIFACT_QA !== "1" || body.operation_id !== process.env.BG_ARTIFACT_FAULT_OPERATION_ID) return c.json(fail("invalid_operation_id", "Scoped operation identity is invalid"), 400);
      try { operationId = assertSafeName(body.operation_id); }
      catch (error) { return c.json(fail("invalid_operation_id", error instanceof Error ? error.message : "Scoped operation identity is invalid"), 400); }
    }
    try {
      let publicationWrites = 0;
      const coordinator = new ArtifactCoordinator(getSqlite(), operationId !== undefined && operationId === process.env.BG_ARTIFACT_FAULT_OPERATION_ID ? { afterPublishWrite: () => { publicationWrites += 1; if (publicationWrites === 1) process.kill(process.pid, "SIGKILL"); } } : {});
      if (project.current_digest === null) await coordinator.initialize(projectId, project.dir_path);
      const result = await coordinator.run({ projectId, projectDir: project.dir_path, kind: "restore", operationId, expectedRevision: body.expected_revision, expectedArtifactDigest: body.expected_artifact_digest, mutate: async (stage) => { await materializeManagedTree(snapshotPath, stage); } });
      if (session) await appendSessionTrace(session.id, { level: "turn_restored", turnId, operationId: result.id, revision: result.resultRevision, digest: result.resultDigest });
      return c.json(ok({ operation_id: result.id, status: result.status, base_revision: result.baseRevision, base_digest: result.baseDigest, result_revision: result.resultRevision, result_digest: result.resultDigest, diff: result.diff }));
    } catch (error) {
      if (error instanceof ArtifactOperationError) return c.json(fail(error.code, error.message), 409);
      throw error;
    }
  },
);

sessionRoutes.get("/api/sessions/:id/stream", async (c) => {
  const id = c.req.param("id");
  const session = await getSessionInfo(id);
  if (!session) {
    return c.json(fail("session_not_found", "Session not found", { id }), 404);
  }

  return streamSSE(c, async (stream) => {
    let closed = false;
    let heartbeat: Timer | null = null;
    let unsubscribe = () => {};
    const closeAndCleanup = () => {
      closed = true;
      if (heartbeat !== null) clearInterval(heartbeat);
      unsubscribe();
    };
    const headerCursor = c.req.header("Last-Event-ID");
    const queryCursor = c.req.query("after_sequence");
    const cursor = Number.parseInt(headerCursor ?? queryCursor ?? "0", 10);
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("invalid_sequence_cursor");
    unsubscribe = await subscribeBeforeBackfill({
      afterSequence: cursor,
      subscribe: (listener) => sequencedBroker.subscribe(id, listener),
      backfill: async (afterSequence) => listSessionEvents(id, afterSequence),
      emit: async (item) => {
        if (closed) return;
        await stream.writeSSE({ data: JSON.stringify(item), event: "message", id: String(item.sequence) });
      },
    });

    // Heartbeat must fire inside Bun.serve's idleTimeout window (255s max)
    // to keep the SSE connection alive during long Claude Code runs.
    // 30 s is well below the limit but doesn't burn round-trips on idle
    // tabs; the previous 8 s value was a holdover from a smaller
    // idleTimeout.
    heartbeat = setInterval(() => {
      if (closed) {
        if (heartbeat !== null) clearInterval(heartbeat);
        return;
      }
      // Fire-and-forget but trap the promise — an unhandled rejection
      // here used to leak on every disconnected stream.
      void stream
        .writeSSE({
          data: JSON.stringify({ type: "heartbeat", ts: Date.now() }),
          event: "heartbeat",
        })
        .catch(() => {
          closeAndCleanup();
        });
    }, 30_000);

    try {
      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener("abort", () => resolve(), { once: true });
      });
    } finally {
      closeAndCleanup();
    }
  });
});
