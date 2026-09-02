import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ResearchFindingV1, ResearchRequestV1, ResearchResultV1 } from "@bg/shared";
import { runMigrationsFrom } from "../src/db/migrate";
import { beginResearchFinalization, claimResearchSource, commitResearchResult, completeResearchSource, createResearchRun, getResearchRun, listResearchSources, startResearchRun } from "../src/db/research-repository";
import { reconcileResearchState, type ResearchRecoveryDependencies } from "../src/services/research-recovery";
import { executeResearch } from "../src/services/research-orchestrator";
import { createProductionResearchDependencies } from "../src/routes/research";
import { reconcileResearchOnStartup } from "../src/bootstrap";

const digest = (character: string): string => character.repeat(64);
const request: ResearchRequestV1 = { schema_version: 1, purposes: ["prototype.dashboard"], sources: [{ kind: "web", locator: "https://example.test/a" }, { kind: "web", locator: "https://example.test/b" }], limits: { concurrency: 2, per_source_timeout_ms: 1_000, max_sources: 2, max_bytes_per_source: 1_000 }, orchestrator_version: "research-v1", mode: "live", fixture_id: null };
const fixtureRequest: ResearchRequestV1 = { schema_version: 1, purposes: ["prototype.dashboard", "prototype.landing"], sources: [{ kind: "fixture", locator: "fixture-a" }, { kind: "fixture", locator: "fixture-b" }], limits: { concurrency: 2, per_source_timeout_ms: 1_000, max_sources: 2, max_bytes_per_source: 1_024 }, orchestrator_version: "research-v1", mode: "fixture", fixture_id: "mass-research-v1" };
let db: Database;
let enqueued: string[];
let synthesized: string[];

beforeEach(async () => { db = new Database(":memory:"); db.exec("PRAGMA foreign_keys = ON"); await runMigrationsFrom(db, fileURLToPath(new URL("../src/db/migrations", import.meta.url))); enqueued = []; synthesized = []; });
afterEach(() => db.close());

function create(runId = "run-1", sourceIds: readonly string[] = ["source-1", "source-2"]): void { const ids = [runId, ...sourceIds]; createResearchRun(db, { requestKey: runId, request, orchestratorDigest: digest("a"), now: 10, newId: () => ids.shift() ?? "unused" }); }
function finding(sourceId: string): ResearchFindingV1 { return { schema_version: 1, source_id: sourceId, content_digest: digest("b"), observations: [], candidates: [] }; }
function succeed(runId: string, sourceId: string, now: number): void { claimResearchSource(db, { runId, sourceId, now: now - 1 }); completeResearchSource(db, { sourceId, attemptToken: 1, contentDigest: digest("b"), evidence: {}, finding: finding(sourceId), now }); }
function result(input: Parameters<ResearchRecoveryDependencies["synthesize"]>[0]): ResearchResultV1 { return { schema_version: 1, run_id: input.runId, request_digest: input.requestDigest, evidence_set_digest: input.evidenceSetDigest, outcome: input.sourceSummary.failed === 0 ? "completed" : "partial", common_rules: [], purpose_rules: { "deck.pitch": [], "prototype.dashboard": [], "prototype.diagram": [], "prototype.editorial": [], "prototype.landing": [], "prototype.sandbox": [] }, conflicts: [], source_summary: input.sourceSummary }; }
function dependencies(): ResearchRecoveryDependencies { return { now: () => 100, enqueue: async (runId) => { enqueued.push(runId); }, synthesize: async (input) => { synthesized.push(input.runId); return result(input); } }; }

describe("research startup recovery", () => {
  test("Given production startup finds a fixture run crashed during its second source When recovery starts without injected dependencies Then retryable work converges durably", async () => {
    const executionIds = ["run-crashed", "source-succeeded", "source-running"];
    const execution = await executeResearch(fixtureRequest, { ...createProductionResearchDependencies(fixtureRequest), newId: () => executionIds.shift() ?? "unused" });
    const sourceOutcome = execution.sources[0];
    expect(sourceOutcome).toMatchObject({ status: "succeeded", source: { id: "source-succeeded" } });
    if (sourceOutcome?.finding === null || sourceOutcome?.finding === undefined || sourceOutcome.contentDigest === null) throw new TypeError("fixture execution did not produce evidence");

    const persistedIds = ["run-crashed", "source-succeeded", "source-running"];
    createResearchRun(db, { requestKey: "crashed-fixture", request: fixtureRequest, orchestratorDigest: digest("a"), now: 10, newId: () => persistedIds.shift() ?? "unused" });
    startResearchRun(db, { runId: "run-crashed", now: 11 });
    claimResearchSource(db, { runId: "run-crashed", sourceId: "source-succeeded", now: 12 });
    completeResearchSource(db, { sourceId: "source-succeeded", attemptToken: 1, contentDigest: sourceOutcome.contentDigest, evidence: { final_url: "fixture-a" }, finding: sourceOutcome.finding, now: 13 });
    claimResearchSource(db, { runId: "run-crashed", sourceId: "source-running", now: 14 });
    const succeededBefore = db.query("SELECT content_digest,finding_json,finding_digest,attempt_count FROM research_sources WHERE id='source-succeeded'").get();

    await reconcileResearchOnStartup(db);

    expect(getResearchRun(db, "run-crashed")).toMatchObject({ status: "completed", usable: 1 });
    expect(listResearchSources(db, "run-crashed").map((source) => ({ status: source.status, attempts: source.attempt_count }))).toEqual([{ status: "succeeded", attempts: 1 }, { status: "succeeded", attempts: 2 }]);
    expect(db.query("SELECT content_digest,finding_json,finding_digest,attempt_count FROM research_sources WHERE id='source-succeeded'").get()).toEqual(succeededBefore);
    const durableResult = db.query("SELECT status,result_json,result_digest FROM research_runs WHERE id='run-crashed'").get();
    await reconcileResearchOnStartup(db);
    expect(db.query("SELECT status,result_json,result_digest FROM research_runs WHERE id='run-crashed'").get()).toEqual(durableResult);
  });

  test("Given bootstrap registration When startup order is inspected Then migrations precede research recovery", async () => {
    const source = await readFile(new URL("../src/bootstrap.ts", import.meta.url), "utf8");
    const migration = source.indexOf("await runMigrations();");
    const recovery = source.indexOf("await reconcileResearchOnStartup(getSqlite(), researchRecovery);");
    expect(migration).toBeGreaterThan(-1);
    expect(recovery).toBeGreaterThan(migration);
  });

  test("Given a crash before source commit When recovery runs Then running work is reset and enqueued", async () => {
    create(); startResearchRun(db, { runId: "run-1", now: 11 }); claimResearchSource(db, { runId: "run-1", sourceId: "source-1", now: 12 });
    await reconcileResearchState(db, dependencies());
    expect(getResearchRun(db, "run-1").status).toBe("recovering");
    expect(listResearchSources(db, "run-1").map((source) => source.status)).toEqual(["pending", "pending"]);
    expect(enqueued).toEqual(["run-1"]);
  });

  test("Given a crash after source commit When recovery runs Then evidence is preserved and remaining work is enqueued", async () => {
    create(); startResearchRun(db, { runId: "run-1", now: 11 }); succeed("run-1", "source-1", 13);
    const before = db.query("SELECT content_digest,finding_json,finding_digest FROM research_sources WHERE id='source-1'").get();
    await reconcileResearchState(db, dependencies());
    expect(db.query("SELECT content_digest,finding_json,finding_digest FROM research_sources WHERE id='source-1'").get()).toEqual(before);
    expect(listResearchSources(db, "run-1").map((source) => source.status)).toEqual(["succeeded", "pending"]);
  });

  test("Given crashes during synthesis or terminal commit When recovery runs Then synthesis repeats idempotently", async () => {
    create(); startResearchRun(db, { runId: "run-1", now: 11 }); succeed("run-1", "source-1", 13); succeed("run-1", "source-2", 15); beginResearchFinalization(db, { runId: "run-1", now: 16 });
    await reconcileResearchState(db, dependencies()); await reconcileResearchState(db, dependencies());
    expect(getResearchRun(db, "run-1")).toMatchObject({ status: "completed", usable: 1 });
    expect(synthesized).toEqual(["run-1"]);
  });

  test("Given persisted cancellation When recovery runs Then cancellation terminalizes without scheduling", async () => {
    create(); startResearchRun(db, { runId: "run-1", now: 11 }); db.prepare("UPDATE research_runs SET cancel_requested_at=12 WHERE id='run-1'").run();
    await reconcileResearchState(db, dependencies());
    expect(getResearchRun(db, "run-1")).toMatchObject({ status: "cancelled", stop_reason: "user_cancelled", completed_at: 100 });
    expect(listResearchSources(db, "run-1").map((source) => source.status)).toEqual(["cancelled", "cancelled"]);
    expect([enqueued, synthesized]).toEqual([[], []]);
  });

  test("Given malformed JSON or a forged digest When recovery runs Then each row is quarantined and unrelated runs continue", async () => {
    create(); db.prepare("UPDATE research_runs SET request_json='{' WHERE id='run-1'").run();
    create("run-2", ["source-3", "source-4"]); startResearchRun(db, { runId: "run-2", now: 11 }); succeed("run-2", "source-3", 13); db.prepare("UPDATE research_sources SET finding_digest=? WHERE id='source-3'").run(digest("f"));
    create("run-3", ["source-5", "source-6"]);
    await reconcileResearchState(db, dependencies());
    expect(db.query("SELECT id,status FROM research_runs ORDER BY id").all()).toEqual([{ id: "run-1", status: "corrupt" }, { id: "run-2", status: "corrupt" }, { id: "run-3", status: "recovering" }]);
    expect(db.query("SELECT status,error_code FROM research_sources WHERE id='source-3'").get()).toEqual({ status: "corrupt", error_code: "persisted_data_corrupt" });
    expect(enqueued).toEqual(["run-3"]);
  });

  test("Given queued work completes between passes When recovery runs twice Then the second pass converges through synthesis", async () => {
    create(); const deps = dependencies();
    await reconcileResearchState(db, deps);
    startResearchRun(db, { runId: "run-1", now: 101 }); succeed("run-1", "source-1", 103); succeed("run-1", "source-2", 105);
    await reconcileResearchState(db, deps);
    expect(getResearchRun(db, "run-1").status).toBe("completed");
    expect([enqueued, synthesized]).toEqual([["run-1"], ["run-1"]]);
  });

  test("Given a duplicate points outside its canonical predecessor When recovery runs Then both source and run are corrupt", async () => {
    const duplicateRequest = { ...request, sources: [request.sources[0], request.sources[0]] }; const ids = ["run-1", "source-1", "source-2"];
    createResearchRun(db, { requestKey: "run-1", request: duplicateRequest, orchestratorDigest: digest("a"), now: 10, newId: () => ids.shift() ?? "unused" });
    db.exec("PRAGMA foreign_keys = OFF"); db.prepare("UPDATE research_sources SET duplicate_of_source_id='missing' WHERE id='source-2'").run(); db.exec("PRAGMA foreign_keys = ON");
    await reconcileResearchState(db, dependencies());
    expect(db.query("SELECT status,error_code,duplicate_of_source_id FROM research_sources WHERE id='source-2'").get()).toEqual({ status: "corrupt", error_code: "persisted_data_corrupt", duplicate_of_source_id: null });
    expect(getResearchRun(db, "run-1").status).toBe("corrupt");
  });

  test("Given a forged published result digest When recovery runs Then unusable result authority is quarantined", async () => {
    create(); startResearchRun(db, { runId: "run-1", now: 11 }); succeed("run-1", "source-1", 13); succeed("run-1", "source-2", 15);
    const evidenceSetDigest = beginResearchFinalization(db, { runId: "run-1", now: 16 });
    const input = { runId: "run-1", request, requestDigest: getResearchRun(db, "run-1").request_digest, evidenceSetDigest, findings: [finding("source-1"), finding("source-2")], sourceSummary: { requested: 2, canonical: 2, succeeded: 2, failed: 0, duplicates: 0 } };
    commitResearchResult(db, { runId: "run-1", evidenceSetDigest, result: result(input), now: 17 });
    db.prepare("UPDATE research_runs SET result_digest=? WHERE id='run-1'").run(digest("f"));
    await reconcileResearchState(db, dependencies());
    expect(db.query("SELECT status,usable,result_json,result_digest FROM research_runs WHERE id='run-1'").get()).toEqual({ status: "corrupt", usable: 0, result_json: null, result_digest: null });
  });
});
