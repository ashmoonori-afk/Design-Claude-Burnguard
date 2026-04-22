import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ApiErrorBody, ApiSuccess, NormalizedEvent, UserEvent } from "@bg/shared";
import { insertNormalizedEvent, listSessionEvents, setSessionStatus } from "../db/events";
import { getSessionInfo } from "../db/seed";
import { saveSessionAttachments } from "../services/attachments";
import { broker } from "../services/broker";
import { runUserTurn } from "../services/turns";

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

  await runUserTurn(id, payload);
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

    const heartbeat = setInterval(async () => {
      await stream.writeSSE({
        data: JSON.stringify({ type: "heartbeat", ts: Date.now() }),
        event: "heartbeat",
      });
    }, 15000);

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
