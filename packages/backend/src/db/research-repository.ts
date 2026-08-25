import type { Database } from "bun:sqlite";
import {
  UpgradeContractError,
  parseResearchDigest,
  parseResearchFindingV1,
  parseResearchRequestV1,
  parseResearchResultV1,
  parseResearchRunRecord,
  parseResearchSourceRecord,
  type ResearchRequestV1,
  type ResearchRunRecord,
  type ResearchSourceErrorCode,
  type ResearchSourceRecord,
} from "@bg/shared";
import { canonicalJson, sha256 } from "../services/export-receipt";

export class ResearchConflictError extends Error {
  readonly name = "ResearchConflictError";
  constructor(readonly code: "idempotency_conflict" | "transition_conflict" | "evidence_conflict") { super(code); }
}
export class ResearchCorruptionError extends Error {
  readonly name = "ResearchCorruptionError";
  constructor(readonly entityId: string) { super(`corrupt persisted research data: ${entityId}`); }
}
export class ResearchValidationError extends Error {
  readonly name = "ResearchValidationError";
  constructor(readonly field: string) { super(`invalid research input: ${field}`); }
}

type CreateInput = { readonly requestKey: string; readonly request: unknown; readonly orchestratorDigest: string; readonly now: number; readonly newId: () => string };
type CreatedRun = { readonly run: ResearchRunRecord; readonly sources: readonly ResearchSourceRecord[] };
type TimedRun = { readonly runId: string; readonly now: number };
type SourceToken = { readonly sourceId: string; readonly attemptToken: number; readonly now: number };
type CompleteSource = SourceToken & { readonly contentDigest: string; readonly evidence: unknown; readonly finding: unknown; readonly httpStatus?: number | null };
type FailSource = SourceToken & { readonly errorCode: Exclude<ResearchSourceErrorCode, "user_cancelled" | "persisted_data_corrupt">; readonly message: string };
type CommitResult = TimedRun & { readonly evidenceSetDigest: string; readonly result: unknown };

export function createResearchRun(db: Database, input: CreateInput): CreatedRun {
  const prepared = prepareCreation(input);
  return db.transaction(() => {
    const existing = rawRunByKey(db, prepared.requestKey);
    if (existing !== null) {
      const run = persistedRun(existing);
      if (run.request_digest !== prepared.requestDigest) throw new ResearchConflictError("idempotency_conflict");
      return { run, sources: listResearchSources(db, run.id) };
    }
    const runId = requiredId(input.newId(), "run_id");
    db.prepare("INSERT INTO research_runs(id,request_key,status,mode,fixture_id,request_json,request_digest,orchestrator_digest,created_at,updated_at) VALUES (?,?, 'pending',?,?,?,?,?,?,?)")
      .run(runId, prepared.requestKey, prepared.request.mode, prepared.request.fixture_id, prepared.requestJson, prepared.requestDigest, prepared.orchestratorDigest, input.now, input.now);
    const canonicalByDedup = new Map<string, string>();
    for (const [ordinal, source] of prepared.request.sources.entries()) {
      const sourceId = requiredId(input.newId(), `sources.${ordinal}.id`);
      const dedupKey = sha256(canonicalJson({ kind: source.kind, locator: source.locator }));
      const canonicalId = canonicalByDedup.get(dedupKey) ?? null;
      if (canonicalId === null) canonicalByDedup.set(dedupKey, sourceId);
      db.prepare("INSERT INTO research_sources(id,run_id,ordinal,kind,locator,canonical_locator,dedup_key,duplicate_of_source_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .run(sourceId, runId, ordinal, source.kind, source.locator, source.locator, dedupKey, canonicalId, canonicalId === null ? "pending" : "duplicate", input.now, input.now);
    }
    return { run: getResearchRun(db, runId), sources: listResearchSources(db, runId) };
  })();
}

export function getResearchRun(db: Database, runId: string): ResearchRunRecord {
  const row = db.query<ResearchRunRecord, [string]>("SELECT * FROM research_runs WHERE id=?").get(runId);
  if (row === null) throw new ResearchConflictError("transition_conflict");
  return persistedRun(row);
}

export function listResearchSources(db: Database, runId: string): readonly ResearchSourceRecord[] {
  const rows = db.query<ResearchSourceRecord, [string]>("SELECT * FROM research_sources WHERE run_id=? ORDER BY ordinal").all(runId).map(persistedSource);
  const canonical = new Map<string, string>();
  for (const row of rows) {
    if (row.duplicate_of_source_id === null) canonical.set(row.dedup_key, row.id);
    else if (canonical.get(row.dedup_key) !== row.duplicate_of_source_id) throw new ResearchCorruptionError(row.id);
  }
  return rows;
}

export function startResearchRun(db: Database, input: TimedRun): ResearchRunRecord {
  changed(db.prepare("UPDATE research_runs SET status='running',updated_at=? WHERE id=? AND status IN ('pending','recovering') AND cancel_requested_at IS NULL").run(input.now, input.runId).changes);
  return getResearchRun(db, input.runId);
}

export function claimResearchSource(db: Database, input: TimedRun & { readonly sourceId: string }): ResearchSourceRecord {
  return db.transaction(() => {
    const result = db.prepare("UPDATE research_sources SET status='running',attempt_count=attempt_count+1,started_at=?,finished_at=NULL,updated_at=? WHERE id=? AND run_id=? AND status='pending' AND EXISTS (SELECT 1 FROM research_runs WHERE id=? AND status='running' AND cancel_requested_at IS NULL)")
      .run(input.now, input.now, input.sourceId, input.runId, input.runId);
    changed(result.changes);
    return requiredSource(db, input.sourceId);
  })();
}

export function completeResearchSource(db: Database, input: CompleteSource): ResearchSourceRecord {
  const contentDigest = parseDigestInput(input.contentDigest, "content_digest");
  const finding = parseResearchFindingV1(input.finding);
  if (finding.source_id !== input.sourceId || finding.content_digest !== contentDigest) throw new ResearchValidationError("finding_identity");
  const evidenceJson = jsonInput(input.evidence, "evidence");
  const findingJson = canonicalJson(finding);
  const httpStatus = input.httpStatus ?? null;
  if (httpStatus !== null && (!Number.isSafeInteger(httpStatus) || httpStatus < 100 || httpStatus > 599)) throw new ResearchValidationError("http_status");
  const result = db.prepare("UPDATE research_sources SET status='succeeded',http_status=?,content_digest=?,evidence_json=?,finding_json=?,finding_digest=?,error_code=NULL,error_message=NULL,finished_at=?,updated_at=? WHERE id=? AND status='running' AND attempt_count=?")
    .run(httpStatus, contentDigest, evidenceJson, findingJson, sha256(findingJson), input.now, input.now, input.sourceId, input.attemptToken);
  changed(result.changes);
  return requiredSource(db, input.sourceId);
}

export function failResearchSource(db: Database, input: FailSource): ResearchSourceRecord {
  if (input.message.trim().length === 0) throw new ResearchValidationError("message");
  const result = db.prepare("UPDATE research_sources SET status='failed',error_code=?,error_message=?,finished_at=?,updated_at=? WHERE id=? AND status='running' AND attempt_count=?")
    .run(input.errorCode, input.message, input.now, input.now, input.sourceId, input.attemptToken);
  changed(result.changes);
  return requiredSource(db, input.sourceId);
}

export function requestResearchCancellation(db: Database, input: TimedRun): ResearchRunRecord {
  return db.transaction(() => {
    const current = getResearchRun(db, input.runId);
    if (current.status === "cancelled") return current;
    const result = db.prepare("UPDATE research_runs SET status='cancelled',stop_reason='user_cancelled',cancel_requested_at=COALESCE(cancel_requested_at,?),completed_at=?,updated_at=? WHERE id=? AND status IN ('pending','running','finalizing','recovering')")
      .run(input.now, input.now, input.now, input.runId);
    changed(result.changes);
    db.prepare("UPDATE research_sources SET status='cancelled',error_code='user_cancelled',error_message='user cancelled',finished_at=?,updated_at=? WHERE run_id=? AND status IN ('pending','running','recovering')")
      .run(input.now, input.now, input.runId);
    return getResearchRun(db, input.runId);
  })();
}

export function beginResearchFinalization(db: Database, input: TimedRun): string {
  return db.transaction(() => {
    const result = db.prepare("UPDATE research_runs SET status='finalizing',updated_at=? WHERE id=? AND status IN ('running','recovering') AND cancel_requested_at IS NULL AND NOT EXISTS (SELECT 1 FROM research_sources WHERE run_id=? AND status IN ('pending','running','recovering'))")
      .run(input.now, input.runId, input.runId);
    changed(result.changes);
    return evidenceSetDigest(listResearchSources(db, input.runId));
  })();
}

export function commitResearchResult(db: Database, input: CommitResult): ResearchRunRecord {
  const expectedEvidence = parseDigestInput(input.evidenceSetDigest, "evidence_set_digest");
  const result = parseResearchResultV1(input.result);
  const resultJson = canonicalJson(result);
  return db.transaction(() => {
    const run = getResearchRun(db, input.runId);
    if (run.status !== "finalizing" || run.cancel_requested_at !== null) throw new ResearchConflictError("transition_conflict");
    const sources = listResearchSources(db, input.runId);
    if (evidenceSetDigest(sources) !== expectedEvidence) throw new ResearchConflictError("evidence_conflict");
    const canonicalSources = sources.filter((source) => source.duplicate_of_source_id === null);
    const succeeded = canonicalSources.filter((source) => source.status === "succeeded").length;
    const failed = canonicalSources.length - succeeded;
    const outcome = failed === 0 ? "completed" : "partial";
    if (result.run_id !== run.id || result.request_digest !== run.request_digest || result.evidence_set_digest !== expectedEvidence || result.outcome !== outcome || result.source_summary.requested !== sources.length || result.source_summary.canonical !== canonicalSources.length || result.source_summary.succeeded !== succeeded || result.source_summary.failed !== failed || result.source_summary.duplicates !== sources.length - canonicalSources.length) throw new ResearchConflictError("evidence_conflict");
    const update = db.prepare("UPDATE research_runs SET status=?,evidence_set_digest=?,result_json=?,result_digest=?,usable=1,stop_reason=?,completed_at=?,updated_at=? WHERE id=? AND status='finalizing' AND cancel_requested_at IS NULL")
      .run(outcome, expectedEvidence, resultJson, sha256(resultJson), outcome === "partial" ? "partial_sources" : null, input.now, input.now, input.runId);
    changed(update.changes);
    return getResearchRun(db, input.runId);
  })();
}

export function evidenceSetDigest(sources: readonly ResearchSourceRecord[]): string {
  const evidence = sources.filter((source) => source.duplicate_of_source_id === null).map((source) => {
    if (source.status !== "succeeded" && source.status !== "failed" && source.status !== "cancelled" && source.status !== "corrupt") throw new ResearchConflictError("transition_conflict");
    return { id: source.id, status: source.status, content_digest: source.content_digest, finding_digest: source.finding_digest, error_code: source.error_code };
  });
  return sha256(canonicalJson(evidence));
}

function prepareCreation(input: CreateInput): { readonly requestKey: string; readonly request: ResearchRequestV1; readonly requestJson: string; readonly requestDigest: string; readonly orchestratorDigest: string } {
  const requestKey = input.requestKey.trim();
  if (requestKey.length === 0 || !Number.isSafeInteger(input.now) || input.now < 0) throw new ResearchValidationError("creation");
  const parsed = parseResearchRequestV1(input.request);
  const request = parseResearchRequestV1({ ...parsed, sources: parsed.sources.map((source) => ({ ...source, locator: canonicalLocator(source.kind, source.locator) })) });
  const requestJson = canonicalJson(request);
  return { requestKey, request, requestJson, requestDigest: sha256(requestJson), orchestratorDigest: parseDigestInput(input.orchestratorDigest, "orchestrator_digest") };
}
function canonicalLocator(kind: ResearchRequestV1["sources"][number]["kind"], locator: string): string {
  const trimmed = locator.trim().normalize("NFC");
  if (trimmed.length === 0) throw new ResearchValidationError("locator");
  switch (kind) {
    case "web": case "repository": { const url = new URL(trimmed); url.hash = ""; return url.toString().replace(/\/$/u, url.pathname === "/" ? "/" : ""); }
    case "document": case "fixture": return trimmed;
    default: { const exhaustive: never = kind; throw new ResearchValidationError(exhaustive); }
  }
}
function persistedRun(input: unknown): ResearchRunRecord {
  try {
    const run = parseResearchRunRecord(input);
    const request = parseResearchRequestV1(run.request_json);
    if (sha256(canonicalJson(request)) !== run.request_digest) throw new ResearchCorruptionError(run.id);
    if (run.result_json !== null) { const result = parseResearchResultV1(run.result_json); if (sha256(canonicalJson(result)) !== run.result_digest || result.run_id !== run.id || result.request_digest !== run.request_digest || result.evidence_set_digest !== run.evidence_set_digest) throw new ResearchCorruptionError(run.id); }
    return run;
  } catch (error) { if (error instanceof ResearchCorruptionError) throw error; if (error instanceof UpgradeContractError) throw new ResearchCorruptionError("run"); throw error; }
}
function persistedSource(input: unknown): ResearchSourceRecord {
  try {
    const source = parseResearchSourceRecord(input);
    if (source.finding_json !== null) { const finding = parseResearchFindingV1(source.finding_json); if (sha256(canonicalJson(finding)) !== source.finding_digest || finding.source_id !== source.id || finding.content_digest !== source.content_digest) throw new ResearchCorruptionError(source.id); }
    return source;
  } catch (error) { if (error instanceof ResearchCorruptionError) throw error; if (error instanceof UpgradeContractError) throw new ResearchCorruptionError("source"); throw error; }
}
function rawRunByKey(db: Database, key: string): ResearchRunRecord | null { return db.query<ResearchRunRecord, [string]>("SELECT * FROM research_runs WHERE request_key=?").get(key); }
function requiredSource(db: Database, id: string): ResearchSourceRecord { const row = db.query<ResearchSourceRecord, [string]>("SELECT * FROM research_sources WHERE id=?").get(id); if (row === null) throw new ResearchConflictError("transition_conflict"); return persistedSource(row); }
function changed(count: number): void { if (count !== 1) throw new ResearchConflictError("transition_conflict"); }
function requiredId(value: string, field: string): string { if (value.trim().length === 0) throw new ResearchValidationError(field); return value; }
function parseDigestInput(value: string, field: string): string { try { return parseResearchDigest(value, field); } catch (error) { if (error instanceof UpgradeContractError) throw new ResearchValidationError(field); throw error; } }
function jsonInput(value: unknown, field: string): string { try { const json = canonicalJson(value); if (typeof json !== "string") throw new ResearchValidationError(field); return json; } catch (error) { if (error instanceof ResearchValidationError) throw error; if (error instanceof TypeError) throw new ResearchValidationError(field); throw error; } }
