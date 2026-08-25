import {
  UpgradeContractError,
  decodeContract,
  isRecord,
  requiredArray,
  requiredNumber,
  requiredRecord,
  requiredString,
  stringArray,
} from "./contract-parser";

export type CatalogContentReceipt = {
  readonly revision: number;
  readonly receipt_id: string;
  readonly digest: string;
};
export type CatalogLineageParent = {
  readonly parent_id: string;
  readonly parent_receipt_id: string;
  readonly parent_digest: string;
};
export type CatalogContract = {
  readonly id: string;
  readonly kind: "design-system" | "pattern-library" | "template";
  readonly tags: readonly string[];
  readonly lifecycle: "active" | "archived" | "trashed" | "partial" | "corrupt";
  readonly provenance: "observed" | "inferred" | "defaulted" | "unknown" | "conflicted";
  readonly license: "verified" | "declared" | "unknown" | "restricted";
  readonly metadata_revision: number;
  readonly content: CatalogContentReceipt;
  readonly lineage: readonly CatalogLineageParent[];
};

export function parseCatalogContract(input: unknown): CatalogContract {
  const record = decodeContract(input);
  const kind = parseKind(requiredString(record, "kind"));
  const lifecycle = parseLifecycle(requiredString(record, "lifecycle"));
  const provenance = parseProvenance(requiredString(record, "provenance"));
  const license = parseLicense(requiredString(record, "license"));
  const content = requiredRecord(record, "content");
  const tags = [...new Set(stringArray(record, "tags").map((tag) => tag.normalize("NFKC").trim().toLocaleLowerCase()).filter((tag) => tag.length > 0))].sort();
  const lineage = requiredArray(record, "lineage").map((item, index) => {
    if (!isRecord(item)) throw new UpgradeContractError("invalid_field", `lineage.${index}`);
    return {
      parent_id: requiredString(item, "parent_id"),
      parent_receipt_id: requiredString(item, "parent_receipt_id"),
      parent_digest: requiredString(item, "parent_digest"),
    };
  });
  return {
    id: requiredString(record, "id"), kind, tags, lifecycle, provenance, license,
    metadata_revision: requiredNumber(record, "metadata_revision"),
    content: {
      revision: requiredNumber(content, "revision"),
      receipt_id: requiredString(content, "receipt_id"),
      digest: requiredString(content, "digest"),
    },
    lineage,
  };
}

function parseKind(value: string): CatalogContract["kind"] {
  switch (value) {
    case "design-system": case "pattern-library": case "template": return value;
    default: throw new UpgradeContractError("unknown_discriminant", "kind");
  }
}
function parseLifecycle(value: string): CatalogContract["lifecycle"] {
  switch (value) {
    case "active": case "archived": case "trashed": case "partial": case "corrupt": return value;
    default: throw new UpgradeContractError("unknown_discriminant", "lifecycle");
  }
}
function parseProvenance(value: string): CatalogContract["provenance"] {
  switch (value) {
    case "observed": case "inferred": case "defaulted": case "unknown": case "conflicted": return value;
    default: throw new UpgradeContractError("unknown_discriminant", "provenance");
  }
}
function parseLicense(value: string): CatalogContract["license"] {
  switch (value) {
    case "verified": case "declared": case "unknown": case "restricted": return value;
    default: throw new UpgradeContractError("unknown_discriminant", "license");
  }
}
