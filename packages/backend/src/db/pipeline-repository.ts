import { inArray, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/bun-sqlite";
import { artifactOperationsTable, designSystemReceiptsTable, exportAttemptsTable } from "./pipeline-schema";

export type PipelineErrorCode =
  | "artifact_identity_mismatch"
  | "content_receipt_mismatch"
  | "corrupt_json"
  | "corrupt_tag"
  | "expected_revision_conflict"
  | "invalid_options"
  | "invalid_transition"
  | "not_found";

export class PipelineRepositoryError extends Error {
  readonly name = "PipelineRepositoryError";

  constructor(
    readonly code: PipelineErrorCode,
    readonly entityId: string,
  ) {
    super(`${code}: ${entityId}`);
  }
}

export function parseJsonRecord(value: string, entityId: string): Readonly<Record<string, unknown>> {
  const parsed = parseJson(value, entityId);
  if (!isJsonRecord(parsed)) throw new PipelineRepositoryError("corrupt_json", entityId);
  return parsed;
}

export function parseJsonArray(value: string, entityId: string): readonly unknown[] {
  const parsed = parseJson(value, entityId);
  if (!Array.isArray(parsed)) throw new PipelineRepositoryError("corrupt_json", entityId);
  return parsed;
}

type PipelineDatabase = ReturnType<typeof drizzle>;
export type ReconciliationReceipt = { readonly receipts: number; readonly operations: number; readonly attempts: number };

export function reconcilePipelineRows(db: PipelineDatabase, now = Date.now()): ReconciliationReceipt {
  return db.transaction((tx) => {
    tx.update(designSystemReceiptsTable).set({ status: "recovering", updatedAt: now }).where(inArray(designSystemReceiptsTable.status, ["prepared"])).run();
    const receipts = tx.get<readonly [number]>(sql`SELECT changes()`)?.[0] ?? 0;
    tx.update(artifactOperationsTable).set({ status: "recovering", updatedAt: now }).where(inArray(artifactOperationsTable.status, ["pending", "working"])).run();
    const operations = tx.get<readonly [number]>(sql`SELECT changes()`)?.[0] ?? 0;
    tx.update(exportAttemptsTable).set({ status: "recovering", updatedAt: now }).where(inArray(exportAttemptsTable.status, ["pending", "running", "validating", "retrying"])).run();
    const attempts = tx.get<readonly [number]>(sql`SELECT changes()`)?.[0] ?? 0;
    return { receipts, operations, attempts };
  });
}

function parseJson(value: string, entityId: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    if (error instanceof SyntaxError) throw new PipelineRepositoryError("corrupt_json", entityId);
    throw error;
  }
}

function isJsonRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
