import { UpgradeContractError, parseLearningNextContext } from "@bg/shared/learning-contract";
import type { LearningNextContext } from "@bg/shared/learning-contract";
import { and, eq, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/bun-sqlite";
import { learningCheckpointsTable, learningProgressTable } from "./pipeline-schema";
import { PipelineRepositoryError } from "./pipeline-repository";

type ProgressInput = {
  readonly itemId: string;
  readonly expectedRevision: number;
  readonly state: "not_started" | "in_progress" | "completed";
  readonly feedbackDraft: string | null;
  readonly updatedAt: number;
};
type CheckpointInput = {
  readonly id: string;
  readonly itemId: string;
  readonly projectId: string;
  readonly artifactRevision: number;
  readonly artifactDigest: string;
  readonly parentCheckpointId: string | null;
  readonly feedback: string;
  readonly nextContext: LearningNextContext;
  readonly createdAt: number;
};
type Checkpoint = {
  readonly id: string;
  readonly artifactRevision: number;
  readonly artifactDigest: string;
  readonly nextContext: LearningNextContext;
};

type PipelineDatabase = ReturnType<typeof drizzle>;

export function updateLearningProgress(db: PipelineDatabase, input: ProgressInput) {
  db.update(learningProgressTable).set({
    state: input.state,
    revision: input.expectedRevision + 1,
    feedbackDraft: input.feedbackDraft,
    updatedAt: input.updatedAt,
  }).where(and(
    eq(learningProgressTable.itemId, input.itemId),
    eq(learningProgressTable.revision, input.expectedRevision),
  )).run();
  const changed = db.get<readonly [number]>(sql`SELECT changes()`);
  if (changed?.[0] === 0) throw new PipelineRepositoryError("expected_revision_conflict", input.itemId);
  return { itemId: input.itemId, revision: input.expectedRevision + 1, state: input.state, feedbackDraft: input.feedbackDraft };
}

export function createLearningCheckpoint(db: PipelineDatabase, input: CheckpointInput): Checkpoint {
  const project = db.get<readonly [number, string | null]>(sql`SELECT current_revision,current_digest FROM projects WHERE id=${input.projectId}`);
  if (project === undefined) throw new PipelineRepositoryError("not_found", input.projectId);
  if (project[0] !== input.artifactRevision || project[1] !== input.artifactDigest || input.nextContext.artifact_revision !== input.artifactRevision || input.nextContext.artifact_digest !== input.artifactDigest) {
    throw new PipelineRepositoryError("artifact_identity_mismatch", input.id);
  }
  db.insert(learningCheckpointsTable).values({
    id: input.id,
    itemId: input.itemId,
    projectId: input.projectId,
    parentCheckpointId: input.parentCheckpointId,
    artifactRevision: input.artifactRevision,
    artifactDigest: input.artifactDigest,
    feedback: input.feedback,
    nextContextJson: JSON.stringify(input.nextContext),
    createdAt: input.createdAt,
  }).run();
  return { id: input.id, artifactRevision: input.artifactRevision, artifactDigest: input.artifactDigest, nextContext: input.nextContext };
}

export function getLearningCheckpoint(db: PipelineDatabase, id: string): Checkpoint {
  const row = db.select().from(learningCheckpointsTable).where(eq(learningCheckpointsTable.id, id)).limit(1).all()[0];
  if (row === undefined) throw new PipelineRepositoryError("not_found", id);
  try {
    const nextContext = parseLearningNextContext(row.nextContextJson);
    if (nextContext.artifact_revision !== row.artifactRevision || nextContext.artifact_digest !== row.artifactDigest) {
      throw new PipelineRepositoryError("corrupt_json", row.id);
    }
    return { id: row.id, artifactRevision: row.artifactRevision, artifactDigest: row.artifactDigest, nextContext };
  } catch (error) {
    if (error instanceof UpgradeContractError) throw new PipelineRepositoryError("corrupt_json", row.id);
    throw error;
  }
}
