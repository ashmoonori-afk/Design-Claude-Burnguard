import { and, eq, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/bun-sqlite";
import { artifactOperationsTable } from "./pipeline-schema";
import { PipelineRepositoryError } from "./pipeline-repository";

type JsonRecord = Readonly<Record<string, unknown>>;
type CreateOperation = {
  readonly id: string;
  readonly projectId: string;
  readonly baseRevision: number;
  readonly baseDigest: string;
  readonly expectedRevision: number;
  readonly expectedFileHash: string;
  readonly nodeFingerprint: string;
  readonly diff: JsonRecord;
  readonly snapshot: JsonRecord;
  readonly retention: JsonRecord;
  readonly replay: JsonRecord;
  readonly createdAt: number;
};
type TransitionOperation = {
  readonly id: string;
  readonly from: "pending" | "working" | "recovering";
  readonly to: "working" | "committed" | "cancelled" | "failed" | "conflicted" | "recovered";
  readonly resultRevision: number | null;
  readonly resultDigest: string | null;
  readonly updatedAt: number;
};

type PipelineDatabase = ReturnType<typeof drizzle>;

export function createArtifactOperation(db: PipelineDatabase, input: CreateOperation) {
  return db.transaction((tx) => {
    const project = tx.get<readonly [number, string | null]>(sql`SELECT current_revision,current_digest FROM projects WHERE id=${input.projectId}`);
    if (project === undefined) throw new PipelineRepositoryError("not_found", input.projectId);
    if (project[0] !== input.expectedRevision || project[0] !== input.baseRevision || project[1] !== input.baseDigest) {
      throw new PipelineRepositoryError("expected_revision_conflict", input.projectId);
    }
    tx.insert(artifactOperationsTable).values({
      id: input.id,
      projectId: input.projectId,
      status: "working",
      baseRevision: input.baseRevision,
      baseDigest: input.baseDigest,
      resultRevision: null,
      resultDigest: null,
      expectedRevision: input.expectedRevision,
      expectedFileHash: input.expectedFileHash,
      nodeFingerprint: input.nodeFingerprint,
      diffJson: JSON.stringify(input.diff),
      snapshotJson: JSON.stringify(input.snapshot),
      retentionJson: JSON.stringify(input.retention),
      replayJson: JSON.stringify(input.replay),
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    }).run();
    return { id: input.id, status: "working" as const };
  });
}

export function transitionArtifactOperation(db: PipelineDatabase, input: TransitionOperation) {
  return db.transaction((tx) => {
    tx.update(artifactOperationsTable).set({
      status: input.to,
      resultRevision: input.resultRevision,
      resultDigest: input.resultDigest,
      updatedAt: input.updatedAt,
    }).where(and(eq(artifactOperationsTable.id, input.id), eq(artifactOperationsTable.status, input.from))).run();
    const operationChanged = tx.get<readonly [number]>(sql`SELECT changes()`);
    if (operationChanged?.[0] === 0) throw new PipelineRepositoryError("invalid_transition", input.id);
    if (input.to === "committed") {
      if (input.resultRevision === null || input.resultDigest === null) throw new PipelineRepositoryError("artifact_identity_mismatch", input.id);
      const operation = tx.select({ projectId: artifactOperationsTable.projectId, baseRevision: artifactOperationsTable.baseRevision }).from(artifactOperationsTable).where(eq(artifactOperationsTable.id, input.id)).limit(1).all()[0];
      if (operation === undefined) throw new PipelineRepositoryError("not_found", input.id);
      tx.run(sql`UPDATE projects SET current_revision=${input.resultRevision}, current_digest=${input.resultDigest}, updated_at=${input.updatedAt} WHERE id=${operation.projectId} AND current_revision=${operation.baseRevision}`);
      const projectChanged = tx.get<readonly [number]>(sql`SELECT changes()`);
      if (projectChanged?.[0] === 0) throw new PipelineRepositoryError("expected_revision_conflict", operation.projectId);
    }
    return { id: input.id, status: input.to, resultRevision: input.resultRevision, resultDigest: input.resultDigest };
  });
}
