export const VISUAL_SOURCE_ROLES = ["ordinary_content", "immutable_reference"] as const;
export type VisualSourceRole = (typeof VISUAL_SOURCE_ROLES)[number];

export type VisualSourceUploadRequestV1 = {
  readonly schema_version: 1;
  readonly explicit: boolean;
  readonly sources: readonly {
    readonly source_type: "upload";
    readonly upload_id: string;
    readonly file_index: number;
    readonly role: VisualSourceRole;
  }[];
};

export type UploadedVisualSourceSelection = {
  readonly source_type: "uploaded_attachment";
  readonly attachment_path: string;
  readonly role: VisualSourceRole;
};

export type VisualSourceManifestV1 = {
  readonly schema_version: 1;
  readonly network_sources: "unsupported";
  readonly sources: readonly VisualSourceManifestEntry[];
};

export type VisualSourceManifestEntry =
  | {
      readonly source_type: "uploaded_attachment";
      readonly role: "ordinary_content";
      readonly role_origin: "explicit" | "legacy_inferred";
      readonly attachment_id: string;
      readonly original_name: string;
      readonly mime_type: string;
      readonly size_bytes: number;
      readonly preflight_verified_sha256: string;
      readonly managed_path: string;
      readonly provenance: AttachmentProvenance;
    }
  | {
      readonly source_type: "uploaded_attachment";
      readonly role: "immutable_reference";
      readonly role_origin: "explicit" | "legacy_inferred";
      readonly attachment_id: string;
      readonly original_name: string;
      readonly mime_type: string;
      readonly size_bytes: number;
      readonly preflight_verified_sha256: string;
      readonly managed_path: string;
      readonly provenance: AttachmentProvenance;
      readonly policy: {
        readonly original_file: "preserve";
        readonly original_hash: "preserve";
        readonly never_overwrite: true;
        readonly never_copy_into_authored_output: true;
        readonly derived_artifact: "separate";
      };
    };

type AttachmentProvenance = {
  readonly session_id: string;
  readonly turn_id: string;
  readonly storage: "managed_attachment";
};

export class VisualSourceContractError extends Error {
  readonly name = "VisualSourceContractError";
  constructor(readonly code: "invalid_visual_sources" | "unsupported_visual_source") {
    super(code);
  }
}

export function parseVisualSourceUploadRequest(value: unknown, fileCount: number): VisualSourceUploadRequestV1 {
  if (!Number.isSafeInteger(fileCount) || fileCount < 0) fail("invalid_visual_sources");
  if (value === undefined || value === null || value === "") {
    return {
      schema_version: 1,
      explicit: false,
      sources: Array.from({ length: fileCount }, (_, fileIndex) => ({
        source_type: "upload" as const,
        upload_id: `upload-${fileIndex}`,
        file_index: fileIndex,
        role: "ordinary_content" as const,
      })),
    };
  }
  let parsed: unknown;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    fail("invalid_visual_sources");
  }
  if (
    !record(parsed) ||
    !exactKeys(parsed, ["schema_version", "sources"]) ||
    parsed["schema_version"] !== 1 ||
    !Array.isArray(parsed["sources"])
  ) fail("invalid_visual_sources");
  const sources = parsed["sources"].map((source) => parseUploadSource(source));
  if (
    sources.length !== fileCount ||
    new Set(sources.map((source) => source.upload_id)).size !== sources.length
  ) fail("invalid_visual_sources");
  const sorted = [...sources].sort((left, right) => left.file_index - right.file_index);
  if (!sorted.every((source, position) => source.file_index === position)) fail("invalid_visual_sources");
  return { schema_version: 1, explicit: true, sources: sorted };
}

export function parseVisualSourceManifest(value: unknown): VisualSourceManifestV1 {
  if (
    !record(value) ||
    !exactKeys(value, ["schema_version", "network_sources", "sources"]) ||
    value["schema_version"] !== 1 ||
    value["network_sources"] !== "unsupported" ||
    !Array.isArray(value["sources"])
  ) fail("invalid_visual_sources");
  const sources = value["sources"].map((entry) => parseManifestEntry(entry));
  if (
    new Set(sources.map((source) => source.attachment_id)).size !== sources.length ||
    new Set(sources.map((source) => source.managed_path)).size !== sources.length
  ) fail("invalid_visual_sources");
  return { schema_version: 1, network_sources: "unsupported", sources };
}

export function parseUploadedVisualSourceSelections(value: unknown): readonly UploadedVisualSourceSelection[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail("invalid_visual_sources");
  return value.map((source) => {
    if (record(source) && unsupportedSourceType(source["source_type"])) fail("unsupported_visual_source");
    if (
      !record(source) ||
      !exactKeys(source, ["source_type", "attachment_path", "role"]) ||
      source["source_type"] !== "uploaded_attachment" ||
      !safeSelectionPath(source["attachment_path"]) ||
      !role(source["role"])
    ) fail("invalid_visual_sources");
    return { source_type: "uploaded_attachment", attachment_path: source["attachment_path"], role: source["role"] };
  });
}

function parseManifestEntry(value: unknown): VisualSourceManifestEntry {
  if (
    !record(value) ||
    value["source_type"] !== "uploaded_attachment" ||
    !role(value["role"])
  ) fail("invalid_visual_sources");
  const ordinaryKeys = ["source_type", "role", "role_origin", "attachment_id", "original_name", "mime_type", "size_bytes", "preflight_verified_sha256", "managed_path", "provenance"];
  const immutable = value["role"] === "immutable_reference";
  if (
    !exactKeys(value, immutable ? [...ordinaryKeys, "policy"] : ordinaryKeys) ||
    (value["role_origin"] !== "explicit" && value["role_origin"] !== "legacy_inferred") ||
    !nonempty(value["attachment_id"]) ||
    !nonempty(value["original_name"]) ||
    !nonempty(value["mime_type"]) ||
    typeof value["size_bytes"] !== "number" ||
    !Number.isSafeInteger(value["size_bytes"]) ||
    value["size_bytes"] < 0 ||
    !sha256(value["preflight_verified_sha256"]) ||
    !managedAttachmentPath(value["managed_path"]) ||
    !provenance(value["provenance"])
  ) fail("invalid_visual_sources");
  const roleOrigin = value["role_origin"] === "explicit" ? "explicit" as const : "legacy_inferred" as const;
  const common = {
    source_type: "uploaded_attachment" as const,
    role_origin: roleOrigin,
    attachment_id: value["attachment_id"],
    original_name: value["original_name"],
    mime_type: value["mime_type"],
    size_bytes: value["size_bytes"],
    preflight_verified_sha256: value["preflight_verified_sha256"],
    managed_path: value["managed_path"],
    provenance: value["provenance"],
  };
  if (!immutable) return { ...common, role: "ordinary_content" };
  if (!policy(value["policy"])) fail("invalid_visual_sources");
  return { ...common, role: "immutable_reference", policy: value["policy"] };
}

function parseUploadSource(value: unknown): VisualSourceUploadRequestV1["sources"][number] {
  if (record(value) && unsupportedSourceType(value["source_type"])) fail("unsupported_visual_source");
  if (
    !record(value) ||
    !exactKeys(value, ["source_type", "upload_id", "file_index", "role"]) ||
    value["source_type"] !== "upload" ||
    typeof value["upload_id"] !== "string" ||
    !/^[A-Za-z0-9_-]{1,80}$/u.test(value["upload_id"]) ||
    typeof value["file_index"] !== "number" ||
    !Number.isSafeInteger(value["file_index"]) ||
    value["file_index"] < 0 ||
    !role(value["role"])
  ) fail("invalid_visual_sources");
  return { source_type: "upload", upload_id: value["upload_id"], file_index: value["file_index"], role: value["role"] };
}

function unsupportedSourceType(value: unknown): boolean {
  return value === "url" || value === "web" || value === "stock";
}

function safeSelectionPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !/[\r\n\0]/u.test(value) && !/^https?:\/\//iu.test(value) && !value.split(/[\\/]/u).includes("..");
}

function managedAttachmentPath(value: unknown): value is string {
  return safeSelectionPath(value) && /^\.attachments\/[^/]+$/u.test(value);
}

function provenance(value: unknown): value is AttachmentProvenance {
  return record(value) &&
    exactKeys(value, ["session_id", "turn_id", "storage"]) &&
    nonempty(value["session_id"]) &&
    nonempty(value["turn_id"]) &&
    value["storage"] === "managed_attachment";
}

function policy(value: unknown): value is Extract<VisualSourceManifestEntry, { readonly role: "immutable_reference" }>["policy"] {
  return record(value) &&
    exactKeys(value, ["original_file", "original_hash", "never_overwrite", "never_copy_into_authored_output", "derived_artifact"]) &&
    value["original_file"] === "preserve" &&
    value["original_hash"] === "preserve" &&
    value["never_overwrite"] === true &&
    value["never_copy_into_authored_output"] === true &&
    value["derived_artifact"] === "separate";
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function sha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function role(value: unknown): value is VisualSourceRole {
  return value === "ordinary_content" || value === "immutable_reference";
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function fail(code: VisualSourceContractError["code"]): never {
  throw new VisualSourceContractError(code);
}
