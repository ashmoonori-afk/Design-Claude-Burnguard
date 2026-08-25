import type {
  CatalogDesignSystemDetail, CatalogKind, CatalogLicense, CatalogLifecycle, CatalogProvenance,
  DesignSystemSourceType, UpdateDesignSystemRequest,
} from "@bg/shared";
import { ApiError, apiFetch } from "./client";

export async function getDesignSystem(id: string): Promise<CatalogDesignSystemDetail> {
  return parseCatalogDesignSystemDetail(await apiFetch<unknown>(`/api/design-systems/${id}`));
}

export type DesignSystemUpdateResult =
  | { readonly kind: "updated"; readonly system: CatalogDesignSystemDetail }
  | { readonly kind: "conflict"; readonly current: CatalogDesignSystemDetail };

export async function updateDesignSystemWithConflictReload(
  id: string,
  patch: UpdateDesignSystemRequest,
): Promise<DesignSystemUpdateResult> {
  try {
    const response = await apiFetch<unknown>(`/api/design-systems/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return { kind: "updated", system: parseCatalogDesignSystemDetail(response) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 412) return { kind: "conflict", current: await getDesignSystem(id) };
    throw error;
  }
}

export function parseCatalogDesignSystemDetail(input: unknown): CatalogDesignSystemDetail {
  const value = record(input);
  const content = record(value["content"]);
  const preview = nullableRecord(value["preview"]);
  const warning = nullableRecord(value["warning"]);
  const lineage = nullableRecord(value["lineage"]);
  return {
    id: text(value, "id"), name: text(value, "name"), description: nullableText(value, "description"),
    status: oneOf(value, "status", ["draft", "review", "published"]),
    source_type: nullableOneOf(value, "source_type", ["sample", "github", "website", "figma", "upload", "manual"] satisfies readonly DesignSystemSourceType[]),
    source_uri: nullableText(value, "source_uri"), dir_path: text(value, "dir_path"),
    skill_md_path: nullableText(value, "skill_md_path"), tokens_css_path: nullableText(value, "tokens_css_path"),
    readme_md_path: nullableText(value, "readme_md_path"), archived_at: nullableNumber(value, "archived_at"),
    is_template: boolean(value, "is_template"), thumbnail_path: nullableText(value, "thumbnail_path"),
    kind: oneOf(value, "kind", ["design-system", "pattern-library", "template"] satisfies readonly CatalogKind[]),
    owner: oneOf(value, "owner", ["local"]),
    lifecycle: oneOf(value, "lifecycle", ["active", "archived", "trashed", "partial", "corrupt"] satisfies readonly CatalogLifecycle[]),
    provenance: oneOf(value, "provenance", ["observed", "inferred", "defaulted", "unknown", "conflicted"] satisfies readonly CatalogProvenance[]),
    license: oneOf(value, "license", ["verified", "declared", "unknown", "restricted"] satisfies readonly CatalogLicense[]),
    tags: stringArray(value, "tags"), metadata_revision: number(value, "metadata_revision"),
    content: { revision: number(content, "revision"), receipt_id: nullableText(content, "receipt_id"), digest: text(content, "digest") },
    lineage: lineage === null ? null : {
      operation: oneOf(lineage, "operation", ["duplicate", "derive"]), parent_id: text(lineage, "parent_id"),
      parent_receipt_id: text(lineage, "parent_receipt_id"), parent_digest: text(lineage, "parent_digest"),
      reason: nullableText(lineage, "reason"), metadata: stringRecord(lineage, "metadata"),
    },
    preview: preview === null ? null : { path: text(preview, "path"), fallback: boolean(preview, "fallback") },
    usage: array(value, "usage").map((item) => { const usage = record(item); return { id: text(usage, "id"), name: text(usage, "name") }; }),
    warning: warning === null ? null : { code: oneOf(warning, "code", ["corrupt_receipt", "partial_operation"]) },
    created_at: number(value, "created_at"), updated_at: number(value, "updated_at"),
  };
}

export function catalogDetailRows(system: CatalogDesignSystemDetail): readonly { readonly label: string; readonly value: string }[] {
  return [
    { label: "Status", value: system.status }, { label: "Template", value: system.is_template ? "Yes" : "No" },
    { label: "Source", value: system.source_type ?? "manual" }, { label: "Source URI", value: system.source_uri ?? "None" },
    { label: "Directory", value: system.dir_path }, { label: "SKILL.md", value: system.skill_md_path ?? "None" },
    { label: "Tokens CSS", value: system.tokens_css_path ?? "None" }, { label: "README.md", value: system.readme_md_path ?? "None" },
    { label: "Archived", value: system.archived_at === null ? "No" : String(system.archived_at) },
  ];
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalidDetail();
  return Object.fromEntries(Object.entries(value));
}
function nullableRecord(value: unknown): Readonly<Record<string, unknown>> | null { return value === null ? null : record(value); }
function text(value: Readonly<Record<string, unknown>>, field: string): string { const item = value[field]; if (typeof item !== "string") throw invalidDetail(); return item; }
function nullableText(value: Readonly<Record<string, unknown>>, field: string): string | null { const item = value[field]; if (item === null) return null; if (typeof item !== "string") throw invalidDetail(); return item; }
function number(value: Readonly<Record<string, unknown>>, field: string): number { const item = value[field]; if (typeof item !== "number" || !Number.isFinite(item)) throw invalidDetail(); return item; }
function nullableNumber(value: Readonly<Record<string, unknown>>, field: string): number | null { const item = value[field]; return item === null ? null : number(value, field); }
function boolean(value: Readonly<Record<string, unknown>>, field: string): boolean { const item = value[field]; if (typeof item !== "boolean") throw invalidDetail(); return item; }
function array(value: Readonly<Record<string, unknown>>, field: string): readonly unknown[] { const item = value[field]; if (!Array.isArray(item)) throw invalidDetail(); return item; }
function stringArray(value: Readonly<Record<string, unknown>>, field: string): readonly string[] { const items = array(value, field); if (items.some((item) => typeof item !== "string")) throw invalidDetail(); return items.filter((item): item is string => typeof item === "string"); }
function stringRecord(value: Readonly<Record<string, unknown>>, field: string): Readonly<Record<string, string>> { const item = record(value[field]); if (Object.values(item).some((entry) => typeof entry !== "string")) throw invalidDetail(); return Object.fromEntries(Object.entries(item).filter((entry): entry is [string, string] => typeof entry[1] === "string")); }
function oneOf<const T extends string>(value: Readonly<Record<string, unknown>>, field: string, options: readonly T[]): T { const item = text(value, field); const match = options.find((option) => option === item); if (match === undefined) throw invalidDetail(); return match; }
function nullableOneOf<const T extends string>(value: Readonly<Record<string, unknown>>, field: string, options: readonly T[]): T | null { return value[field] === null ? null : oneOf(value, field, options); }
function invalidDetail(): TypeError { return new TypeError("Invalid catalog design-system detail"); }
