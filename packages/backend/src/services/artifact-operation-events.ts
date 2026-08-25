import type { Database } from "bun:sqlite";
import { ulid } from "ulid";
import type { NormalizedEvent } from "@bg/shared/events";
import { insertSequencedEvent } from "../db/event-sequence-repository";
import { broker, sequencedBroker } from "./broker";
import type { ArtifactFileDiff } from "./artifact-tree-storage";

export function publishArtifactOperationEvent(
  db: Database,
  input: {
    readonly projectId: string;
    readonly operationId: string;
    readonly revision: number;
    readonly digest: string;
    readonly outcome: "committed" | "cancelled" | "failed" | "conflicted" | "recovered";
    readonly diff: readonly ArtifactFileDiff[];
  },
): void {
  const session = db.query<{ readonly id: string }, [string]>("SELECT id FROM sessions WHERE project_id=? ORDER BY updated_at DESC LIMIT 1").get(input.projectId);
  if (session === null) return;
  const event: NormalizedEvent = { id: ulid(), ts: Date.now(), type: "artifact.operation", operationId: input.operationId, revision: input.revision, digest: input.digest, changedPaths: input.diff.map((entry) => entry.path), outcome: input.outcome };
  const stored = insertSequencedEvent(db, { id: event.id, sessionId: session.id, direction: "down", type: event.type, payload: event, turnId: null, processedAt: event.ts, createdAt: event.ts });
  const envelope = { sequence: stored.sequence, event };
  broker.publish(session.id, event);
  sequencedBroker.publish(session.id, envelope);
}
