import { inArray, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/bun-sqlite";
import { artifactOperationsTable, designSystemReceiptsTable, exportAttemptsTable } from "./pipeline-schema";

export { PipelineRepositoryError, parseJsonArray, parseJsonRecord } from "./pipeline-errors";

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
