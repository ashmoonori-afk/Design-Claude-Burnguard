import { readFile, stat } from "node:fs/promises";
import { parseExportOptions, type ExportFormat } from "@bg/shared";
import { markExportAttemptCorrupt } from "../db/export-lifecycle-repository";
import { getExportJob } from "../db/exports";
import { getSqlite } from "../db/sqlite-client";
import { exportsDir } from "../lib/paths";
import { assertSafeName, resolveWithin } from "../security/path-boundary";
import { canonicalJson, parseExportReceipt, receiptDigest, requireReceiptIdentity, sha256 } from "./export-receipt";
import { formatExtension } from "./export-naming";

export type VerifiedExportDownload = { readonly path: string; readonly format: ExportFormat; readonly projectId: string; readonly revision: number };
export class ExportDownloadError extends Error {
  readonly name = "ExportDownloadError";
  constructor(readonly code: "not_found" | "unavailable" | "corrupt") { super(code); }
}

export async function verifyExportDownload(jobId: string): Promise<VerifiedExportDownload> {
  const job = await getExportJob(jobId); if (job === null) throw new ExportDownloadError("not_found");
  const attempt = job.latest_attempt;
  if (job.status !== "succeeded" || attempt === null || attempt.status !== "validated" || !attempt.retention.output_available || attempt.digests.output === null || attempt.digests.receipt === null) throw new ExportDownloadError("unavailable");
  const authority = getSqlite().query<{ readonly canonical_options_json: string }, [string]>("SELECT canonical_options_json FROM export_attempts WHERE id=?").get(attempt.id); if (authority === null) throw new ExportDownloadError("unavailable");
  const ownedRoot = resolveWithin(exportsDir, "attempts", assertSafeName(attempt.id));
  const receiptPath = resolveWithin(ownedRoot, "receipt.json");
  try {
    const receiptSource = await readFile(receiptPath, "utf8"); const receipt = parseExportReceipt(JSON.parse(receiptSource));
    const outputPath = resolveWithin(ownedRoot, receipt.output_file);
    if (job.output_path !== outputPath || !(await stat(outputPath)).isFile()) return corrupt(job.id, attempt.id);
    const output = new Uint8Array(await readFile(outputPath)); const outputDigest = sha256(output);
    requireReceiptIdentity(receipt, { jobId: job.id, attemptId: attempt.id, parentAttemptId: attempt.parent_attempt_id, projectId: job.project_id, projectRevision: attempt.project_revision, projectDigest: attempt.project_digest, format: job.format, options: parseExportOptions(job.format, authority.canonical_options_json), optionsDigest: attempt.digests.options, inputClosureDigest: attempt.digests.input_closure, designSystemDigest: attempt.digests.design_system, rendererDigest: attempt.digests.renderer, captureDigest: attempt.digests.capture, outputFile: `artifact.${formatExtension(job.format)}`, outputDigest, outputSize: output.byteLength });
    if (receiptDigest(receipt) !== attempt.digests.receipt || sha256(canonicalJson(receipt)) !== attempt.digests.receipt || outputDigest !== attempt.digests.output || output.byteLength !== job.size_bytes) return corrupt(job.id, attempt.id);
    return { path: outputPath, format: job.format, projectId: job.project_id, revision: attempt.project_revision };
  } catch (error) {
    if (error instanceof ExportDownloadError) throw error;
    return corrupt(job.id, attempt.id);
  }
}
function corrupt(jobId: string, attemptId: string): never {
  markExportAttemptCorrupt(getSqlite(), { jobId, attemptId, message: "Export receipt or output is corrupt" });
  throw new ExportDownloadError("corrupt");
}
