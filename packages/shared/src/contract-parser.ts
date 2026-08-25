export type UpgradeContractErrorCode =
  | "invalid_json"
  | "expected_object"
  | "missing_required_field"
  | "invalid_field"
  | "unknown_discriminant"
  | "missing_provenance_evidence"
  | "missing_provenance_source"
  | "missing_provenance_conflicts"
  | "invalid_export_status"
  | "missing_base_revision"
  | "missing_artifact_digest";

export class UpgradeContractError extends Error {
  readonly name = "UpgradeContractError";

  constructor(
    readonly code: UpgradeContractErrorCode,
    readonly path: string,
  ) {
    super(`${code} at ${path}`);
  }
}

export type UnknownRecord = Readonly<Record<string, unknown>>;

export function decodeContract(input: unknown): UnknownRecord {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new UpgradeContractError("invalid_json", "$");
      }
      throw error;
    }
  }
  if (!isRecord(value)) {
    throw new UpgradeContractError("expected_object", "$");
  }
  return value;
}

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredRecord(record: UnknownRecord, key: string): UnknownRecord {
  const value = required(record, key);
  if (!isRecord(value)) throw new UpgradeContractError("invalid_field", key);
  return value;
}

export function optionalRecord(record: UnknownRecord, key: string): UnknownRecord | null {
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new UpgradeContractError("invalid_field", key);
  return value;
}

export function requiredString(record: UnknownRecord, key: string): string {
  const value = required(record, key);
  if (typeof value !== "string" || value.length === 0) {
    throw new UpgradeContractError("invalid_field", key);
  }
  return value;
}

export function optionalString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new UpgradeContractError("invalid_field", key);
  return value;
}

export function requiredNumber(
  record: UnknownRecord,
  key: string,
  missingCode: UpgradeContractErrorCode = "missing_required_field",
): number {
  const value = record[key];
  if (value === undefined) throw new UpgradeContractError(missingCode, key);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new UpgradeContractError("invalid_field", key);
  }
  return value;
}

export function requiredBoolean(record: UnknownRecord, key: string): boolean {
  const value = required(record, key);
  if (typeof value !== "boolean") throw new UpgradeContractError("invalid_field", key);
  return value;
}

export function requiredArray(record: UnknownRecord, key: string): readonly unknown[] {
  const value = required(record, key);
  if (!Array.isArray(value)) throw new UpgradeContractError("invalid_field", key);
  return value;
}

export function stringArray(record: UnknownRecord, key: string): readonly string[] {
  return requiredArray(record, key).map((value, index) => {
    if (typeof value !== "string" || value.length === 0) {
      throw new UpgradeContractError("invalid_field", `${key}.${index}`);
    }
    return value;
  });
}

function required(record: UnknownRecord, key: string): unknown {
  const value = record[key];
  if (value === undefined) throw new UpgradeContractError("missing_required_field", key);
  return value;
}
