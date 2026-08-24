import type { Database } from "bun:sqlite";
import { ulid } from "ulid";
import type { ExportAttemptStatus, ExportProgress, ExportStopReason, NormalizedEvent } from "@bg/shared";
import { insertSequencedEvent } from "../db/sequenced-event-writer";
import { broker, sequencedBroker } from "./broker";

export function publishExportAttemptEvent(db: Database, input: {
  readonly projectId: string;
  readonly jobId: string;
  readonly attemptId: string;
  readonly status: ExportAttemptStatus;
  readonly progress: ExportProgress;
  readonly projectRevision: number;
  readonly projectDigest: string;
  readonly stopReason: ExportStopReason | null;
}): void {
  const session = db.query<{ readonly id: string }, [string]>("SELECT id FROM sessions WHERE project_id=? ORDER BY updated_at DESC LIMIT 1").get(input.projectId);
  if (session === null) return;
  const event: NormalizedEvent = { id: ulid(), ts: Date.now(), type: "export.attempt", jobId: input.jobId, attemptId: input.attemptId, status: input.status, progress: input.progress, projectRevision: input.projectRevision, projectDigest: input.projectDigest, stopReason: input.stopReason };
  const stored = insertSequencedEvent(db, { id: event.id, sessionId: session.id, direction: "down", type: event.type, payload: event, turnId: null, processedAt: event.ts, createdAt: event.ts });
  const envelope = { sequence: stored.sequence, event };
  broker.publish(session.id, event); sequencedBroker.publish(session.id, envelope);
}
