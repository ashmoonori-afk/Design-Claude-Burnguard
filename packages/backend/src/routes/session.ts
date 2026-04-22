import { ulid } from "ulid";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ApiErrorBody, ApiSuccess, NormalizedEvent, UserEvent } from "@bg/shared";
import { insertNormalizedEvent, listSessionEvents, setSessionStatus } from "../db/events";
import { getSessionInfo } from "../db/seed";
import { saveSessionAttachments } from "../services/attachments";
import { broker } from "../services/broker";
import { isUserTurnRunning, startUserTurn } from "../services/turns";

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

  const event: NormalizedEvent = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    type: "status.idle",
    stopReason: "interrupted",
  };
  await insertNormalizedEvent(id, event);
  await setSessionStatus(id, "idle");
  broker.publish(id, event);
  return c.json(ok({ accepted: true }));
});

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
