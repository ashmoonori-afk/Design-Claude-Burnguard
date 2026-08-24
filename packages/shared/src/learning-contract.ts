import {
  UpgradeContractError,
  decodeContract,
  optionalRecord,
  optionalString,
  requiredNumber,
  requiredRecord,
  requiredString,
} from "./contract-parser";
export { UpgradeContractError };

export type LearningProgress = {
  readonly state: "not_started" | "in_progress" | "completed";
  readonly revision: number;
  readonly expected_revision: number;
  readonly feedback_draft: string | null;
};
export type LearningNextContext = {
  readonly kind: "iteration";
  readonly parent_checkpoint_id: string;
  readonly schema_revision: number;
  readonly artifact_revision: number;
  readonly artifact_digest: string;
};
export type LearningCheckpoint = {
  readonly id: string;
  readonly parent_checkpoint_id: string | null;
  readonly artifact_revision: number;
  readonly artifact_digest: string;
  readonly next_context: LearningNextContext;
};
type LearningBase = {
  readonly id: string;
  readonly revision: number;
  readonly progress: LearningProgress;
  readonly checkpoint: LearningCheckpoint | null;
};
export type LearningContract =
  | (LearningBase & { readonly kind: "lesson" })
  | (LearningBase & { readonly kind: "example" })
  | (LearningBase & { readonly kind: "skill-card" });

export function parseLearningContract(input: unknown): LearningContract {
  const record = decodeContract(input);
  exactFields(record, ["id", "kind", "revision", "progress", "checkpoint"]);
  const kind = requiredString(record, "kind");
  const progressRecord = requiredRecord(record, "progress");
  exactFields(progressRecord, ["state", "revision", "expected_revision", "feedback_draft"]);
  const progress: LearningProgress = {
    state: parseProgress(requiredString(progressRecord, "state")),
    revision: requiredNumber(progressRecord, "revision"),
    expected_revision: requiredNumber(progressRecord, "expected_revision"),
    feedback_draft: optionalString(progressRecord, "feedback_draft"),
  };
  const checkpointRecord = optionalRecord(record, "checkpoint");
  const checkpoint = checkpointRecord === null ? null : parseCheckpoint(checkpointRecord);
  const base = {
    id: requiredString(record, "id"), revision: requiredNumber(record, "revision"),
    progress, checkpoint,
  };
  switch (kind) {
    case "lesson": return { ...base, kind };
    case "example": return { ...base, kind };
    case "skill-card": return { ...base, kind };
    default: throw new UpgradeContractError("unknown_discriminant", "kind");
  }
}

export function parseLearningNextContext(input: unknown): LearningNextContext {
  const context = decodeContract(input);
  exactFields(context, ["kind", "parent_checkpoint_id", "schema_revision", "artifact_revision", "artifact_digest"]);
  const contextDigest = context["artifact_digest"];
  if (contextDigest === undefined) throw new UpgradeContractError("missing_artifact_digest", "artifact_digest");
  if (typeof contextDigest !== "string" || contextDigest.length === 0) throw new UpgradeContractError("invalid_field", "artifact_digest");
  const contextKind = requiredString(context, "kind");
  if (contextKind !== "iteration") throw new UpgradeContractError("unknown_discriminant", "kind");
  return {
    kind: contextKind,
    parent_checkpoint_id: requiredString(context, "parent_checkpoint_id"),
    schema_revision: requiredNumber(context, "schema_revision"),
    artifact_revision: requiredNumber(context, "artifact_revision"),
    artifact_digest: contextDigest,
  };
}

function parseCheckpoint(record: Readonly<Record<string, unknown>>): LearningCheckpoint {
  exactFields(record, ["id", "parent_checkpoint_id", "artifact_revision", "artifact_digest", "next_context"]);
  const digest = record["artifact_digest"];
  if (digest === undefined) throw new UpgradeContractError("missing_artifact_digest", "checkpoint.artifact_digest");
  if (typeof digest !== "string" || digest.length === 0) throw new UpgradeContractError("invalid_field", "checkpoint.artifact_digest");
  const context = parseLearningNextContext(requiredRecord(record, "next_context"));
  return {
    id: requiredString(record, "id"),
    parent_checkpoint_id: optionalString(record, "parent_checkpoint_id"),
    artifact_revision: requiredNumber(record, "artifact_revision"), artifact_digest: digest,
    next_context: context,
  };
}
function parseProgress(value: string): LearningProgress["state"] {
  switch (value) {
    case "not_started": case "in_progress": case "completed": return value;
    default: throw new UpgradeContractError("unknown_discriminant", "progress.state");
  }
}
function exactFields(record: Readonly<Record<string, unknown>>, allowed: readonly string[]): void {
  const fields = new Set(allowed);
  const unknown = Object.keys(record).find((field) => !fields.has(field));
  if (unknown !== undefined) throw new UpgradeContractError("invalid_field", unknown);
}
