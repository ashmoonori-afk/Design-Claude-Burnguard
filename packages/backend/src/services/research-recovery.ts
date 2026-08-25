import type { Database } from "bun:sqlite";
import {
  UpgradeContractError,
  parseResearchFindingV1,
  parseResearchRequestV1,
  parseResearchResultV1,
  parseResearchRunRecord,
  parseResearchSourceRecord,
  type ResearchFindingV1,
  type ResearchRequestV1,
  type ResearchResultV1,
  type ResearchRunRecord,
  type ResearchSourceRecord,
} from "@bg/shared";
import { beginResearchFinalization, commitResearchResult, evidenceSetDigest } from "../db/research-repository";
import { canonicalJson, sha256 } from "./export-receipt";
import type { ResearchSynthesisInput } from "./research-orchestrator";

export type ResearchRecoveryDependencies = {
  readonly now: () => number;
  readonly enqueue: (runId: string) => Promise<void>;
  readonly synthesize: (input: ResearchSynthesisInput) => Promise<ResearchResultV1>;
};

export type ResearchRecoveryReceipt = { readonly recovered: number; readonly enqueued: number; readonly synthesized: number; readonly cancelled: number; readonly corrupt: number };

type RecoveryState = { recovered: number; enqueued: number; synthesized: number; cancelled: number; corrupt: number };
type RecoveredRun = { readonly run: ResearchRunRecord; readonly request: ResearchRequestV1; readonly sources: readonly ResearchSourceRecord[] };
type QuarantineInput = { readonly runId: string; readonly sourceId: string | null; readonly now: number };
type RawRun = ResearchRunRecord;
type RawSource = ResearchSourceRecord;

class PersistedResearchRowError extends Error {
  readonly name = "PersistedResearchRowError";
  constructor(readonly sourceId: string | null) { super(sourceId ?? "run"); }
}

export async function reconcileResearchState(db: Database, deps: ResearchRecoveryDependencies): Promise<ResearchRecoveryReceipt> {
  const rows = db.query<RawRun, []>("SELECT * FROM research_runs ORDER BY created_at,id").all();
  const state: RecoveryState = { recovered: 0, enqueued: 0, synthesized: 0, cancelled: 0, corrupt: 0 };
  for (const rawRun of rows) {
    try {
      const run = parseResearchRunRecord(rawRun);
      const request = validatedRequest(run);
      const sources = validatedSources(db, run);
      if (run.status === "completed" || run.status === "partial") validatePublishedResult(run, sources);
      if (isTerminal(run.status)) continue;
      if (run.cancel_requested_at !== null) {
        terminalizeCancellation(db, run.id, deps.now());
        state.cancelled += 1;
        continue;
      }
      recoverAuthority(db, run.id, deps.now());
      state.recovered += 1;
      const recoveredSources = validatedSources(db, { ...run, status: "recovering", updated_at: deps.now() });
      if (recoveredSources.some((source) => source.status === "pending")) {
        await deps.enqueue(run.id);
        state.enqueued += 1;
        continue;
      }
      await synthesizeRecoveredRun(db, deps, { run, request, sources: recoveredSources });
      state.synthesized += 1;
    } catch (error) {
      if (!isRowCorruption(error)) throw error;
      quarantine(db, { runId: rawRun.id, sourceId: error instanceof PersistedResearchRowError ? error.sourceId : null, now: deps.now() });
      state.corrupt += 1;
    }
  }
  return state;
}

function validatedRequest(run: ResearchRunRecord): ResearchRequestV1 {
  const request = parseResearchRequestV1(run.request_json);
  if (sha256(canonicalJson(request)) !== run.request_digest || request.mode !== run.mode || request.fixture_id !== run.fixture_id) throw new PersistedResearchRowError(null);
  return request;
}

function validatedSources(db: Database, run: ResearchRunRecord): readonly ResearchSourceRecord[] {
  const rawSources = db.query<RawSource, [string]>("SELECT * FROM research_sources WHERE run_id=? ORDER BY ordinal").all(run.id);
  const sources: ResearchSourceRecord[] = [];
  const canonical = new Map<string, string>();
  for (const rawSource of rawSources) {
    let source: ResearchSourceRecord;
    try { source = parseResearchSourceRecord(rawSource); }
    catch (error) { if (error instanceof UpgradeContractError) throw new PersistedResearchRowError(rawSource.id); throw error; }
    if (source.run_id !== run.id) throw new PersistedResearchRowError(source.id);
    if (source.status === "succeeded") validateFinding(source);
    if (source.duplicate_of_source_id === null) canonical.set(source.dedup_key, source.id);
    else if (canonical.get(source.dedup_key) !== source.duplicate_of_source_id) throw new PersistedResearchRowError(source.id);
    sources.push(source);
  }
  return sources;
}

function validateFinding(source: ResearchSourceRecord): void {
  if (source.finding_json === null || source.finding_digest === null || source.content_digest === null) throw new PersistedResearchRowError(source.id);
  const finding = parseResearchFindingV1(source.finding_json);
  if (finding.source_id !== source.id || finding.content_digest !== source.content_digest || sha256(canonicalJson(finding)) !== source.finding_digest) throw new PersistedResearchRowError(source.id);
}

function validatePublishedResult(run: ResearchRunRecord, sources: readonly ResearchSourceRecord[]): void {
  if (run.result_json === null || run.result_digest === null || run.evidence_set_digest === null) throw new PersistedResearchRowError(null);
  const result = parseResearchResultV1(run.result_json);
  const evidenceDigest = evidenceSetDigest(sources);
  if (sha256(canonicalJson(result)) !== run.result_digest || evidenceDigest !== run.evidence_set_digest || result.run_id !== run.id || result.request_digest !== run.request_digest || result.evidence_set_digest !== evidenceDigest) throw new PersistedResearchRowError(null);
}

function recoverAuthority(db: Database, runId: string, now: number): void {
  db.transaction(() => {
    db.prepare("UPDATE research_runs SET status='recovering',updated_at=? WHERE id=? AND status IN ('pending','running','finalizing','recovering')").run(now, runId);
    db.prepare("UPDATE research_sources SET status='recovering',updated_at=? WHERE run_id=? AND status='running'").run(now, runId);
    db.prepare("UPDATE research_sources SET status='pending',started_at=NULL,finished_at=NULL,updated_at=? WHERE run_id=? AND status='recovering'").run(now, runId);
  })();
}

async function synthesizeRecoveredRun(db: Database, deps: ResearchRecoveryDependencies, recovered: RecoveredRun): Promise<void> {
  const { run, request, sources } = recovered;
  const succeeded = sources.filter((source) => source.duplicate_of_source_id === null && source.status === "succeeded");
  if (succeeded.length === 0) {
    terminalizeFailure(db, run.id, deps.now());
    return;
  }
  const evidenceDigest = beginResearchFinalization(db, { runId: run.id, now: deps.now() });
  const canonical = sources.filter((source) => source.duplicate_of_source_id === null);
  const findings = succeeded.map((source) => parseFinding(source));
  const input: ResearchSynthesisInput = { runId: run.id, request, requestDigest: run.request_digest, evidenceSetDigest: evidenceDigest, findings, sourceSummary: { requested: sources.length, canonical: canonical.length, succeeded: succeeded.length, failed: canonical.length - succeeded.length, duplicates: sources.length - canonical.length } };
  const result = parseResearchResultV1(await deps.synthesize(input));
  commitResearchResult(db, { runId: run.id, evidenceSetDigest: evidenceDigest, result, now: deps.now() });
}

function parseFinding(source: ResearchSourceRecord): ResearchFindingV1 {
  if (source.finding_json === null) throw new PersistedResearchRowError(source.id);
  return parseResearchFindingV1(source.finding_json);
}

function terminalizeCancellation(db: Database, runId: string, now: number): void {
  db.transaction(() => {
    db.prepare("UPDATE research_runs SET status='cancelled',stop_reason='user_cancelled',completed_at=?,updated_at=? WHERE id=? AND status IN ('pending','running','finalizing','recovering') AND cancel_requested_at IS NOT NULL").run(now, now, runId);
    db.prepare("UPDATE research_sources SET status='cancelled',error_code='user_cancelled',error_message='user cancelled',finished_at=?,updated_at=? WHERE run_id=? AND status IN ('pending','running','recovering')").run(now, now, runId);
  })();
}

function terminalizeFailure(db: Database, runId: string, now: number): void {
  db.prepare("UPDATE research_runs SET status='failed',stop_reason='no_usable_result',completed_at=?,updated_at=? WHERE id=? AND status='recovering'").run(now, now, runId);
}

function quarantine(db: Database, input: QuarantineInput): void {
  db.transaction(() => {
    if (input.sourceId !== null) db.prepare("UPDATE research_sources SET status='corrupt',dedup_key=?,duplicate_of_source_id=NULL,error_code='persisted_data_corrupt',error_message='persisted research data is corrupt',finished_at=COALESCE(finished_at,?),updated_at=? WHERE id=?").run(sha256(`corrupt:${input.sourceId}`), input.now, input.now, input.sourceId);
    db.prepare("UPDATE research_sources SET status='corrupt',duplicate_of_source_id=NULL,error_code='persisted_data_corrupt',error_message='persisted research data is corrupt',finished_at=COALESCE(finished_at,?),updated_at=? WHERE run_id=? AND status IN ('pending','running','recovering')").run(input.now, input.now, input.runId);
    db.prepare("UPDATE research_runs SET status='corrupt',evidence_set_digest=NULL,result_json=NULL,result_digest=NULL,usable=0,stop_reason='persisted_data_corrupt',completed_at=COALESCE(completed_at,?),updated_at=? WHERE id=?").run(input.now, input.now, input.runId);
  })();
}

function isRowCorruption(error: unknown): boolean { return error instanceof UpgradeContractError || error instanceof PersistedResearchRowError; }
function isTerminal(status: ResearchRunRecord["status"]): boolean { return status === "completed" || status === "partial" || status === "cancelled" || status === "failed" || status === "corrupt"; }
