import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import type { ResearchRequestV1, ResearchResultV1, ResearchRule } from "@bg/shared";
import { runMigrationsFrom } from "../src/db/migrate";
import { evidenceSetDigest } from "../src/db/research-repository";
import { loadResearchCatalog } from "../src/services/research-catalog";
import { ResearchSelectionError, resolveResearchRuleLayers, selectCatalogRules, selectResearchPromptContext } from "../src/services/research-selection";
import { canonicalJson, sha256 } from "../src/services/export-receipt";

const digest = (character: string): string => character.repeat(64);
const purpose = "prototype.dashboard" as const;
let db: Database;

beforeEach(async () => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  await runMigrationsFrom(db, new URL("../src/db/migrations", import.meta.url).pathname);
});
afterEach(() => db.close());

describe("research catalog selection", () => {
  test("Given a supported purpose When selected Then shipped common and purpose rules retain provenance", () => {
    // Given
    const catalog = loadResearchCatalog();
    // When
    const selected = selectCatalogRules(catalog, purpose);
    // Then
    expect(selected.common_rules.map((rule) => rule.id)).toEqual(["CR-002", "CR-003", "CR-007", "CR-015"]);
    expect(selected.purpose_rules).toHaveLength(3);
    expect(selected.purpose_rules[0]?.sources).toEqual([{ id: "S-031", url: "https://raw.githubusercontent.com/w3c/wcag/main/guidelines/sc/20/use-of-color.html" }, { id: "S-038", url: "https://www.nngroup.com/articles/dashboards-preattentive/" }, { id: "S-039", url: "https://www.nngroup.com/articles/data-tables/" }]);
  });

  test("Given declared layers When axes conflict Then later rules win with an explanation", () => {
    // Given
    const layers = [{ id: "research", rules: [rule("base", "layout", "Research default", 0.9)] }, { id: "project", rules: [rule("project", "layout", "Project decision", 0.8)] }, { id: "user", rules: [rule("user", "layout", "User request", 0.7)] }];
    // When
    const selected = resolveResearchRuleLayers(layers);
    // Then
    expect(selected.rules.map((item) => item.id)).toEqual(["user"]);
    expect(selected.conflicts).toEqual([{ axis: "layout", winner_id: "user", overridden_rule_ids: ["base", "project"] }]);
  });

  test("Given aliases When flattened Then references resolve and invalid cycles are rejected", () => {
    // Given
    const valid = [{ id: "project", rules: [rule("base", "layout", "Base", 0.8), { id: "alias", reference: "base" }] }];
    // When
    const selected = resolveResearchRuleLayers(valid);
    // Then
    expect(selected.rules[0]).toMatchObject({ id: "alias", directive: "Base" });
    expect(() => resolveResearchRuleLayers([{ id: "bad", rules: [{ id: "a", reference: "b" }, { id: "b", reference: "a" }] }])).toThrow(ResearchSelectionError);
    expect(() => resolveResearchRuleLayers([{ id: "bad", rules: [{ id: "a", reference: "missing" }] }])).toThrow(ResearchSelectionError);
  });

  test("Given a medium-confidence purpose When selected Then reduced confidence stays explicit", () => {
    // Given
    const catalog = loadResearchCatalog();
    // When
    const selected = selectCatalogRules(catalog, "deck.pitch");
    // Then
    expect(selected.confidence).toBe("medium");
    expect(selected.low_confidence).toBe(true);
    expect(selected.limitations).toContain("not a universal investor-pitch narrative");
  });

  test("Given a prompt-only deck purpose When selected Then catalog rules resolve while persisted selection rejects it", () => {
    // Given
    const catalog = loadResearchCatalog();
    // When
    const selected = selectCatalogRules(catalog, "deck.training");
    // Then
    expect(selected.purpose).toBe("deck.training");
    expect(selected.confidence).toBe("medium");
    expect(selected.low_confidence).toBe(true);
    expect(selected.common_rules.map((rule) => rule.id)).toEqual(["CR-001", "CR-002", "CR-004", "CR-008"]);
    expect(selected.purpose_rules.map((rule) => rule.id)).toEqual(["deck.training:1", "deck.training:2", "deck.training:3"]);
    expect(selected.purpose_rules.every((rule) => rule.sources.length > 0 && rule.low_confidence)).toBe(true);
    expect(() => selectResearchPromptContext(db, "deck.training")).toThrow(ResearchSelectionError);
  });

  test("Given usable runtime results When selected Then newest valid result and citations are preserved", () => {
    // Given
    persistResult({ id: "run-a", completedAt: 20, directive: "Older" });
    persistResult({ id: "run-z", completedAt: 20, directive: "Newest by ID" });
    // When
    const selected = selectResearchPromptContext(db, purpose);
    // Then
    expect(selected).toMatchObject({ run_id: "run-z", outcome: "completed", result_digest: expect.any(String) });
    expect(selected?.purpose_rules[0]).toMatchObject({ directive: "Newest by ID", rationale: "Newest by ID rationale", confidence: 0.4, low_confidence: true, source_ids: ["source-run-z"] });
    expect(selected?.conflicts).toEqual([{ axis: "data-comparison", rule_ids: ["common-run-z", "runtime-run-z"], explanation: "Runtime evidence conflicts on comparison." }]);
    expect(selected?.purpose_rules[0]?.sources).toEqual([{ id: "source-run-z", url: "https://example.com/run-z" }]);
  });

  test("Given a corrupt newest result When selected Then it is quarantined and the next valid result is used", () => {
    // Given
    persistResult({ id: "run-old", completedAt: 10, directive: "Fallback" });
    persistResult({ id: "run-new", completedAt: 11, directive: "Corrupt" });
    db.prepare("UPDATE research_runs SET result_digest=? WHERE id='run-new'").run(digest("f"));
    // When
    const selected = selectResearchPromptContext(db, purpose);
    // Then
    expect(selected?.run_id).toBe("run-old");
    expect(db.query("SELECT status,usable,stop_reason,result_json,result_digest FROM research_runs WHERE id='run-new'").get()).toEqual({ status: "corrupt", usable: 0, stop_reason: "persisted_data_corrupt", result_json: null, result_digest: null });
  });

  test("Given no usable result or an unknown purpose When selected Then none is returned or input is rejected", () => {
    // Given
    const catalog = loadResearchCatalog();
    // When
    const selected = selectResearchPromptContext(db, purpose);
    // Then
    expect(selected).toBeNull();
    expect(() => selectCatalogRules(catalog, "other")).toThrow(ResearchSelectionError);
    expect(() => selectResearchPromptContext(db, "other")).toThrow(ResearchSelectionError);
  });
});

function rule(id: string, axis: string, directive: string, confidence: number): ResearchRule {
  return { id, axis, directive, rationale: `${directive} rationale`, confidence, source_ids: ["source"] };
}

function persistResult(input: { readonly id: string; readonly completedAt: number; readonly directive: string }): void {
  const sourceId = `source-${input.id}`;
  const contentDigest = digest("c");
  const finding = { schema_version: 1, source_id: sourceId, content_digest: contentDigest, observations: [], candidates: [] } as const;
  const findingJson = canonicalJson(finding);
  const request: ResearchRequestV1 = { schema_version: 1, purposes: [purpose], sources: [{ kind: "web", locator: `https://example.com/${input.id}` }], limits: { concurrency: 1, per_source_timeout_ms: 1_000, max_sources: 1, max_bytes_per_source: 1_000 }, orchestrator_version: "test", mode: "live", fixture_id: null };
  const requestJson = canonicalJson(request);
  const requestDigest = sha256(requestJson);
  db.prepare("INSERT INTO research_runs(id,request_key,status,mode,fixture_id,request_json,request_digest,orchestrator_digest,created_at,updated_at) VALUES (?,?, 'finalizing','live',NULL,?,?,?,?,?)").run(input.id, input.id, requestJson, requestDigest, digest("a"), 1, 1);
  db.prepare("INSERT INTO research_sources(id,run_id,ordinal,kind,locator,canonical_locator,dedup_key,status,attempt_count,content_digest,evidence_json,finding_json,finding_digest,created_at,updated_at) VALUES (?,?,0,'web',?,?,?,'succeeded',1,?,'{}',?,?,1,1)").run(sourceId, input.id, `https://example.com/${input.id}`, `https://example.com/${input.id}`, digest("d"), contentDigest, findingJson, sha256(findingJson));
  const sources = db.query("SELECT * FROM research_sources WHERE run_id=? ORDER BY ordinal").all(input.id);
  const evidenceDigest = evidenceSetDigest(sources);
  const result: ResearchResultV1 = { schema_version: 1, run_id: input.id, request_digest: requestDigest, evidence_set_digest: evidenceDigest, outcome: "completed", common_rules: [{ ...rule(`common-${input.id}`, "data-comparison", "Runtime common", 0.9), source_ids: [sourceId] }], purpose_rules: { "deck.pitch": [], "prototype.dashboard": [{ ...rule(`runtime-${input.id}`, "data-comparison", input.directive, 0.4), source_ids: [sourceId] }], "prototype.diagram": [], "prototype.editorial": [], "prototype.landing": [], "prototype.sandbox": [] }, conflicts: [{ axis: "data-comparison", rule_ids: [`common-${input.id}`, `runtime-${input.id}`], explanation: "Runtime evidence conflicts on comparison." }], source_summary: { requested: 1, canonical: 1, succeeded: 1, failed: 0, duplicates: 0 } };
  const resultJson = canonicalJson(result);
  db.prepare("UPDATE research_runs SET status='completed',evidence_set_digest=?,result_json=?,result_digest=?,usable=1,completed_at=?,updated_at=? WHERE id=?").run(evidenceDigest, resultJson, sha256(resultJson), input.completedAt, input.completedAt, input.id);
}
