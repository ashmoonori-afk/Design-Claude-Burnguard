import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
import type { ResearchFindingV1, ResearchRequestV1, ResearchResultV1 } from "@bg/shared";

export type ResearchTimerHandle = ReturnType<typeof setTimeout> | (() => void);
export type CanonicalSource = { readonly id: string; readonly ordinal: number; readonly kind: ResearchRequestV1["sources"][number]["kind"]; readonly locator: string; readonly canonicalLocator: string };
export type FetchedSource = { readonly bytes: Uint8Array; readonly finalUrl: string; readonly httpStatus: number | null; readonly document: unknown };
export type ResearchDependencies = {
  readonly now: () => number; readonly newId: () => string;
  readonly fetchSource: (input: { readonly source: CanonicalSource; readonly maxBytes: number }, signal: AbortSignal) => Promise<FetchedSource>;
  readonly runWorker: (input: { readonly source: CanonicalSource; readonly fetched: FetchedSource & { readonly contentDigest: string } }, signal: AbortSignal) => Promise<ResearchFindingV1>;
  readonly synthesize: (input: unknown, signal: AbortSignal) => Promise<ResearchResultV1>;
  readonly setTimer?: (callback: () => void, milliseconds: number) => ResearchTimerHandle; readonly clearTimer?: (handle: ResearchTimerHandle) => void;
};
export type ResearchExecution = { readonly status: "completed" | "partial" | "failed" | "cancelled"; readonly runId: string; readonly requestDigest: string; readonly evidenceSetDigest: string | null; readonly resultDigest: string | null; readonly result: ResearchResultV1 | null; readonly sources: readonly { readonly source: CanonicalSource; readonly status: "succeeded" | "failed" | "duplicate" | "cancelled"; readonly duplicateOf: string | null; readonly contentDigest: string | null; readonly finding: ResearchFindingV1 | null; readonly findingDigest: string | null; readonly errorCode: string | null; readonly startedAt: number | null; readonly finishedAt: number }[] };
export type ResearchRunner = (input: unknown, dependencies: ResearchDependencies, signal?: AbortSignal) => Promise<ResearchExecution>;
export type QaCleanup = { readonly complete: boolean; readonly active_resources: number; readonly temporary_files: number };
type Timer = { readonly callback: () => void };
type ProductModule = Readonly<Record<string, unknown>>;
const PRODUCT_ROOT = new URL("../../packages/backend/src/", import.meta.url);

export async function loadProductFunction<T extends (...arguments_: never[]) => unknown>(modulePath: string, exportName: string): Promise<T> {
  const loaded: unknown = await import(new URL(modulePath, PRODUCT_ROOT).href);
  if (!record(loaded) || typeof loaded[exportName] !== "function") throw new TypeError(`Missing product export ${exportName}`);
  return loaded[exportName] as T;
}
async function loadProductModule(modulePath: string, exports: readonly string[]): Promise<ProductModule> {
  const loaded: unknown = await import(new URL(modulePath, PRODUCT_ROOT).href);
  if (!record(loaded) || exports.some((name) => typeof loaded[name] !== "function")) throw new TypeError(`Invalid product module ${modulePath}`);
  return loaded;
}
export class QaResourceTracker {
  private readonly timers = new Set<Timer>(); private readonly signals = new Set<AbortSignal>(); private readonly artifacts = new Set<string>(); maximumTimers = 0;
  readonly setTimer = (callback: () => void): ResearchTimerHandle => { const timer = { callback }; this.timers.add(timer); this.maximumTimers = Math.max(this.maximumTimers, this.timers.size); return callback; };
  readonly clearTimer = (handle: ResearchTimerHandle): void => { if (typeof handle !== "function") return; const timer = [...this.timers].find((candidate) => candidate.callback === handle); if (timer !== undefined) this.timers.delete(timer); };
  fireFirst(): void { const timer = this.timers.values().next().value; if (timer === undefined) throw new TypeError("No research timer is armed"); timer.callback(); }
  observe(signal: AbortSignal): () => void { this.signals.add(signal); return () => this.signals.delete(signal); }
  trackArtifact(file: string): void { this.artifacts.add(file); } releaseArtifact(file: string): void { this.artifacts.delete(file); }
  cleanup(): QaCleanup { const active = this.timers.size + this.signals.size; return { complete: active === 0 && this.artifacts.size === 0, active_resources: active, temporary_files: this.artifacts.size }; }
}
export type CaseName = "timeout" | "fetch_failure" | "malformed_duplicate" | "partial_worker_failure" | "cancellation" | "restart_recovery" | "override_precedence" | "unknown_purpose";
type CaseResult = { readonly name: CaseName; readonly passed: boolean };
export async function runAdversarialCases(cases: readonly CaseName[], tracker: QaResourceTracker): Promise<readonly CaseResult[]> { const results: CaseResult[] = []; for (const name of cases) results.push({ name, passed: await runCase(name, tracker) }); return results; }
async function runCase(name: CaseName, tracker: QaResourceTracker): Promise<boolean> { switch (name) { case "timeout": return timeoutCase(tracker); case "fetch_failure": return fetchFailureCase(tracker); case "malformed_duplicate": return malformedDuplicateCase(tracker); case "partial_worker_failure": return partialWorkerFailureCase(tracker); case "cancellation": return cancellationCase(tracker); case "restart_recovery": return restartRecoveryCase(tracker); case "override_precedence": return promptPrecedenceCase(); case "unknown_purpose": return unknownPurposeCase(); } }
const liveRequest = (locators: readonly string[]): ResearchRequestV1 => ({ schema_version: 1, purposes: ["prototype.dashboard"], sources: locators.map((locator) => ({ kind: "web" as const, locator })), limits: { concurrency: 2, per_source_timeout_ms: 1_000, max_sources: 8, max_bytes_per_source: 1_024 }, orchestrator_version: "research-v1", mode: "live", fixture_id: null });
function fetched(locator: string, document: unknown = { schema_version: 1, title: "QA", claims: [{ axis: "layout", text: "Evidence" }] }): FetchedSource { return { bytes: new TextEncoder().encode(JSON.stringify(document)), finalUrl: locator, httpStatus: 200, document }; }
function finding(sourceId: string, contentDigest: string): ResearchFindingV1 { return { schema_version: 1, source_id: sourceId, content_digest: contentDigest, observations: [{ axis: "layout", summary: "Observed", source_locator: sourceId }], candidates: [{ purpose: "common", axis: "layout", directive: "Use evidence", rationale: "Observed", confidence: 0.8 }, { purpose: "prototype.dashboard", axis: "density", directive: "Bound density", rationale: "Observed", confidence: 0.8 }] }; }
async function productionDependencies(request: ResearchRequestV1, tracker: QaResourceTracker, overrides: Partial<ResearchDependencies>): Promise<ResearchDependencies> { const create = await loadProductFunction<(request: ResearchRequestV1) => ResearchDependencies>("routes/research.ts", "createProductionResearchDependencies"); let id = 0; return { ...create(request), newId: () => `qa-${++id}`, setTimer: tracker.setTimer, clearTimer: tracker.clearTimer, ...overrides }; }
async function execute(request: ResearchRequestV1, dependencies: ResearchDependencies, signal?: AbortSignal): Promise<ResearchExecution> { const run = await loadProductFunction<ResearchRunner>("services/research-orchestrator.ts", "executeResearch"); return run(request, dependencies, signal); }
async function migrate(db: Database): Promise<void> { const run = await loadProductFunction<(db: Database, directory: string) => Promise<void>>("db/migrate.ts", "runMigrationsFrom"); await run(db, fileURLToPath(new URL("../../packages/backend/src/db/migrations", import.meta.url))); }
async function timeoutCase(tracker: QaResourceTracker): Promise<boolean> { const request = liveRequest(["https://timeout.test/", "https://ok.test/"]); let ready: (() => void) | undefined; const subscribed = new Promise<void>((resolve) => { ready = resolve; }); const deps = await productionDependencies(request, tracker, { fetchSource: async ({ source }) => fetched(source.locator), runWorker: async ({ source, fetched: data }, signal) => source.ordinal === 0 ? new Promise((_, reject) => { signal.addEventListener("abort", () => reject(signal.reason), { once: true }); ready?.(); }) : finding(source.id, data.contentDigest) }); const running = execute(request, deps); await subscribed; tracker.fireFirst(); const result = await running; return result.status === "partial" && result.sources[0]?.errorCode === "source_timeout" && result.sources[1]?.status === "succeeded"; }
async function fetchFailureCase(tracker: QaResourceTracker): Promise<boolean> { const request = liveRequest(["https://failed.test/", "https://ok.test/"]); const deps = await productionDependencies(request, tracker, { fetchSource: async ({ source }) => { if (source.ordinal === 0) throw new TypeError("transport failed"); return fetched(source.locator); } }); const result = await execute(request, deps); return result.status === "partial" && result.sources[0]?.errorCode === "fetch_failed" && result.sources[1]?.status === "succeeded"; }
async function malformedDuplicateCase(tracker: QaResourceTracker): Promise<boolean> { const request = liveRequest(["https://ok.test/a#one", "https://ok.test/a#two", "https://bad.test/"]); const deps = await productionDependencies(request, tracker, { fetchSource: async ({ source }) => fetched(source.locator, source.ordinal === 2 ? { malformed: true } : undefined) }); const result = await execute(request, deps); return result.status === "partial" && result.sources[1]?.status === "duplicate" && result.sources[1]?.duplicateOf === result.sources[0]?.source.id && result.sources[2]?.errorCode === "malformed_source"; }
async function partialWorkerFailureCase(tracker: QaResourceTracker): Promise<boolean> { const request = liveRequest(["https://worker-failed.test/", "https://ok.test/"]); const deps = await productionDependencies(request, tracker, { fetchSource: async ({ source }) => fetched(source.locator), runWorker: async ({ source, fetched: data }) => { if (source.ordinal === 0) throw new TypeError("worker failed"); return finding(source.id, data.contentDigest); } }); const result = await execute(request, deps); return result.status === "partial" && result.sources[0]?.errorCode === "worker_failed" && result.sources[1]?.status === "succeeded"; }
type RouteAuthority = { readonly routes: { readonly request: (url: string, init?: RequestInit) => Promise<Response> }; readonly waitForRun: (runId: string) => Promise<void> };
type CreateRoutes = (options: { readonly db: Database; readonly dependencies?: ResearchDependencies; readonly ids?: readonly string[] }) => RouteAuthority;
type RunRecord = { readonly status: string; readonly usable: number };
type SourceRecord = { readonly attempt_count: number };
type DurableRunRow = { readonly status: string; readonly result_json: string | null; readonly result_digest: string | null };
async function cancellationCase(tracker: QaResourceTracker): Promise<boolean> { const createRoutes = await loadProductFunction<CreateRoutes>("routes/research.ts", "createResearchRoutes"); const getRun = await loadProductFunction<(db: Database, id: string) => RunRecord>("db/research-repository.ts", "getResearchRun"); const db = new Database(":memory:"); db.exec("PRAGMA foreign_keys = ON"); await migrate(db); let ready: (() => void) | undefined; const subscribed = new Promise<void>((resolve) => { ready = resolve; }); let durable = false; const request = liveRequest(["https://cancel.test/"]); const deps = await productionDependencies(request, tracker, { fetchSource: async ({ source }) => fetched(source.locator), runWorker: async (_input, signal) => new Promise((_, reject) => { const release = tracker.observe(signal); signal.addEventListener("abort", () => { durable = getRun(db, "qa-cancel-run").status === "cancelled"; release(); reject(signal.reason); }, { once: true }); ready?.(); }) }); try { const api = createRoutes({ db, dependencies: deps, ids: ["qa-cancel-run", "qa-cancel-source"] }); await api.routes.request("http://local/api/research/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request_key: "qa-cancel", request }) }); await subscribed; const response = await api.routes.request("http://local/api/research/runs/qa-cancel-run/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); await api.waitForRun("qa-cancel-run"); return response.status === 200 && durable && getRun(db, "qa-cancel-run").status === "cancelled"; } finally { db.close(); } }
type Repository = { readonly createResearchRun: (db: Database, input: Readonly<Record<string, unknown>>) => unknown; readonly startResearchRun: (db: Database, input: Readonly<Record<string, unknown>>) => unknown; readonly claimResearchSource: (db: Database, input: Readonly<Record<string, unknown>>) => unknown; readonly completeResearchSource: (db: Database, input: Readonly<Record<string, unknown>>) => unknown; readonly getResearchRun: (db: Database, id: string) => RunRecord; readonly listResearchSources: (db: Database, id: string) => readonly SourceRecord[] };
async function restartRecoveryCase(tracker: QaResourceTracker): Promise<boolean> {
  const repository = await loadProductModule("db/research-repository.ts", ["createResearchRun", "startResearchRun", "claimResearchSource", "completeResearchSource", "getResearchRun", "listResearchSources"]) as Repository;
  const create = await loadProductFunction<(request: ResearchRequestV1) => ResearchDependencies>("routes/research.ts", "createProductionResearchDependencies");
  const reconcile = await loadProductFunction<(db: Database) => Promise<void>>("bootstrap.ts", "reconcileResearchOnStartup");
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  await migrate(db);
  const request: ResearchRequestV1 = { ...liveRequest(["fixture-a", "fixture-b"]), sources: [{ kind: "fixture", locator: "fixture-a" }, { kind: "fixture", locator: "fixture-b" }], purposes: ["prototype.dashboard", "prototype.landing"], mode: "fixture", fixture_id: "mass-research-v1" };
  const executionIds = ["qa-recovery-run", "qa-recovery-source-1", "qa-recovery-source-2"];
  const execution = await execute(request, { ...create(request), newId: () => executionIds.shift() ?? "unused", setTimer: tracker.setTimer, clearTimer: tracker.clearTimer });
  const first = execution.sources[0];
  if (first?.finding == null || first.contentDigest === null) {
    db.close();
    return false;
  }
  try {
    const ids = ["qa-recovery-run", "qa-recovery-source-1", "qa-recovery-source-2"];
    repository.createResearchRun(db, { requestKey: "qa-recovery", request, orchestratorDigest: "a".repeat(64), now: 10, newId: () => ids.shift() ?? "unused" });
    repository.startResearchRun(db, { runId: "qa-recovery-run", now: 11 });
    repository.claimResearchSource(db, { runId: "qa-recovery-run", sourceId: "qa-recovery-source-1", now: 12 });
    repository.completeResearchSource(db, { sourceId: "qa-recovery-source-1", attemptToken: 1, contentDigest: first.contentDigest, evidence: {}, finding: first.finding, now: 13 });
    repository.claimResearchSource(db, { runId: "qa-recovery-run", sourceId: "qa-recovery-source-2", now: 14 });
    await reconcile(db);
    const run = repository.getResearchRun(db, "qa-recovery-run");
    const sources = repository.listResearchSources(db, "qa-recovery-run");
    const before = db.query<DurableRunRow, []>("SELECT status,result_json,result_digest FROM research_runs WHERE id='qa-recovery-run'").get();
    await reconcile(db);
    const after = db.query<DurableRunRow, []>("SELECT status,result_json,result_digest FROM research_runs WHERE id='qa-recovery-run'").get();
    return run.status === "completed" && run.usable === 1 && sources[0]?.attempt_count === 1 && sources[1]?.attempt_count === 2 && before !== null && JSON.stringify(after) === JSON.stringify(before);
  } finally {
    db.close();
  }
}
type PromptContext = { readonly precedence: readonly string[]; readonly routing: { readonly purpose: string | null; readonly creation_mode: string } };
async function promptPrecedenceCase(): Promise<boolean> { const build = await loadProductFunction<(input: { readonly projectType: "prototype"; readonly request: string; readonly hasCapturedFiles: boolean }) => PromptContext>("services/research-purpose.ts", "buildResearchPromptContext"); const context = build({ projectType: "prototype", request: "Create a dashboard", hasCapturedFiles: true }); return JSON.stringify(context.precedence) === JSON.stringify(["research", "design_system", "project", "user_request"]) && context.routing.purpose === "prototype.dashboard" && context.routing.creation_mode === "existing"; }
async function unknownPurposeCase(): Promise<boolean> { const createRoutes = await loadProductFunction<CreateRoutes>("routes/research.ts", "createResearchRoutes"); const db = new Database(":memory:"); db.exec("PRAGMA foreign_keys = ON"); await migrate(db); try { const api = createRoutes({ db }); const invalid = { ...liveRequest(["https://example.test/"]), purposes: ["prototype"] }; const response = await api.routes.request("http://local/api/research/dry-run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(invalid) }); const body: unknown = await response.json(); const count = db.query("SELECT COUNT(*) count FROM research_runs").get() as { readonly count: number } | null; return response.status === 400 && record(body) && record(body["error"]) && body["error"]["code"] === "invalid_research_request" && count?.count === 0; } finally { db.close(); } }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
