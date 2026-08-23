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
} from "./contract-parser";

export type ExportDigests = {
  readonly options: string;
  readonly input_closure: string;
  readonly renderer: string;
  readonly capture: string;
  readonly output: string;
  readonly receipt: string;
};
export type ExportProgress = {
  readonly stage: string;
  readonly completed: number;
  readonly total: number;
};
export type ExportFinding = {
  readonly code: string;
  readonly path: string | null;
};
export type ExportRetention = {
  readonly retained_until: number;
  readonly output_available: boolean;
};
type ExportAttemptBase = {
  readonly id: string;
  readonly job_id: string;
  readonly parent_attempt_id: string | null;
  readonly project_revision: number;
  readonly project_digest: string;
  readonly digests: ExportDigests;
  readonly progress: ExportProgress;
  readonly stop_reason: string | null;
  readonly findings: readonly ExportFinding[];
  readonly retention: ExportRetention;
};
export type ExportAttempt =
  | (ExportAttemptBase & { readonly status: "pending" })
  | (ExportAttemptBase & { readonly status: "running" })
  | (ExportAttemptBase & { readonly status: "validating" })
  | (ExportAttemptBase & { readonly status: "validated" })
  | (ExportAttemptBase & { readonly status: "failed" })
  | (ExportAttemptBase & { readonly status: "cancelled" })
  | (ExportAttemptBase & { readonly status: "retrying" })
  | (ExportAttemptBase & { readonly status: "recovering" })
  | (ExportAttemptBase & { readonly status: "expired" })
  | (ExportAttemptBase & { readonly status: "corrupt" });

export function parseExportAttempt(input: unknown): ExportAttempt {
  const record = decodeContract(input);
  const status = parseStatus(requiredString(record, "status"));
  const digests = requiredRecord(record, "digests");
  const progress = requiredRecord(record, "progress");
  const retention = requiredRecord(record, "retention");
  const findings = requiredArray(record, "findings").map((item, index) => {
    if (!isRecord(item)) throw new UpgradeContractError("invalid_field", `findings.${index}`);
    return { code: requiredString(item, "code"), path: optionalString(item, "path") };
  });
  const base = {
    id: requiredString(record, "id"), job_id: requiredString(record, "job_id"),
    parent_attempt_id: optionalString(record, "parent_attempt_id"),
    project_revision: requiredNumber(record, "project_revision"),
    project_digest: requiredString(record, "project_digest"),
    digests: {
      options: requiredString(digests, "options"), input_closure: requiredString(digests, "input_closure"),
      renderer: requiredString(digests, "renderer"), capture: requiredString(digests, "capture"),
      output: requiredString(digests, "output"), receipt: requiredString(digests, "receipt"),
    },
    progress: {
      stage: requiredString(progress, "stage"), completed: requiredNumber(progress, "completed"),
      total: requiredNumber(progress, "total"),
    },
    stop_reason: optionalString(record, "stop_reason"), findings,
    retention: {
      retained_until: requiredNumber(retention, "retained_until"),
      output_available: requiredBoolean(retention, "output_available"),
    },
  };
  switch (status) {
    case "pending": return { ...base, status };
    case "running": return { ...base, status };
    case "validating": return { ...base, status };
    case "validated": return { ...base, status };
    case "failed": return { ...base, status };
    case "cancelled": return { ...base, status };
    case "retrying": return { ...base, status };
    case "recovering": return { ...base, status };
    case "expired": return { ...base, status };
    case "corrupt": return { ...base, status };
  }
}

function parseStatus(value: string): ExportAttempt["status"] {
  switch (value) {
    case "pending": case "running": case "validating": case "validated": case "failed":
    case "cancelled": case "retrying": case "recovering": case "expired": case "corrupt": return value;
    default: throw new UpgradeContractError("invalid_export_status", "status");
  }
}
