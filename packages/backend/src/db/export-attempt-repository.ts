import { createHash } from "node:crypto";
import { UpgradeContractError, parseExportOptions } from "@bg/shared/export";
import type { ExportFormat, ExportOptions } from "@bg/shared/export";
import { eq, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/bun-sqlite";
import { exportAttemptsTable } from "./pipeline-schema";
import { PipelineRepositoryError, parseJsonArray, parseJsonRecord } from "./pipeline-repository";

type JsonRecord = Readonly<Record<string, unknown>>;
type Digests = {
  readonly options: string;
  readonly input_closure: string | null;
  readonly renderer: string;
  readonly capture: string;
  readonly output: string | null;
  readonly receipt: string | null;
};
type AttemptInput = {
  readonly id: string;
  readonly jobId: string;
  readonly parentAttemptId: string | null;
  readonly projectRevision: number;
  readonly projectDigest: string;
  readonly designSystemDigest?: string | null;
  readonly status: "pending" | "running" | "validating" | "validated" | "failed" | "cancelled" | "retrying" | "recovering" | "expired" | "corrupt";
  readonly progress: JsonRecord;
  readonly stopReason?: string | null;
  readonly digests: Digests;
  readonly findings: readonly unknown[];
  readonly retention: JsonRecord;
  readonly createdAt: number;
};

type RetryInput = { readonly id: string; readonly parentAttemptId: string; readonly createdAt: number };

type PipelineDatabase = ReturnType<typeof drizzle>;

export function createExportAttempt(db: PipelineDatabase, input: AttemptInput) {
  db.transaction((tx) => {
    const job = tx.get<readonly [string, ExportFormat]>(sql`SELECT options_json,format FROM exports WHERE id=${input.jobId}`);
    if (job === undefined) throw new PipelineRepositoryError("not_found", input.jobId);
    const canonicalOptions = canonicalExportOptions(job[0], job[1], input.id);
    const canonicalOptionsJson = JSON.stringify(canonicalOptions);
    tx.insert(exportAttemptsTable).values({
      id: input.id,
      jobId: input.jobId,
      parentAttemptId: input.parentAttemptId,
      status: input.status,
      progressJson: JSON.stringify(input.progress),
      stopReason: input.stopReason ?? null,
      projectRevision: input.projectRevision,
      projectDigest: input.projectDigest,
      designSystemDigest: input.designSystemDigest ?? null,
      canonicalOptionsJson,
      optionsDigest: digest(canonicalOptionsJson),
      inputClosureDigest: input.digests.input_closure,
      rendererDigest: input.digests.renderer,
      captureDigest: input.digests.capture,
      outputDigest: input.digests.output,
      receiptDigest: input.digests.receipt,
      findingsJson: JSON.stringify(input.findings),
      retentionJson: JSON.stringify(input.retention),
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    }).run();
  });
  return getExportAttempt(db, input.id);
}

export function createExportRetry(db: PipelineDatabase, input: RetryInput) {
  return db.transaction((tx) => {
    const parent = tx.select().from(exportAttemptsTable).where(eq(exportAttemptsTable.id, input.parentAttemptId)).limit(1).all()[0];
    if (parent === undefined) throw new PipelineRepositoryError("not_found", input.parentAttemptId);
    const job = tx.get<readonly [ExportFormat]>(sql`SELECT format FROM exports WHERE id=${parent.jobId}`);
    if (job === undefined) throw new PipelineRepositoryError("not_found", parent.jobId);
    const canonicalOptions = canonicalExportOptions(parent.canonicalOptionsJson, job[0], parent.id);
    if (digest(parent.canonicalOptionsJson) !== parent.optionsDigest) throw new PipelineRepositoryError("invalid_options", parent.id);
    tx.insert(exportAttemptsTable).values({
      ...parent,
      id: input.id,
      parentAttemptId: parent.id,
      status: "retrying",
      progressJson: JSON.stringify({ stage: "queued", completed: 0, total: 1 }),
      stopReason: null,
      findingsJson: "[]",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    }).run();
    return { ...getExportAttempt(db, input.id), canonicalOptions };
  });
}

export function getExportAttempt(db: PipelineDatabase, id: string) {
  const row = db.select().from(exportAttemptsTable).where(eq(exportAttemptsTable.id, id)).limit(1).all()[0];
  if (row === undefined) throw new PipelineRepositoryError("not_found", id);
  const job = db.get<readonly [ExportFormat]>(sql`SELECT format FROM exports WHERE id=${row.jobId}`);
  if (job === undefined) throw new PipelineRepositoryError("not_found", row.jobId);
  const canonicalOptions = canonicalExportOptions(row.canonicalOptionsJson, job[0], row.id);
  if (digest(row.canonicalOptionsJson) !== row.optionsDigest) throw new PipelineRepositoryError("invalid_options", row.id);
  return {
    id: row.id,
    jobId: row.jobId,
    parentAttemptId: row.parentAttemptId,
    status: row.status,
    stopReason: row.stopReason,
    projectRevision: row.projectRevision,
    projectDigest: row.projectDigest,
    designSystemDigest: row.designSystemDigest,
    canonicalOptions,
    progress: parseJsonRecord(row.progressJson, row.id),
    digests: { options: row.optionsDigest, input_closure: row.inputClosureDigest, renderer: row.rendererDigest, capture: row.captureDigest, output: row.outputDigest, receipt: row.receiptDigest },
    findings: parseJsonArray(row.findingsJson, row.id),
    retention: parseJsonRecord(row.retentionJson, row.id),
  };
}

function canonicalExportOptions(value: string, format: ExportFormat, id: string): ExportOptions {
  try {
    return parseExportOptions(format, value);
  } catch (error) {
    if (error instanceof UpgradeContractError) throw new PipelineRepositoryError("invalid_options", id);
    throw error;
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
