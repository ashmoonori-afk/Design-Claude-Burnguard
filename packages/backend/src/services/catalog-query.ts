import type { CatalogKind, CatalogLicense, CatalogLifecycle, CatalogProvenance } from "@bg/shared";

const FIELDS = new Set(["query", "tag", "kind", "owner", "lifecycle", "provenance", "license", "status", "sort", "direction", "limit", "offset"]);
type Status = "draft" | "review" | "published";
type Sort = "name" | "created_at" | "updated_at";
type Direction = "asc" | "desc";

export type CatalogQuery = {
  readonly query: string | null;
  readonly tag: string | null;
  readonly kind: CatalogKind | null;
  readonly owner: "local" | null;
  readonly lifecycle: CatalogLifecycle | null;
  readonly provenance: CatalogProvenance | null;
  readonly license: CatalogLicense | null;
  readonly status: Status | null;
  readonly sort: Sort;
  readonly direction: Direction;
  readonly limit: number;
  readonly offset: number;
};

export class CatalogQueryError extends Error {
  readonly name = "CatalogQueryError";
  readonly code = "invalid_catalog_query" as const;
  constructor(readonly field: string) { super(`Invalid catalog query field: ${field}`); }
}

export function parseCatalogQuery(url: string): CatalogQuery {
  const params = new URL(url).searchParams;
  for (const key of params.keys()) {
    if (!FIELDS.has(key) || params.getAll(key).length !== 1) throw new CatalogQueryError(key);
  }
  const owner = params.get("owner");
  if (owner !== null && owner !== "local") throw new CatalogQueryError("owner");
  return {
    query: normalizedOptional(params.get("query")),
    tag: normalizedOptional(params.get("tag")),
    kind: parseKind(params.get("kind")),
    owner,
    lifecycle: parseLifecycle(params.get("lifecycle")),
    provenance: parseProvenance(params.get("provenance")),
    license: parseLicense(params.get("license")),
    status: parseStatus(params.get("status")),
    sort: parseSort(params.get("sort")),
    direction: parseDirection(params.get("direction")),
    limit: boundedInteger(params, "limit", 50, 1, 100),
    offset: boundedInteger(params, "offset", 0, 0, 10_000),
  };
}

function normalizedOptional(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.normalize("NFC").trim().toLowerCase();
  return normalized.length === 0 ? null : normalized;
}
function parseKind(value: string | null): CatalogKind | null {
  switch (value) {
    case null: return null;
    case "design-system": case "pattern-library": case "template": return value;
    default: throw new CatalogQueryError("kind");
  }
}
function parseLifecycle(value: string | null): CatalogLifecycle | null {
  switch (value) {
    case null: return null;
    case "active": case "archived": case "trashed": case "partial": case "corrupt": return value;
    default: throw new CatalogQueryError("lifecycle");
  }
}
function parseProvenance(value: string | null): CatalogProvenance | null {
  switch (value) {
    case null: return null;
    case "observed": case "inferred": case "defaulted": case "unknown": case "conflicted": return value;
    default: throw new CatalogQueryError("provenance");
  }
}
function parseLicense(value: string | null): CatalogLicense | null {
  switch (value) {
    case null: return null;
    case "verified": case "declared": case "unknown": case "restricted": return value;
    default: throw new CatalogQueryError("license");
  }
}
function parseStatus(value: string | null): Status | null {
  switch (value) {
    case null: return null;
    case "draft": case "review": case "published": return value;
    default: throw new CatalogQueryError("status");
  }
}
function parseSort(value: string | null): Sort {
  switch (value) {
    case null: return "updated_at";
    case "name": case "created_at": case "updated_at": return value;
    default: throw new CatalogQueryError("sort");
  }
}
function parseDirection(value: string | null): Direction {
  switch (value) {
    case null: return "desc";
    case "asc": case "desc": return value;
    default: throw new CatalogQueryError("direction");
  }
}
function boundedInteger(params: URLSearchParams, field: string, fallback: number, minimum: number, maximum: number): number {
  const value = params.get(field);
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) throw new CatalogQueryError(field);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new CatalogQueryError(field);
  return parsed;
}
