import type { CatalogKind, CatalogLicense, CatalogProvenance, DesignSystemDetail } from "@bg/shared";

export class CatalogInputError extends Error {
  readonly name = "CatalogInputError";
  readonly code = "invalid_catalog_body" as const;
  constructor(readonly field: string) { super(`Invalid catalog body field: ${field}`); }
}

export type MetadataPatch = {
  readonly expectedRevision: number;
  readonly name?: string;
  readonly description?: string | null;
  readonly status?: DesignSystemDetail["status"];
  readonly tags?: readonly string[];
  readonly kind?: CatalogKind;
  readonly provenance?: CatalogProvenance;
  readonly license?: CatalogLicense;
  readonly lifecycle?: "active" | "archived";
};

export type ChildRequest = {
  readonly id: string;
  readonly name: string;
  readonly reason: string | null;
  readonly metadata: Readonly<Record<string, string>>;
  readonly parentReceiptId?: string;
  readonly parentDigest?: string;
};

export function parseMetadataPatch(input: unknown): MetadataPatch {
  const body = record(input);
  exactFields(body, ["expected_revision", "name", "description", "status", "tags", "kind", "provenance", "license", "lifecycle"]);
  const expectedRevision = body["expected_revision"];
  if (!Number.isSafeInteger(expectedRevision) || typeof expectedRevision !== "number" || expectedRevision < 0) throw new CatalogInputError("expected_revision");
  const name = optionalNonemptyString(body, "name");
  const descriptionValue = body["description"];
  if (descriptionValue !== undefined && descriptionValue !== null && typeof descriptionValue !== "string") throw new CatalogInputError("description");
  const status = optionalStatus(body["status"]);
  const tagsValue = body["tags"];
  if (tagsValue !== undefined && (!Array.isArray(tagsValue) || tagsValue.some((tag) => typeof tag !== "string"))) throw new CatalogInputError("tags");
  const kind = optionalKind(body["kind"]);
  const provenance = optionalProvenance(body["provenance"]);
  const license = optionalLicense(body["license"]);
  const lifecycle = optionalMetadataLifecycle(body["lifecycle"]);
  return {
    expectedRevision,
    ...(name === undefined ? {} : { name }),
    ...(descriptionValue === undefined ? {} : { description: descriptionValue === null ? null : descriptionValue.trim() || null }),
    ...(status === undefined ? {} : { status }),
    ...(tagsValue === undefined ? {} : { tags: tagsValue }),
    ...(kind === undefined ? {} : { kind }),
    ...(provenance === undefined ? {} : { provenance }),
    ...(license === undefined ? {} : { license }),
    ...(lifecycle === undefined ? {} : { lifecycle }),
  };
}

export function parseChildRequest(input: unknown, operation: "duplicate" | "derive"): ChildRequest {
  const body = record(input);
  const fields = operation === "duplicate"
    ? ["id", "name"]
    : ["id", "name", "parent_receipt_id", "parent_content_digest", "reason", "metadata"];
  exactFields(body, fields);
  const id = requiredNonemptyString(body, "id");
  const name = requiredNonemptyString(body, "name");
  if (operation === "duplicate") return { id, name, reason: null, metadata: {} };
  const parentReceiptId = requiredNonemptyString(body, "parent_receipt_id");
  const parentDigest = requiredNonemptyString(body, "parent_content_digest");
  const reason = requiredNonemptyString(body, "reason");
  const metadata = record(body["metadata"]);
  if (Object.entries(metadata).some(([key, value]) => key.trim().length === 0 || typeof value !== "string" || value.trim().length === 0)) throw new CatalogInputError("metadata");
  return { id, name, parentReceiptId, parentDigest, reason, metadata: Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, String(value)]).sort(([left], [right]) => left.localeCompare(right))) };
}

export function parseEmptyBody(input: unknown): void {
  const body = record(input);
  exactFields(body, []);
}

function record(input: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(input)) throw new CatalogInputError("body");
  return input;
}

function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function exactFields(body: Readonly<Record<string, unknown>>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(body).find((field) => !allowedSet.has(field));
  if (unknown !== undefined) throw new CatalogInputError(unknown);
}

function optionalNonemptyString(body: Readonly<Record<string, unknown>>, field: string): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) throw new CatalogInputError(field);
  return value.trim();
}

function requiredNonemptyString(body: Readonly<Record<string, unknown>>, field: string): string {
  const value = optionalNonemptyString(body, field);
  if (value === undefined) throw new CatalogInputError(field);
  return value;
}

function optionalStatus(value: unknown): DesignSystemDetail["status"] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new CatalogInputError("status");
  switch (value) {
    case "draft": case "review": case "published": return value;
    default: throw new CatalogInputError("status");
  }
}

function optionalKind(value: unknown): CatalogKind | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new CatalogInputError("kind");
  switch (value) {
    case "design-system": case "pattern-library": case "template": return value;
    default: throw new CatalogInputError("kind");
  }
}
function optionalProvenance(value: unknown): CatalogProvenance | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new CatalogInputError("provenance");
  switch (value) {
    case "observed": case "inferred": case "defaulted": case "unknown": case "conflicted": return value;
    default: throw new CatalogInputError("provenance");
  }
}
function optionalMetadataLifecycle(value: unknown): "active" | "archived" | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new CatalogInputError("lifecycle");
  switch (value) {
    case "active": case "archived": return value;
    default: throw new CatalogInputError("lifecycle");
  }
}
function optionalLicense(value: unknown): CatalogLicense | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new CatalogInputError("license");
  switch (value) {
    case "verified": case "declared": case "unknown": case "restricted": return value;
    default: throw new CatalogInputError("license");
  }
}
