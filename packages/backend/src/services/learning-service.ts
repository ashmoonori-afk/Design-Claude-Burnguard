import type { Database } from "bun:sqlite";
import type { CheckpointInput, ItemInput, ProgressInput } from "../routes/learning-input";
import {
  commitStoredCheckpoint, createLearningItem, duplicateLearningItem, getLearningItem, LEARNING_SEEDS,
  renameLearningItem, resetStoredProgress, setLearningDeleted, updateStoredProgress,
} from "../db/learning-store";

export class LearningCommitFaultError extends Error {
  readonly name = "LearningCommitFaultError";
  constructor(readonly checkpointId: string) { super(`checkpoint fault before commit: ${checkpointId}`); }
}

export function seedLearningItems(db: Database, now = Date.now()): number {
  let inserted = 0;
  const statement = db.prepare("INSERT OR IGNORE INTO learning_items (id,kind,title,content_json,project_id,parent_item_id,created_at,updated_at) VALUES (?,?,?,?,NULL,NULL,?,?)");
  db.transaction(() => {
    for (const seed of LEARNING_SEEDS) {
      const envelope = JSON.stringify({ schema_revision: 1, owner: "system", seed_key: seed.seedKey, revision: 0, content: { summary: seed.summary } });
      const result = statement.run(seed.id, seed.kind, seed.title, envelope, now, now);
      if (result.changes === 1) {
        db.prepare("INSERT INTO learning_progress (item_id,state,revision,feedback_draft,updated_at) VALUES (?,'not_started',0,NULL,?)").run(seed.id, now);
        inserted += 1;
      }
    }
  })();
  return inserted;
}

export function createItem(db: Database, input: ItemInput) { return createLearningItem(db, input); }
export function readItem(db: Database, id: string) { return getLearningItem(db, id); }
export function renameItem(db: Database, id: string, input: { readonly expectedRevision: number; readonly title: string }) { return renameLearningItem(db, { id, ...input }); }
export function duplicateItem(db: Database, sourceId: string, input: { readonly id: string; readonly title: string }) { return duplicateLearningItem(db, { sourceId, ...input }); }
export function changeProgress(db: Database, id: string, input: ProgressInput) { return updateStoredProgress(db, id, input); }
export function resetProgress(db: Database, id: string, expectedRevision: number) { return resetStoredProgress(db, id, expectedRevision); }
export function deleteItem(db: Database, id: string, expectedRevision: number) { return setLearningDeleted(db, id, expectedRevision, true); }
export function restoreItem(db: Database, id: string, expectedRevision: number) { return setLearningDeleted(db, id, expectedRevision, false); }
export function commitCheckpoint(db: Database, itemId: string, input: CheckpointInput) {
  if (input.evidence.kind === "partial") return { checkpoint: null, warning: { code: "partial_evidence" as const, evidence_code: input.evidence.code } };
  if (process.env["BG_LEARNING_FAULT_BEFORE_CHECKPOINT_ID"] === input.id) throw new LearningCommitFaultError(input.id);
  const item = commitStoredCheckpoint(db, {
    id: input.id, itemId, projectId: input.projectId, artifactRevision: input.artifactRevision, artifactDigest: input.artifactDigest,
    feedback: input.feedback, parentCheckpointId: input.parentCheckpointId, nextContext: input.nextContext, createdAt: Date.now(),
  });
  return { checkpoint: item.checkpoint, warning: null };
}
