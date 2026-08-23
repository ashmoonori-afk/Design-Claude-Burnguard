import { describe, expect, test } from "bun:test";
import * as shared from "@bg/shared";

type ParserName =
  | "parseExtractionProvenance"
  | "parseExtractionDomain"
  | "parseCatalogContract"
  | "parseLearningContract"
  | "parseArtifactOperation"
  | "parseExportAttempt";

function parseWith(name: ParserName, input: unknown): unknown {
  const parser = Reflect.get(shared, name);
  if (typeof parser !== "function") return { code: "parser_unavailable" };
  try {
    return parser(input);
  } catch (error) {
    if (error instanceof Error && "code" in error && typeof error.code === "string") {
      return { code: error.code };
    }
    throw error;
  }
}

const provenance = {
  identity: "token.color.brand", revision: 3, digest: "sha256:content-3",
  receipt_id: "receipt-extraction-3", state: "observed",
  evidence: [{ kind: "source", locator: "tokens.css:4", digest: "sha256:e1" }],
};
const catalog = {
  id: "system-stable", kind: "design-system", tags: ["accessible", "local"],
  lifecycle: "active", provenance: "observed", license: "verified",
  metadata_revision: 8,
  content: { revision: 2, receipt_id: "content-2", digest: "sha256:c2" },
  lineage: [{ parent_id: "system-parent", parent_receipt_id: "content-1", parent_digest: "sha256:c1" }],
};
const learning = {
  id: "lesson-stable", kind: "lesson", revision: 4,
  progress: { state: "in_progress", revision: 6, expected_revision: 5, feedback_draft: "Increase contrast" },
  checkpoint: {
    id: "checkpoint-1", parent_checkpoint_id: null, artifact_revision: 11,
    artifact_digest: "sha256:artifact-11",
    next_context: {
      kind: "iteration", parent_checkpoint_id: "checkpoint-1", schema_revision: 1,
      artifact_revision: 11, artifact_digest: "sha256:artifact-11",
    },
  },
};
const artifact = {
  id: "operation-stable", project_id: "project-1", status: "committed",
  base_revision: 10, base_digest: "sha256:base-10", result_revision: 11,
  result_digest: "sha256:result-11", expected_revision: 10,
  expected_file_hash: "sha256:file-before", node_fingerprint: "node:hero-title",
  diff: {
    before_digest: "sha256:file-before", after_digest: "sha256:file-after",
    before_bytes: 12, after_bytes: 14, exact_patch: "@@ -1 +1 @@",
  },
  retention: { snapshot_id: "snapshot-10", retained_until: 2000, replayable: true },
  replay: { cursor: 42, parent_operation_id: null },
};
const exportAttempt = {
  id: "attempt-2", job_id: "job-stable", parent_attempt_id: "attempt-1",
  status: "validated", project_revision: 11, project_digest: "sha256:project-11",
  digests: {
    options: "sha256:options", input_closure: "sha256:inputs", renderer: "sha256:renderer",
    capture: "sha256:capture", output: "sha256:output", receipt: "sha256:receipt",
  },
  progress: { stage: "validation", completed: 4, total: 4 }, stop_reason: null,
  findings: [{ code: "valid_document", path: null }],
  retention: { retained_until: 3000, output_available: true },
};

describe("strict upgrade contract boundaries", () => {
  test("Given border and an unknown domain When runtime contract parsing runs Then only border is accepted", () => {
    // Given / When / Then
    expect(parseWith("parseExtractionDomain", "border")).toBe("border");
    expect(parseWith("parseExtractionDomain", "outline")).toEqual({ code: "unknown_discriminant" });
  });
  test("rejects defaulted provenance without evidence", () => {
    expect(parseWith("parseExtractionProvenance", { ...provenance, state: "defaulted", evidence: [] }))
      .toEqual({ code: "missing_provenance_evidence" });
  });
  test("rejects an unknown export lifecycle status", () => {
    expect(parseWith("parseExportAttempt", { ...exportAttempt, status: "succeeded" }))
      .toEqual({ code: "invalid_export_status" });
  });
  test("rejects a conflict-sensitive patch without its base revision", () => {
    const { base_revision: _baseRevision, ...stalePatch } = artifact;
    expect(parseWith("parseArtifactOperation", stalePatch)).toEqual({ code: "missing_base_revision" });
  });
  test("rejects checkpoint context without an artifact digest", () => {
    const nextContext = {
      kind: learning.checkpoint.next_context.kind,
      parent_checkpoint_id: learning.checkpoint.next_context.parent_checkpoint_id,
      schema_revision: learning.checkpoint.next_context.schema_revision,
      artifact_revision: learning.checkpoint.next_context.artifact_revision,
    };
    expect(Object.hasOwn(nextContext, "artifact_digest")).toBe(false);
    expect(parseWith("parseLearningContract", {
      ...learning,
      checkpoint: { ...learning.checkpoint, next_context: nextContext },
    })).toEqual({ code: "missing_artifact_digest" });
  });

  test.each([
    ["parseExtractionProvenance", null], ["parseCatalogContract", []],
    ["parseLearningContract", 4], ["parseArtifactOperation", "{"],
    ["parseExportAttempt", "not-json"],
  ] satisfies readonly (readonly [ParserName, unknown])[])("rejects malformed input at %s", (name, input) => {
    const code = Reflect.get(Object(parseWith(name, input)), "code");
    expect(["expected_object", "invalid_json"]).toContain(code);
  });

  test.each([
    ["parseExtractionProvenance", { ...provenance, state: "guessed" }],
    ["parseCatalogContract", { ...catalog, kind: "gallery" }],
    ["parseLearningContract", { ...learning, kind: "quiz" }],
    ["parseArtifactOperation", { ...artifact, status: "done" }],
  ] satisfies readonly (readonly [ParserName, unknown])[])("rejects unknown discriminants at %s", (name, input) => {
    expect(parseWith(name, input)).toEqual({ code: "unknown_discriminant" });
  });

  test.each([
    ["parseExtractionProvenance", { ...provenance, identity: undefined }],
    ["parseCatalogContract", { ...catalog, metadata_revision: undefined }],
    ["parseLearningContract", { ...learning, progress: undefined }],
    ["parseArtifactOperation", { ...artifact, diff: undefined }],
    ["parseExportAttempt", { ...exportAttempt, digests: undefined }],
  ] satisfies readonly (readonly [ParserName, unknown])[])("rejects missing fields at %s", (name, input) => {
    expect(parseWith(name, input)).toEqual({ code: "missing_required_field" });
  });

  test("parses every lifecycle variant", () => {
    for (const state of ["observed", "inferred", "defaulted", "unknown", "conflicted"]) {
      const input = { ...provenance, state, source: "extractor", conflicts: state === "conflicted" ? ["sha256:other"] : undefined };
      expect(Reflect.get(Object(parseWith("parseExtractionProvenance", input)), "state")).toBe(state);
    }
    for (const status of ["preview", "pending", "working", "committed", "cancelled", "failed", "conflicted", "recovered", "reconnecting", "replaying"]) {
      expect(Reflect.get(Object(parseWith("parseArtifactOperation", { ...artifact, status })), "status")).toBe(status);
    }
    for (const status of ["pending", "running", "validating", "validated", "failed", "cancelled", "retrying", "recovering", "expired", "corrupt"]) {
      expect(Reflect.get(Object(parseWith("parseExportAttempt", { ...exportAttempt, status })), "status")).toBe(status);
    }
    for (const kind of ["lesson", "example", "skill-card"]) {
      expect(Reflect.get(Object(parseWith("parseLearningContract", { ...learning, kind })), "kind")).toBe(kind);
    }
  });

  test("keeps catalog identity metadata revision and content receipt separate", () => {
    const parsed = Object(parseWith("parseCatalogContract", catalog));
    expect([parsed.id, parsed.metadata_revision, parsed.content.receipt_id, parsed.content.digest])
      .toEqual(["system-stable", 8, "content-2", "sha256:c2"]);
  });
});
