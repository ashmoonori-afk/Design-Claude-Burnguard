import { describe, expect, test } from "bun:test";
import { parseResearchConflict, parseResearchFindingV1, parseResearchRequestV1, parseResearchResultV1, parseResearchRule, parseResearchRunRecord, parseResearchSourceRecord } from "@bg/shared";

const digest = "a".repeat(64);
const request = {
  schema_version: 1,
  purposes: ["prototype.dashboard", "prototype.landing"],
  sources: [{ kind: "fixture", locator: "design-systems" }],
  limits: { concurrency: 2, per_source_timeout_ms: 5_000, max_sources: 10, max_bytes_per_source: 1_000_000 },
  orchestrator_version: "research-v1",
  mode: "fixture",
  fixture_id: "mass-research-v1",
};
const finding = {
  schema_version: 1,
  source_id: "source-1",
  content_digest: digest,
  observations: [{ axis: "layout", summary: "Dense layouts retain clear hierarchy.", source_locator: "design-systems" }],
  candidates: [{ purpose: "prototype.dashboard", axis: "layout", directive: "Group related metrics.", rationale: "Grouping improves scanning.", confidence: 0.8 }],
};
const rule = { id: "rule-1", axis: "layout", directive: "Group related metrics.", rationale: "Grouping improves scanning.", confidence: 0.8, source_ids: ["source-1"] };

describe("research contracts", () => {
  test("Given an exact fixture request When parsed Then purpose axes and limits remain distinct", () => {
    expect(parseResearchRequestV1(request)).toEqual(request);
  });

  test("Given unknown fields, unsorted purposes, or invalid mode data When parsed Then the request is rejected", () => {
    expect(() => parseResearchRequestV1({ ...request, project_type: "prototype" })).toThrow();
    expect(() => parseResearchRequestV1({ ...request, purposes: [...request.purposes].reverse() })).toThrow();
    expect(() => parseResearchRequestV1({ ...request, mode: "live", fixture_id: "mass-research-v1" })).toThrow();
    expect(() => parseResearchRequestV1({ ...request, limits: { ...request.limits, concurrency: 9 } })).toThrow();
  });

  test("Given a finding When confidence or digest is invalid Then the finding is rejected", () => {
    expect(parseResearchFindingV1(finding)).toEqual(finding);
    expect(() => parseResearchFindingV1({ ...finding, content_digest: "not-a-digest" })).toThrow();
    expect(() => parseResearchFindingV1({ ...finding, candidates: [{ ...finding.candidates[0], confidence: Number.NaN }] })).toThrow();
  });

  test("Given a deterministic result When parsed Then exact purpose rules and summary invariants are enforced", () => {
    const result = {
      schema_version: 1, run_id: "run-1", request_digest: digest, evidence_set_digest: digest, outcome: "completed",
      common_rules: [rule],
      purpose_rules: {
        "deck.pitch": [], "prototype.dashboard": [{ ...rule, id: "rule-2" }], "prototype.diagram": [],
        "prototype.editorial": [], "prototype.landing": [], "prototype.sandbox": [],
      },
      conflicts: [],
      source_summary: { requested: 1, canonical: 1, succeeded: 1, failed: 0, duplicates: 0 },
    };
    expect(parseResearchResultV1(result)).toEqual(result);
    expect(() => parseResearchResultV1({ ...result, purpose_rules: { ...result.purpose_rules, other: [] } })).toThrow();
    expect(() => parseResearchResultV1({ ...result, common_rules: [{ ...rule, source_ids: ["source-2", "source-1"] }] })).toThrow();
    expect(() => parseResearchResultV1({ ...result, outcome: "partial" })).toThrow();
    expect(parseResearchRule(rule)).toEqual(rule);
    expect(parseResearchConflict({ axis: "layout", rule_ids: ["rule-1", "rule-2"], explanation: "Rules target different densities." })).toBeDefined();
    expect(() => parseResearchResultV1({ ...result, conflicts: [{ axis: "layout", rule_ids: ["missing", "rule-1"], explanation: "Unknown rule." }] })).toThrow();
  });

  test("Given persisted rows When terminal state fields disagree Then parsing rejects them", () => {
    const run = {
      id: "run-1", request_key: "key-1", status: "completed", mode: "fixture", fixture_id: "mass-research-v1",
      request_json: JSON.stringify(request), request_digest: digest, orchestrator_digest: digest,
      evidence_set_digest: digest, result_json: "{}", result_digest: digest, usable: 1, stop_reason: null,
      cancel_requested_at: null, created_at: 1, updated_at: 2, completed_at: 2,
    };
    expect(parseResearchRunRecord(run)).toEqual(run);
    expect(() => parseResearchRunRecord({ ...run, status: "failed", usable: 1 })).toThrow();
    const source = {
      id: "source-1", run_id: "run-1", ordinal: 0, kind: "fixture", locator: "design-systems",
      canonical_locator: "design-systems", dedup_key: digest, duplicate_of_source_id: null, status: "succeeded",
      attempt_count: 1, http_status: null, content_digest: digest, evidence_json: "{}", finding_json: JSON.stringify(finding),
      finding_digest: digest, error_code: null, error_message: null, started_at: 1, finished_at: 2, created_at: 1, updated_at: 2,
    };
    expect(parseResearchSourceRecord(source)).toEqual(source);
    expect(() => parseResearchSourceRecord({ ...source, finding_digest: null })).toThrow();
  });
});
