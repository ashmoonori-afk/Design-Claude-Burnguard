import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import type { ResearchRequestV1, ResearchResultV1 } from "@bg/shared";
import { runMigrationsFrom } from "../src/db/migrate";
import { ResearchConflictError, ResearchCorruptionError, beginResearchFinalization, claimResearchSource, commitResearchResult, completeResearchSource, createResearchRun, evidenceSetDigest, failResearchSource, getResearchRun, listResearchSources, requestResearchCancellation, startResearchRun } from "../src/db/research-repository";

const digest = (character: string) => character.repeat(64);
const request: ResearchRequestV1 = {
  schema_version: 1,
  purposes: ["prototype.dashboard"],
  sources: [{ kind: "web", locator: "HTTPS://Example.COM:443/design#intro" }, { kind: "web", locator: "https://example.com/design" }, { kind: "fixture", locator: " second-source " }],
  limits: { concurrency: 2, per_source_timeout_ms: 5_000, max_sources: 10, max_bytes_per_source: 1_000_000 },
  orchestrator_version: "research-v1",
  mode: "fixture",
  fixture_id: "mass-research-v1",
};

let db: Database;
let nextId: () => string;

beforeEach(async () => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  await runMigrationsFrom(db, new URL("../src/db/migrations", import.meta.url).pathname);
  const ids = ["run-1", "source-1", "source-2", "source-3"];
  nextId = () => ids.shift() ?? "unused";
});
afterEach(() => db.close());

function create(input: ResearchRequestV1 = request) {
  return createResearchRun(db, { requestKey: "request-key", request: input, orchestratorDigest: digest("a"), now: 10, newId: nextId });
}

describe("research repository", () => {
  test("Given a valid request When created Then canonical and duplicate source rows are inserted deterministically", () => {
    const created = create();
    expect(created.run.status).toBe("pending");
    expect(created.sources.map((source) => [source.id, source.ordinal, source.canonical_locator, source.status, source.duplicate_of_source_id])).toEqual([
      ["source-1", 0, "https://example.com/design", "pending", null],
      ["source-2", 1, "https://example.com/design", "duplicate", "source-1"],
      ["source-3", 2, "second-source", "pending", null],
    ]);
  });

  test("Given an existing request key When replayed Then equal canonical input is idempotent and different input conflicts", () => {
    const first = create();
    const replay = createResearchRun(db, { requestKey: "request-key", request, orchestratorDigest: digest("a"), now: 20, newId: () => "must-not-persist" });
    expect(replay).toEqual(first);
    expect(() => createResearchRun(db, { requestKey: "request-key", request: { ...request, orchestrator_version: "research-v2" }, orchestratorDigest: digest("a"), now: 20, newId: () => "other" })).toThrow(new ResearchConflictError("idempotency_conflict"));
    expect(db.query("SELECT COUNT(*) count FROM research_runs").get()).toEqual({ count: 1 });
  });

  test("Given invalid boundary input When creation is attempted Then validation happens before a transaction writes", () => {
    expect(() => createResearchRun(db, { requestKey: " ", request, orchestratorDigest: "bad", now: 10, newId: nextId })).toThrow();
    expect(db.query("SELECT COUNT(*) count FROM research_runs").get()).toEqual({ count: 0 });
  });

  test("Given a claimed source When stale or repeated transitions arrive Then current state and attempt token guard it", () => {
    create(); startResearchRun(db, { runId: "run-1", now: 11 });
    const claimed = claimResearchSource(db, { runId: "run-1", sourceId: "source-1", now: 12 });
    const finding = { schema_version: 1 as const, source_id: "source-1", content_digest: digest("b"), observations: [], candidates: [] };
    expect(claimed.attempt_count).toBe(1);
    expect(() => completeResearchSource(db, { sourceId: "source-1", attemptToken: 0, contentDigest: digest("b"), evidence: { final_url: "https://example.com/design" }, finding, now: 13 })).toThrow(new ResearchConflictError("transition_conflict"));
    completeResearchSource(db, { sourceId: "source-1", attemptToken: 1, contentDigest: digest("b"), evidence: { final_url: "https://example.com/design" }, finding, now: 13 });
    expect(() => failResearchSource(db, { sourceId: "source-1", attemptToken: 1, errorCode: "worker_failed", message: "late worker", now: 14 })).toThrow(new ResearchConflictError("transition_conflict"));
  });

  test("Given mixed terminal source evidence When finalized Then a partial result commits atomically", () => {
    create(); startResearchRun(db, { runId: "run-1", now: 11 });
    claimResearchSource(db, { runId: "run-1", sourceId: "source-1", now: 12 });
    const finding = { schema_version: 1 as const, source_id: "source-1", content_digest: digest("b"), observations: [], candidates: [] };
    completeResearchSource(db, { sourceId: "source-1", attemptToken: 1, contentDigest: digest("b"), evidence: {}, finding, now: 13 });
    claimResearchSource(db, { runId: "run-1", sourceId: "source-3", now: 14 });
    failResearchSource(db, { sourceId: "source-3", attemptToken: 1, errorCode: "source_timeout", message: "deadline", now: 15 });
    const evidenceDigest = beginResearchFinalization(db, { runId: "run-1", now: 16 });
    commitResearchResult(db, { runId: "run-1", evidenceSetDigest: evidenceDigest, result: resultFor(evidenceDigest, "partial", 1), now: 17 });
    expect(getResearchRun(db, "run-1")).toMatchObject({ status: "partial", usable: 1, stop_reason: "partial_sources", result_json: expect.any(String) });
    expect(evidenceDigest).toBe(evidenceSetDigest(listResearchSources(db, "run-1")));
  });

  test("Given cancellation When requested Then it is persisted atomically, idempotently, and terminal rows stay immutable", () => {
    create(); startResearchRun(db, { runId: "run-1", now: 11 }); claimResearchSource(db, { runId: "run-1", sourceId: "source-1", now: 12 });
    const first = requestResearchCancellation(db, { runId: "run-1", now: 13 });
    const replay = requestResearchCancellation(db, { runId: "run-1", now: 99 });
    expect(first.cancel_requested_at).toBe(13);
    expect(replay.cancel_requested_at).toBe(13);
    expect(listResearchSources(db, "run-1").map((source) => source.status)).toEqual(["cancelled", "duplicate", "cancelled"]);
    expect(() => startResearchRun(db, { runId: "run-1", now: 100 })).toThrow(new ResearchConflictError("transition_conflict"));
  });

  test("Given finalization authority changes When committing Then cancellation and evidence rechecks reject publication", () => {
    create(); startResearchRun(db, { runId: "run-1", now: 11 });
    for (const sourceId of ["source-1", "source-3"]) { claimResearchSource(db, { runId: "run-1", sourceId, now: 12 }); failResearchSource(db, { sourceId, attemptToken: 1, errorCode: "worker_failed", message: "failed", now: 13 }); }
    const evidenceDigest = beginResearchFinalization(db, { runId: "run-1", now: 14 });
    expect(() => commitResearchResult(db, { runId: "run-1", evidenceSetDigest: digest("f"), result: resultFor(digest("f"), "partial", 0), now: 15 })).toThrow(new ResearchConflictError("evidence_conflict"));
    requestResearchCancellation(db, { runId: "run-1", now: 16 });
    expect(() => commitResearchResult(db, { runId: "run-1", evidenceSetDigest: evidenceDigest, result: resultFor(evidenceDigest, "partial", 0), now: 17 })).toThrow(new ResearchConflictError("transition_conflict"));
  });

  test("Given forged persisted JSON or finding digests When read Then corruption is rejected at the repository boundary", () => {
    const created = create();
    db.prepare("UPDATE research_runs SET request_json='{}' WHERE id='run-1'").run();
    expect(() => getResearchRun(db, "run-1")).toThrow(ResearchCorruptionError);
    db.prepare("UPDATE research_runs SET request_json=? WHERE id='run-1'").run(created.run.request_json);
    startResearchRun(db, { runId: "run-1", now: 11 }); claimResearchSource(db, { runId: "run-1", sourceId: "source-1", now: 12 });
    const finding = { schema_version: 1 as const, source_id: "source-1", content_digest: digest("b"), observations: [], candidates: [] };
    completeResearchSource(db, { sourceId: "source-1", attemptToken: 1, contentDigest: digest("b"), evidence: {}, finding, now: 13 });
    db.prepare("UPDATE research_sources SET finding_digest=? WHERE id='source-1'").run(digest("f"));
    expect(() => listResearchSources(db, "run-1")).toThrow(ResearchCorruptionError);
  });
});

function resultFor(evidenceDigest: string, outcome: "completed" | "partial", succeeded: number): ResearchResultV1 {
  return { schema_version: 1, run_id: "run-1", request_digest: getResearchRun(db, "run-1").request_digest, evidence_set_digest: evidenceDigest, outcome, common_rules: [], purpose_rules: { "deck.pitch": [], "prototype.dashboard": [], "prototype.diagram": [], "prototype.editorial": [], "prototype.landing": [], "prototype.sandbox": [] }, conflicts: [], source_summary: { requested: 3, canonical: 2, succeeded, failed: 2 - succeeded, duplicates: 1 } };
}
