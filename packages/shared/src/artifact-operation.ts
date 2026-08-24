import {
  UpgradeContractError,
  decodeContract,
  optionalString,
  requiredBoolean,
  requiredNumber,
  requiredRecord,
  requiredString,
} from "./contract-parser";

export type ExactByteDiff = {
  readonly before_digest: string;
  readonly after_digest: string;
  readonly before_bytes: number;
  readonly after_bytes: number;
  readonly exact_patch: string;
};
export type ArtifactRetention = {
  readonly snapshot_id: string;
  readonly retained_until: number;
  readonly replayable: boolean;
};
export type ArtifactReplayAnchor = {
  readonly cursor: number;
  readonly parent_operation_id: string | null;
};
type ArtifactOperationBase = {
  readonly id: string;
  readonly project_id: string;
  readonly base_revision: number;
  readonly base_digest: string;
  readonly result_revision: number | null;
  readonly result_digest: string | null;
  readonly expected_revision: number;
  readonly expected_file_hash: string;
  readonly node_fingerprint: string;
  readonly diff: ExactByteDiff;
  readonly retention: ArtifactRetention;
  readonly replay: ArtifactReplayAnchor;
};
export type ArtifactOperation =
  | (ArtifactOperationBase & { readonly status: "preview" })
  | (ArtifactOperationBase & { readonly status: "pending" })
  | (ArtifactOperationBase & { readonly status: "working" })
  | (ArtifactOperationBase & { readonly status: "recovering" })
  | (ArtifactOperationBase & { readonly status: "committed"; readonly result_revision: number; readonly result_digest: string })
  | (ArtifactOperationBase & { readonly status: "cancelled" })
  | (ArtifactOperationBase & { readonly status: "failed" })
  | (ArtifactOperationBase & { readonly status: "conflicted" })
  | (ArtifactOperationBase & { readonly status: "recovered" })
  | (ArtifactOperationBase & { readonly status: "reconnecting" })
  | (ArtifactOperationBase & { readonly status: "replaying" });

export function parseArtifactOperation(input: unknown): ArtifactOperation {
  const record = decodeContract(input);
  const diff = requiredRecord(record, "diff");
  const retention = requiredRecord(record, "retention");
  const replay = requiredRecord(record, "replay");
  const base = {
    id: requiredString(record, "id"), project_id: requiredString(record, "project_id"),
    base_revision: requiredNumber(record, "base_revision", "missing_base_revision"),
    base_digest: requiredString(record, "base_digest"),
    result_revision: nullableNumber(record, "result_revision"),
    result_digest: optionalString(record, "result_digest"),
    expected_revision: requiredNumber(record, "expected_revision"),
    expected_file_hash: requiredString(record, "expected_file_hash"),
    node_fingerprint: requiredString(record, "node_fingerprint"),
    diff: {
      before_digest: requiredString(diff, "before_digest"), after_digest: requiredString(diff, "after_digest"),
      before_bytes: requiredNumber(diff, "before_bytes"), after_bytes: requiredNumber(diff, "after_bytes"),
      exact_patch: requiredString(diff, "exact_patch"),
    },
    retention: {
      snapshot_id: requiredString(retention, "snapshot_id"),
      retained_until: requiredNumber(retention, "retained_until"),
      replayable: requiredBoolean(retention, "replayable"),
    },
    replay: {
      cursor: requiredNumber(replay, "cursor"),
      parent_operation_id: optionalString(replay, "parent_operation_id"),
    },
  };
  const status = requiredString(record, "status");
  switch (status) {
    case "preview": return { ...base, status };
    case "pending": return { ...base, status };
    case "working": return { ...base, status };
    case "recovering": return { ...base, status };
    case "committed": {
      if (base.result_revision === null || base.result_digest === null) throw new UpgradeContractError("missing_required_field", "result_revision");
      return { ...base, status, result_revision: base.result_revision, result_digest: base.result_digest };
    }
    case "cancelled": return { ...base, status };
    case "failed": return { ...base, status };
    case "conflicted": return { ...base, status };
    case "recovered": return { ...base, status };
    case "reconnecting": return { ...base, status };
    case "replaying": return { ...base, status };
    default: throw new UpgradeContractError("unknown_discriminant", "status");
  }
}

function nullableNumber(record: Readonly<Record<string, unknown>>, key: string): number | null {
  if (record[key] === null) return null;
  return requiredNumber(record, key);
}
