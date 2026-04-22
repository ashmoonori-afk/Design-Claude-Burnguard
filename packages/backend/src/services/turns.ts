import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ulid } from "ulid";
import type { NormalizedEvent, UserEvent } from "@bg/shared";
import {
  bumpSessionUsage,
  insertNormalizedEvent,
  insertUserEvent,
  setSessionStatus,
} from "../db/events";
import { broker } from "./broker";
import { buildSessionContext } from "./context";
import { writeTurnCheckpoint } from "./checkpoints";
import { indexProjectFiles } from "./files";
import { appendSessionTrace } from "./trace";

function now() {
  return Date.now();
}

function createPrototypeHtml(projectName: string, prompt: string) {
  const title = escapeHtml(projectName);
  const body = escapeHtml(prompt);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f7f4ee; color: #18232d; }
    main { min-height: 100vh; display: grid; place-items: center; padding: 48px; }
    section { max-width: 960px; background: #ffffff; border: 1px solid #e7e0d6; border-radius: 24px; padding: 56px; box-shadow: 0 20px 60px rgba(24,35,45,0.08); }
    .eyebrow { color: #e06b4c; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 20px; }
    h1 { margin: 0; font-size: 64px; line-height: 0.95; letter-spacing: -0.04em; }
    p { margin-top: 24px; font-size: 20px; line-height: 1.7; color: #52616c; }
  </style>
</head>
<body>
  <main>
    <section data-bg-node-id="hero-card">
      <div class="eyebrow" data-bg-node-id="hero-eyebrow">BurnGuard Preview</div>
      <h1 data-bg-node-id="hero-title">${title}</h1>
      <p data-bg-node-id="hero-copy">${body}</p>
    </section>
  </main>
</body>
</html>`;
}

function createDeckHtml(projectName: string, prompt: string) {
  const title = escapeHtml(projectName);
  const body = escapeHtml(prompt);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; background: #101318; color: white; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .slide { min-height: 100vh; padding: 72px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; }
    .eyebrow { color: #e06b4c; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 20px; }
    h1 { margin: 0; font-size: 88px; line-height: 0.94; letter-spacing: -0.05em; max-width: 900px; }
    p { margin-top: 28px; max-width: 760px; color: rgba(255,255,255,0.74); font-size: 22px; line-height: 1.6; }
  </style>
</head>
<body>
  <section class="slide" data-bg-node-id="slide-root">
    <div class="eyebrow" data-bg-node-id="slide-eyebrow">BurnGuard Deck</div>
    <h1 data-bg-node-id="slide-title">${title}</h1>
    <p data-bg-node-id="slide-copy">${body}</p>
  </section>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function persistAndPublish(sessionId: string, event: NormalizedEvent) {
  await insertNormalizedEvent(sessionId, event);
  await appendSessionTrace(sessionId, {
    level: "event",
    event,
  });
  broker.publish(sessionId, event);
}

export async function runUserTurn(sessionId: string, payload: Extract<UserEvent, { type: "user.message" }>) {
  const sessionContext = await buildSessionContext(sessionId);
  const context = sessionContext?.project;
  if (!context) {
    throw new Error("session_not_found");
  }

  await insertUserEvent(sessionId, payload);
  await appendSessionTrace(sessionId, {
    level: "input",
    payload,
    attachment_count: sessionContext.attachments.length,
  });
  await setSessionStatus(sessionId, "running");

  const turnId = ulid();
  const ts = now();
  const entrypointPath = path.join(context.project_dir, context.entrypoint);

  const statusRunning: NormalizedEvent = {
    id: ulid(),
    ts,
    type: "status.running",
  };
  await persistAndPublish(sessionId, statusRunning);

  const thinking: NormalizedEvent = {
    id: ulid(),
    ts: ts + 10,
    type: "chat.thinking",
    turnId,
    text: `Reading the ${context.project_type} brief and preparing the first draft...`,
  };
  await persistAndPublish(sessionId, thinking);

  const toolStarted: NormalizedEvent = {
    id: ulid(),
    ts: ts + 20,
    type: "tool.started",
    turnId,
    toolCallId: `tool-${turnId}`,
    tool: "Write",
    input: { file_path: context.entrypoint },
  };
  await persistAndPublish(sessionId, toolStarted);

  await mkdir(path.dirname(entrypointPath), { recursive: true });
  const html =
    context.project_type === "slide_deck"
      ? createDeckHtml(context.project_name, promptSummary(payload.text, sessionContext.attachments.map((attachment) => attachment.original_name)))
      : createPrototypeHtml(context.project_name, promptSummary(payload.text, sessionContext.attachments.map((attachment) => attachment.original_name)));
  await writeFile(entrypointPath, html, "utf8");
  await indexProjectFiles(context.project_id);

  const toolFinished: NormalizedEvent = {
    id: ulid(),
    ts: ts + 40,
    type: "tool.finished",
    turnId,
    toolCallId: `tool-${turnId}`,
    tool: "Write",
    ok: true,
    output: { file_path: context.entrypoint },
  };
  await persistAndPublish(sessionId, toolFinished);

  const fileChanged: NormalizedEvent = {
    id: ulid(),
    ts: ts + 50,
    type: "file.changed",
    turnId,
    action: "edited",
    path: context.entrypoint,
  };
  await persistAndPublish(sessionId, fileChanged);

  const chatDelta1: NormalizedEvent = {
    id: ulid(),
    ts: ts + 60,
    type: "chat.delta",
    turnId,
    text: `I created a first draft for ${context.project_name}. `,
  };
  await persistAndPublish(sessionId, chatDelta1);

  const chatDelta2: NormalizedEvent = {
    id: ulid(),
    ts: ts + 70,
    type: "chat.delta",
    turnId,
    text: `The current artifact is available in ${context.entrypoint} and reflects your request: "${payload.text}".`,
  };
  await persistAndPublish(sessionId, chatDelta2);

  const messageEnd: NormalizedEvent = {
    id: ulid(),
    ts: ts + 80,
    type: "chat.message_end",
    turnId,
  };
  await persistAndPublish(sessionId, messageEnd);

  const usage: NormalizedEvent = {
    id: ulid(),
    ts: ts + 90,
    type: "usage.delta",
    input: Math.max(24, Math.ceil(payload.text.length / 3)),
    output: 180,
    cached: 0,
  };
  await persistAndPublish(sessionId, usage);
  await bumpSessionUsage(sessionId, {
    input: usage.input,
    output: usage.output,
    cached: usage.cached,
  });

  const statusIdle: NormalizedEvent = {
    id: ulid(),
    ts: ts + 100,
    type: "status.idle",
    stopReason: "end_turn",
  };
  await persistAndPublish(sessionId, statusIdle);
  await setSessionStatus(sessionId, "idle");
  const checkpoint = await writeTurnCheckpoint(context.project_id, turnId);
  await appendSessionTrace(sessionId, {
    level: "turn_complete",
    turnId,
    checkpoint,
  });
}

function promptSummary(prompt: string, attachmentNames: string[]) {
  if (attachmentNames.length === 0) {
    return prompt;
  }

  return `${prompt}\n\nAttachments referenced: ${attachmentNames.join(", ")}`;
}
