import {
  UpgradeContractError,
  decodeContract,
  isRecord,
  optionalString,
  requiredArray,
  requiredBoolean,
  requiredNumber,
  requiredRecord,
  requiredString,
  type UnknownRecord,
} from "./contract-parser";

export const EXPORT_PROGRESS_STAGES = ["queued", "snapshotting", "rendering", "validating", "publishing", "complete"] as const;
export type ExportProgressStage = (typeof EXPORT_PROGRESS_STAGES)[number];
export type ExportStopReason = "user_cancelled" | "source_changed" | "snapshot_failed" | "render_failed" | "validation_failed" | "publication_failed" | "recovery_failed" | "receipt_corrupt" | "output_missing" | "retention_expired";

export type ExportDigests = {
  readonly options: string;
  readonly input_closure: string | null;
  readonly design_system: string | null;
  readonly renderer: string;
  readonly capture: string;
  readonly output: string | null;
  readonly receipt: string | null;
};
export type ExportProgress = { readonly stage: ExportProgressStage; readonly completed: number; readonly total: 6 };
export type ExportFinding = { readonly code: string; readonly path: string | null };
export type ExportRetention = { readonly retained_until: number; readonly output_available: boolean };
export type ExportAttemptStatus = "pending" | "running" | "validating" | "retrying" | "recovering" | "validated" | "failed" | "cancelled" | "corrupt" | "expired";
export type ExportAttempt = {
  readonly id: string;
  readonly job_id: string;
  readonly parent_attempt_id: string | null;
  readonly status: ExportAttemptStatus;
  readonly project_revision: number;
  readonly project_digest: string;
  readonly digests: ExportDigests;
  readonly progress: ExportProgress;
  readonly stop_reason: ExportStopReason | null;
  readonly findings: readonly ExportFinding[];
  readonly retention: ExportRetention;
  readonly cancel_requested_at: number | null;
  readonly created_at: number;
  readonly updated_at: number;
};

export function parseExportAttempt(input: unknown): ExportAttempt {
  const record = decodeContract(input);
  exact(record, ["id", "job_id", "parent_attempt_id", "status", "project_revision", "project_digest", "design_system_digest", "digests", "progress", "stop_reason", "findings", "retention", "cancel_requested_at", "created_at", "updated_at"]);
  const status = parseStatus(requiredString(record, "status"));
  const digests = parseDigests(requiredRecord(record, "digests"), optionalString(record, "design_system_digest"));
  const progress = parseProgress(requiredRecord(record, "progress"));
  const retention = parseRetention(requiredRecord(record, "retention"));
  const stopReason = parseStopReason(optionalString(record, "stop_reason"));
  const findings = requiredArray(record, "findings").map(parseFinding);
  validateState(status, digests, progress, stopReason, retention);
  return {
    id: requiredString(record, "id"), job_id: requiredString(record, "job_id"),
    parent_attempt_id: optionalString(record, "parent_attempt_id"), status,
    project_revision: requiredNumber(record, "project_revision"), project_digest: requiredString(record, "project_digest"),
    digests, progress, stop_reason: stopReason, findings, retention,
    cancel_requested_at: optionalNumber(record, "cancel_requested_at"),
    created_at: requiredNumber(record, "created_at"), updated_at: requiredNumber(record, "updated_at"),
  };
}

function parseDigests(record: UnknownRecord, designSystem: string | null): ExportDigests {
  exact(record, ["options", "input_closure", "renderer", "capture", "output", "receipt"]);
  return { options: requiredString(record, "options"), input_closure: optionalString(record, "input_closure"), design_system: designSystem, renderer: requiredString(record, "renderer"), capture: requiredString(record, "capture"), output: optionalString(record, "output"), receipt: optionalString(record, "receipt") };
}

function parseProgress(record: UnknownRecord): ExportProgress {
  exact(record, ["stage", "completed", "total"]);
  const stageValue = parseProgressStage(requiredString(record, "stage"));
  const completed = requiredNumber(record, "completed");
  const total = requiredNumber(record, "total");
  const expectedCompleted = stageValue === "complete" ? 6 : EXPORT_PROGRESS_STAGES.indexOf(stageValue);
  if (total !== 6 || completed !== expectedCompleted) invalid("progress");
  return { stage: stageValue, completed, total: 6 };
}

function parseRetention(record: UnknownRecord): ExportRetention {
  exact(record, ["retained_until", "output_available"]);
  return { retained_until: requiredNumber(record, "retained_until"), output_available: requiredBoolean(record, "output_available") };
}

function parseFinding(value: unknown, index: number): ExportFinding {
  if (!isRecord(value)) invalid(`findings.${index}`);
  exact(value, ["code", "path"]);
  return { code: requiredString(value, "code"), path: optionalString(value, "path") };
}

function validateState(status: ExportAttemptStatus, digests: ExportDigests, progress: ExportProgress, reason: ExportStopReason | null, retention: ExportRetention): void {
  const terminalFailure = status === "failed" || status === "cancelled" || status === "corrupt" || status === "expired";
  if (status === "validated" && (digests.input_closure === null || digests.output === null || digests.receipt === null || progress.stage !== "complete" || reason !== null || !retention.output_available)) invalid("status");
  if (terminalFailure && (reason === null || retention.output_available)) invalid("stop_reason");
  if (!terminalFailure && status !== "validated" && (digests.output !== null || digests.receipt !== null || retention.output_available)) invalid("digests.output");
}

function parseProgressStage(value: string): ExportProgressStage {
  switch (value) {
    case "queued": case "snapshotting": case "rendering": case "validating": case "publishing": case "complete": return value;
    default: return invalid("progress.stage");
  }
}

function parseStatus(value: string): ExportAttemptStatus {
  switch (value) {
    case "pending": case "running": case "validating": case "retrying": case "recovering": case "validated": case "failed": case "cancelled": case "corrupt": case "expired": return value;
    default: throw new UpgradeContractError("invalid_export_status", "status");
  }
}

function parseStopReason(value: string | null): ExportStopReason | null {
  switch (value) {
    case null: case "user_cancelled": case "source_changed": case "snapshot_failed": case "render_failed": case "validation_failed": case "publication_failed": case "recovery_failed": case "receipt_corrupt": case "output_missing": case "retention_expired": return value;
    default: return invalid("stop_reason");
  }
}

function optionalNumber(record: UnknownRecord, key: string): number | null {
  return record[key] === null ? null : requiredNumber(record, key);
}
function exact(record: UnknownRecord, keys: readonly string[]): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) if (!allowed.has(key)) invalid(key);
  for (const key of keys) if (!(key in record)) throw new UpgradeContractError("missing_required_field", key);
}
function invalid(path: string): never { throw new UpgradeContractError("invalid_field", path); }
