import type { Database } from "bun:sqlite";
import type { NormalizedEvent, UserEvent } from "@bg/shared";
import { PipelineRepositoryError, parseJsonRecord } from "./pipeline-repository";

type SequencedEventInput = {
  readonly id: string;
  readonly sessionId: string;
  readonly direction: "up" | "down";
  readonly type: string;
  readonly payload: unknown;
  readonly turnId: string | null;
  readonly processedAt: number;
  readonly createdAt: number;
};

export function parsePersistedNormalizedEvent(value: string, id: string): NormalizedEvent {
  const item = parseJsonRecord(value, id);
  const type = text(item, "type", id);
  const base = { id: text(item, "id", id), ts: integer(item, "ts", id) };
  switch (type) {
    case "chat.user_message":
      return { ...base, type, turnId: text(item, "turnId", id), text: text(item, "text", id), attachmentCount: integer(item, "attachmentCount", id) };
    case "chat.delta":
    case "chat.thinking":
      return { ...base, type, turnId: text(item, "turnId", id), text: text(item, "text", id) };
    case "chat.message_end":
      return { ...base, type, turnId: text(item, "turnId", id) };
    case "tool.started":
    case "tool.permission_required":
      return { ...base, type, turnId: text(item, "turnId", id), toolCallId: text(item, "toolCallId", id), tool: text(item, "tool", id), input: item["input"] };
    case "tool.finished": {
      const output = item["output"];
      const common = { ...base, type, turnId: text(item, "turnId", id), toolCallId: text(item, "toolCallId", id), tool: text(item, "tool", id), ok: truth(item, "ok", id) };
      return output === undefined ? common : { ...common, output };
    }
    case "file.changed":
      return { ...base, type, turnId: text(item, "turnId", id), action: fileAction(item, id), path: text(item, "path", id) };
    case "status.running":
      return { ...base, type };
    case "status.idle":
      return { ...base, type, stopReason: stopReason(item, id) };
    case "status.error":
      return { ...base, type, message: text(item, "message", id), recoverable: truth(item, "recoverable", id) };
    case "usage.delta": {
      const cached = item["cached"];
      const common = { ...base, type, input: integer(item, "input", id), output: integer(item, "output", id) };
      return cached === undefined ? common : { ...common, cached: integer(item, "cached", id) };
    }
    default:
      throw new PipelineRepositoryError("corrupt_json", id);
  }
}

export function parsePersistedUserEvent(value: string, id: string): UserEvent {
  const item = parseJsonRecord(value, id);
  const type = text(item, "type", id);
  switch (type) {
    case "user.message": {
      const attachments = item["attachments"];
      const common = { type, text: text(item, "text", id) };
      if (attachments === undefined) return common;
      if (!Array.isArray(attachments) || !attachments.every((entry) => typeof entry === "string")) throw new PipelineRepositoryError("corrupt_json", id);
      return { ...common, attachments };
    }
    case "user.interrupt":
      return { type };
    case "user.tool_decision": {
      const reason = item["reason"];
      const common = { type, toolCallId: text(item, "toolCallId", id), decision: decision(item, id) };
      if (reason === undefined) return common;
      if (typeof reason !== "string") throw new PipelineRepositoryError("corrupt_json", id);
      return { ...common, reason };
    }
    default:
      throw new PipelineRepositoryError("corrupt_json", id);
  }
}

export function insertSequencedEvent(db: Database, input: SequencedEventInput) {
  return db.transaction(() => {
    const row = db.query<{ readonly next: number }, [string]>(
      "SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM events WHERE session_id = ?",
    ).get(input.sessionId);
    const sequence = row?.next ?? 1;
    db.prepare("INSERT INTO events (id,session_id,direction,type,payload_json,turn_id,processed_at,created_at,sequence) VALUES (?,?,?,?,?,?,?,?,?)").run(
      input.id,
      input.sessionId,
      input.direction,
      input.type,
      JSON.stringify(input.payload),
      input.turnId,
      input.processedAt,
      input.createdAt,
      sequence,
    );
    return { id: input.id, sequence };
  })();
}

function text(item: Readonly<Record<string, unknown>>, key: string, id: string): string {
  const value = item[key];
  if (typeof value !== "string" || value.length === 0) throw new PipelineRepositoryError("corrupt_json", id);
  return value;
}

function integer(item: Readonly<Record<string, unknown>>, key: string, id: string): number {
  const value = item[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new PipelineRepositoryError("corrupt_json", id);
  return value;
}

function truth(item: Readonly<Record<string, unknown>>, key: string, id: string): boolean {
  const value = item[key];
  if (typeof value !== "boolean") throw new PipelineRepositoryError("corrupt_json", id);
  return value;
}

function fileAction(item: Readonly<Record<string, unknown>>, id: string): "created" | "edited" | "deleted" {
  const value = text(item, "action", id);
  switch (value) {
    case "created": case "edited": case "deleted": return value;
    default: throw new PipelineRepositoryError("corrupt_json", id);
  }
}

function stopReason(item: Readonly<Record<string, unknown>>, id: string): "end_turn" | "requires_action" | "interrupted" | "error" {
  const value = text(item, "stopReason", id);
  switch (value) {
    case "end_turn": case "requires_action": case "interrupted": case "error": return value;
    default: throw new PipelineRepositoryError("corrupt_json", id);
  }
}

function decision(item: Readonly<Record<string, unknown>>, id: string): "allow" | "deny" {
  const value = text(item, "decision", id);
  switch (value) {
    case "allow": case "deny": return value;
    default: throw new PipelineRepositoryError("corrupt_json", id);
  }
}
