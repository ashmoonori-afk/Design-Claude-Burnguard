import {
  UpgradeContractError,
  decodeContract,
  isRecord,
  optionalString,
  requiredArray,
  requiredNumber,
  requiredString,
  stringArray,
} from "./contract-parser";

export type ExtractionEvidence = {
  readonly kind: "source" | "override" | "fallback";
  readonly locator: string;
  readonly digest: string;
};

type ProvenanceBase = {
  readonly identity: string;
  readonly revision: number;
  readonly digest: string;
  readonly receipt_id: string;
  readonly evidence: readonly ExtractionEvidence[];
};

export type ExtractionProvenance =
  | (ProvenanceBase & { readonly state: "observed" })
  | (ProvenanceBase & { readonly state: "unknown" })
  | (ProvenanceBase & { readonly state: "inferred"; readonly source: string })
  | (ProvenanceBase & { readonly state: "defaulted"; readonly source: string })
  | (ProvenanceBase & {
      readonly state: "conflicted";
      readonly source: string;
      readonly conflicts: readonly string[];
    });

export function parseExtractionProvenance(input: unknown): ExtractionProvenance {
  const record = decodeContract(input);
  const evidence = requiredArray(record, "evidence").map((item, index) => {
    if (!isRecord(item)) throw new UpgradeContractError("invalid_field", `evidence.${index}`);
    const kind = parseEvidenceKind(requiredString(item, "kind"), index);
    return { kind, locator: requiredString(item, "locator"), digest: requiredString(item, "digest") };
  });
  const base = {
    identity: requiredString(record, "identity"),
    revision: requiredNumber(record, "revision"),
    digest: requiredString(record, "digest"),
    receipt_id: requiredString(record, "receipt_id"),
    evidence,
  };
  const state = requiredString(record, "state");
  switch (state) {
    case "observed": return { ...base, state };
    case "unknown": return { ...base, state };
    case "inferred": return { ...base, state, source: requiredEvidenceSource(record, evidence) };
    case "defaulted": return { ...base, state, source: requiredEvidenceSource(record, evidence) };
    case "conflicted": {
      if (evidence.length === 0) throw new UpgradeContractError("missing_provenance_evidence", "evidence");
      const source = optionalString(record, "source");
      if (source === null || source.length === 0) throw new UpgradeContractError("missing_provenance_source", "source");
      const conflicts = stringArray(record, "conflicts");
      if (conflicts.length === 0) throw new UpgradeContractError("missing_provenance_conflicts", "conflicts");
      return { ...base, state, source, conflicts };
    }
    default: throw new UpgradeContractError("unknown_discriminant", "state");
  }
}

function parseEvidenceKind(value: string, index: number): ExtractionEvidence["kind"] {
  switch (value) {
    case "source": return value;
    case "override": return value;
    case "fallback": return value;
    default: throw new UpgradeContractError("unknown_discriminant", `evidence.${index}.kind`);
  }
}

function requiredEvidenceSource(
  record: Readonly<Record<string, unknown>>,
  evidence: readonly ExtractionEvidence[],
): string {
  if (evidence.length === 0) throw new UpgradeContractError("missing_provenance_evidence", "evidence");
  const source = optionalString(record, "source");
  if (source === null || source.length === 0) throw new UpgradeContractError("missing_provenance_source", "source");
  return source;
}
