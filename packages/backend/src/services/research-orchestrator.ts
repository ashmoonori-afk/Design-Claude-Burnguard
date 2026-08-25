import {
  RESEARCH_PROJECT_PURPOSES,
  parseResearchFindingV1,
  parseResearchRequestV1,
  parseResearchResultV1,
  type ResearchConflict,
  type ResearchFindingV1,
  type ResearchProjectPurpose,
  type ResearchRequestV1,
  type ResearchResultV1,
  type ResearchRule,
  type ResearchSourceErrorCode,
  type ResearchSourceSummary,
} from "@bg/shared";
import fixtureInput from "../fixtures/research/mass-research-v1.json";
import { canonicalJson, sha256 } from "./export-receipt";
import { parseResearchSourceDocument, ResearchSourceLoadError } from "./research-source-loader";

export type CanonicalResearchSource = { readonly id: string; readonly ordinal: number; readonly kind: ResearchRequestV1["sources"][number]["kind"]; readonly locator: string; readonly canonicalLocator: string };
export type ResearchSourceDocument = { readonly schema_version: 1; readonly title: string; readonly claims: readonly { readonly axis: string; readonly text: string }[] };
export type FetchedResearchSource = { readonly bytes: Uint8Array; readonly finalUrl: string; readonly httpStatus: number | null; readonly document: ResearchSourceDocument | unknown };
export type LoadedResearchSource = Omit<FetchedResearchSource, "document"> & { readonly document: ResearchSourceDocument; readonly contentDigest: string };
export type ResearchSynthesisInput = { readonly runId: string; readonly request: ResearchRequestV1; readonly requestDigest: string; readonly evidenceSetDigest: string; readonly findings: readonly ResearchFindingV1[]; readonly sourceSummary: ResearchSourceSummary };
export type ResearchTimerHandle = ReturnType<typeof setTimeout> | (() => void);
export type ResearchDependencies = {
  readonly now: () => number;
  readonly newId: () => string;
  readonly fetchSource: (input: { readonly source: CanonicalResearchSource; readonly maxBytes: number }, signal: AbortSignal) => Promise<FetchedResearchSource>;
  readonly runWorker: (input: { readonly source: CanonicalResearchSource; readonly fetched: LoadedResearchSource }, signal: AbortSignal) => Promise<ResearchFindingV1>;
  readonly synthesize: (input: ResearchSynthesisInput, signal: AbortSignal) => Promise<ResearchResultV1>;
  readonly setTimer?: (callback: () => void, milliseconds: number) => ResearchTimerHandle;
  readonly clearTimer?: (handle: ResearchTimerHandle) => void;
};
export type ResearchSourceExecution = { readonly source: CanonicalResearchSource; readonly status: "succeeded" | "failed" | "duplicate" | "cancelled"; readonly duplicateOf: string | null; readonly contentDigest: string | null; readonly finding: ResearchFindingV1 | null; readonly findingDigest: string | null; readonly errorCode: ResearchSourceErrorCode | null; readonly startedAt: number | null; readonly finishedAt: number };
export type ResearchExecution = { readonly status: "completed" | "partial" | "failed" | "cancelled"; readonly runId: string; readonly requestDigest: string; readonly evidenceSetDigest: string | null; readonly resultDigest: string | null; readonly result: ResearchResultV1 | null; readonly sources: readonly ResearchSourceExecution[] };

class SourceTimeoutError extends Error { readonly name = "SourceTimeoutError"; }
class RunCancelledError extends Error { readonly name = "RunCancelledError"; }
type FixtureSource = { readonly locator: string; readonly document: ResearchSourceDocument; readonly observations: ResearchFindingV1["observations"]; readonly candidates: ResearchFindingV1["candidates"] };

export async function executeResearch(input: unknown, deps: ResearchDependencies, parentSignal?: AbortSignal): Promise<ResearchExecution> {
  const request = parseResearchRequestV1(input); const runId = deps.newId(); const requestDigest = sha256(canonicalJson(request));
  const runController = new AbortController(); const cancel = (): void => runController.abort(new RunCancelledError());
  if (parentSignal?.aborted === true) cancel(); else parentSignal?.addEventListener("abort", cancel, { once: true });
  try {
    const fixture = request.mode === "fixture" ? parseFixture(fixtureInput, request.fixture_id) : null;
    const { sources, canonical } = planSources(request, deps.newId);
    const outcomes: ResearchSourceExecution[] = sources.map((source) => source.duplicateOf === null
      ? pending(source.source, deps.now()) : { ...pending(source.source, deps.now()), status: "duplicate", duplicateOf: source.duplicateOf, errorCode: null });
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < canonical.length && !runController.signal.aborted) {
        const index = next; next += 1; const source = canonical[index];
        if (source === undefined) continue;
        outcomes[source.ordinal] = await executeSource({ source, request, deps, fixture }, runController.signal);
      }
    };
    await Promise.all(Array.from({ length: Math.min(request.limits.concurrency, canonical.length) }, worker));
    if (runController.signal.aborted) return cancelled(runId, requestDigest, outcomes, deps.now());
    const terminal = outcomes.map((outcome) => outcome.status === "succeeded" || outcome.status === "failed" || outcome.status === "duplicate" ? outcome : { ...outcome, status: "cancelled" as const, errorCode: "user_cancelled" as const, finishedAt: deps.now() });
    const evidenceSetDigest = sha256(canonicalJson(terminal.filter((item) => item.duplicateOf === null).map(evidenceTuple)));
    const succeeded = terminal.filter((item) => item.duplicateOf === null && item.status === "succeeded");
    const sourceSummary = summary(terminal, succeeded.length);
    const synthesisInput = { runId, request, requestDigest, evidenceSetDigest, findings: succeeded.flatMap((item) => item.finding === null ? [] : [item.finding]), sourceSummary };
    if (succeeded.length === 0) return { status: "failed", runId, requestDigest, evidenceSetDigest, resultDigest: null, result: null, sources: terminal };
    try {
      const rawResult = fixture === null ? await abortable(deps.synthesize(synthesisInput, runController.signal), runController.signal) : synthesizeFixture(synthesisInput);
      if (runController.signal.aborted) return cancelled(runId, requestDigest, terminal, deps.now());
      const result = canonicalResult(rawResult); requireUsable(result, synthesisInput, new Set(succeeded.map((item) => item.source.id)));
      const resultDigest = sha256(canonicalJson(result));
      return { status: result.outcome, runId, requestDigest, evidenceSetDigest, resultDigest, result, sources: terminal };
    } catch (error) {
      if (runController.signal.aborted || error instanceof RunCancelledError) return cancelled(runId, requestDigest, terminal, deps.now());
      return { status: "failed", runId, requestDigest, evidenceSetDigest, resultDigest: null, result: null, sources: terminal };
    }
  } catch (error) {
    if (runController.signal.aborted || error instanceof RunCancelledError) return { status: "cancelled", runId, requestDigest, evidenceSetDigest: null, resultDigest: null, result: null, sources: [] };
    throw error;
  } finally { parentSignal?.removeEventListener("abort", cancel); }
}

async function executeSource(input: { readonly source: CanonicalResearchSource; readonly request: ResearchRequestV1; readonly deps: ResearchDependencies; readonly fixture: readonly FixtureSource[] | null }, runSignal: AbortSignal): Promise<ResearchSourceExecution> {
  const startedAt = input.deps.now(); const controller = new AbortController(); const runAbort = (): void => controller.abort(runSignal.reason);
  runSignal.addEventListener("abort", runAbort, { once: true });
  const timeout = input.deps.setTimer?.(() => controller.abort(new SourceTimeoutError()), input.request.limits.per_source_timeout_ms) ?? setTimeout(() => controller.abort(new SourceTimeoutError()), input.request.limits.per_source_timeout_ms);
  try {
    const fixtureSource = input.fixture?.find((item) => item.locator === input.source.locator);
    const raw = fixtureSource === undefined ? await abortable(input.deps.fetchSource({ source: input.source, maxBytes: input.request.limits.max_bytes_per_source }, controller.signal), controller.signal).catch((error: unknown) => { if (controller.signal.aborted || error instanceof ResearchSourceLoadError) throw error; throw new ResearchSourceLoadError("fetch_failed", error instanceof Error ? error.message : "Research source fetch failed"); }) : fixtureFetch(fixtureSource);
    if (raw.bytes.byteLength > input.request.limits.max_bytes_per_source) throw new ResearchSourceLoadError("source_too_large", "Research source exceeds its byte limit");
    const document = parseResearchSourceDocument(raw.document); const contentDigest = sha256(raw.bytes);
    const loaded = { ...raw, document, contentDigest };
    const workerOutput = fixtureSource === undefined ? await abortable(input.deps.runWorker({ source: input.source, fetched: loaded }, controller.signal), controller.signal) : { schema_version: 1 as const, source_id: input.source.id, content_digest: contentDigest, observations: fixtureSource.observations, candidates: fixtureSource.candidates };
    let finding: ResearchFindingV1;
    try { finding = parseResearchFindingV1(workerOutput); }
    catch { return failed(input.source, "invalid_worker_output", startedAt, input.deps.now()); }
    if (finding.source_id !== input.source.id || finding.content_digest !== contentDigest) return failed(input.source, "invalid_worker_output", startedAt, input.deps.now());
    return { source: input.source, status: "succeeded", duplicateOf: null, contentDigest, finding, findingDigest: sha256(canonicalJson(finding)), errorCode: null, startedAt, finishedAt: input.deps.now() };
  } catch (error) {
    if (runSignal.aborted) return { ...failed(input.source, "user_cancelled", startedAt, input.deps.now()), status: "cancelled" };
    if (controller.signal.reason instanceof SourceTimeoutError) return failed(input.source, "source_timeout", startedAt, input.deps.now());
    if (error instanceof ResearchSourceLoadError) return failed(input.source, error.code === "malformed_source" ? "malformed_source" : "fetch_failed", startedAt, input.deps.now());
    return failed(input.source, "worker_failed", startedAt, input.deps.now());
  } finally { if (input.deps.clearTimer !== undefined) input.deps.clearTimer(timeout); else if (typeof timeout !== "function") clearTimeout(timeout); runSignal.removeEventListener("abort", runAbort); }
}

function planSources(request: ResearchRequestV1, newId: () => string): { readonly sources: readonly { readonly source: CanonicalResearchSource; readonly duplicateOf: string | null }[]; readonly canonical: readonly CanonicalResearchSource[] } {
  const first = new Map<string, string>(); const canonical: CanonicalResearchSource[] = [];
  const sources = request.sources.map((source, ordinal) => { const normalizedLocator = canonicalLocator(source.kind, source.locator); const item = { id: newId(), ordinal, kind: source.kind, locator: source.locator, canonicalLocator: normalizedLocator }; const key = sha256(canonicalJson({ kind: source.kind, locator: normalizedLocator })); const duplicateOf = first.get(key) ?? null; if (duplicateOf === null) { first.set(key, item.id); canonical.push(item); } return { source: item, duplicateOf }; });
  return { sources, canonical };
}
function canonicalLocator(kind: CanonicalResearchSource["kind"], locator: string): string { const value = locator.trim().normalize("NFC"); switch (kind) { case "web": case "repository": { const url = new URL(value); url.hash = ""; return url.toString().replace(/\/$/u, url.pathname === "/" ? "/" : ""); } case "document": case "fixture": return value; default: { const exhaustive: never = kind; return exhaustive; } } }
function pending(source: CanonicalResearchSource, now: number): ResearchSourceExecution { return { source, status: "cancelled", duplicateOf: null, contentDigest: null, finding: null, findingDigest: null, errorCode: "user_cancelled", startedAt: null, finishedAt: now }; }
function failed(source: CanonicalResearchSource, errorCode: ResearchSourceErrorCode, startedAt: number, finishedAt: number): ResearchSourceExecution { return { source, status: "failed", duplicateOf: null, contentDigest: null, finding: null, findingDigest: null, errorCode, startedAt, finishedAt }; }
function evidenceTuple(item: ResearchSourceExecution): unknown { return { id: item.source.id, status: item.status, content_digest: item.contentDigest, finding_digest: item.findingDigest, error_code: item.errorCode }; }
function summary(items: readonly ResearchSourceExecution[], succeeded: number): ResearchSourceSummary { const canonical = items.filter((item) => item.duplicateOf === null).length; return { requested: items.length, canonical, succeeded, failed: canonical - succeeded, duplicates: items.length - canonical }; }
function cancelled(runId: string, requestDigest: string, items: readonly ResearchSourceExecution[], now: number): ResearchExecution { return { status: "cancelled", runId, requestDigest, evidenceSetDigest: null, resultDigest: null, result: null, sources: items.map((item) => item.status === "duplicate" ? item : item.status === "succeeded" ? item : { ...item, status: "cancelled", errorCode: "user_cancelled", finishedAt: now }) }; }
function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> { if (signal.aborted) return Promise.reject(signal.reason); return new Promise((resolve, reject) => { const abort = (): void => reject(signal.reason); signal.addEventListener("abort", abort, { once: true }); operation.then((value) => { signal.removeEventListener("abort", abort); resolve(value); }, (error) => { signal.removeEventListener("abort", abort); reject(error); }); }); }

function canonicalResult(input: ResearchResultV1): ResearchResultV1 { const sortRules = (rules: readonly ResearchRule[]) => rules.map((rule) => ({ ...rule, source_ids: [...rule.source_ids].sort() })).sort((left, right) => left.id.localeCompare(right.id)); const conflicts = input.conflicts.map((conflict) => ({ ...conflict, rule_ids: [...conflict.rule_ids].sort() })).sort((left, right) => `${left.axis}:${left.rule_ids.join()}`.localeCompare(`${right.axis}:${right.rule_ids.join()}`)); return parseResearchResultV1({ ...input, common_rules: sortRules(input.common_rules), purpose_rules: Object.fromEntries(RESEARCH_PROJECT_PURPOSES.map((purpose) => [purpose, sortRules(input.purpose_rules[purpose])])), conflicts }); }
function requireUsable(result: ResearchResultV1, input: ResearchSynthesisInput, succeeded: ReadonlySet<string>): void { const rules = [...result.common_rules, ...RESEARCH_PROJECT_PURPOSES.flatMap((purpose) => result.purpose_rules[purpose])]; if (result.run_id !== input.runId || result.request_digest !== input.requestDigest || result.evidence_set_digest !== input.evidenceSetDigest || canonicalJson(result.source_summary) !== canonicalJson(input.sourceSummary) || result.common_rules.length === 0 || input.request.purposes.some((purpose) => result.purpose_rules[purpose].length === 0) || rules.some((rule) => rule.source_ids.some((id) => !succeeded.has(id)))) throw new ResearchSourceLoadError("malformed_source", "Synthesis did not produce usable cited coverage"); const conflicts = new Set(result.conflicts.flatMap((item) => item.rule_ids.map((id) => `${item.axis}:${id}`))); for (const left of rules) for (const right of rules) if (left.id < right.id && left.axis === right.axis && left.directive !== right.directive && (!conflicts.has(`${left.axis}:${left.id}`) || !conflicts.has(`${right.axis}:${right.id}`))) throw new ResearchSourceLoadError("malformed_source", "Synthesis omitted a conflict explanation"); }

function parseFixture(input: unknown, fixtureId: string | null): readonly FixtureSource[] { if (!record(input) || input["schema_version"] !== 1 || input["fixture_id"] !== fixtureId || !Array.isArray(input["sources"])) throw new ResearchSourceLoadError("malformed_source", "Unknown research fixture"); return input["sources"].map((value) => { if (!record(value) || typeof value["locator"] !== "string" || !Array.isArray(value["observations"]) || !Array.isArray(value["candidates"])) throw new ResearchSourceLoadError("malformed_source", "Malformed research fixture"); const document = parseResearchSourceDocument(value["document"]); const finding = parseResearchFindingV1({ schema_version: 1, source_id: "fixture", content_digest: "a".repeat(64), observations: value["observations"], candidates: value["candidates"] }); return { locator: value["locator"], document, observations: finding.observations, candidates: finding.candidates }; }); }
function fixtureFetch(source: FixtureSource): FetchedResearchSource { const bytes = new TextEncoder().encode(canonicalJson(source.document)); return { bytes, finalUrl: `fixture:${source.locator}`, httpStatus: null, document: source.document }; }
function synthesizeFixture(input: ResearchSynthesisInput): ResearchResultV1 { const candidates = input.findings.flatMap((finding) => finding.candidates.map((candidate) => ({ candidate, sourceId: finding.source_id }))); const rulesFor = (purpose: ResearchProjectPurpose | "common"): readonly ResearchRule[] => candidates.filter((item) => item.candidate.purpose === purpose).map(({ candidate, sourceId }) => ({ id: `fixture-${candidate.purpose}-${candidate.axis}`, axis: candidate.axis, directive: candidate.directive, rationale: candidate.rationale, confidence: candidate.confidence, source_ids: [sourceId] })).sort((left, right) => left.id.localeCompare(right.id)); return { schema_version: 1, run_id: input.runId, request_digest: input.requestDigest, evidence_set_digest: input.evidenceSetDigest, outcome: input.sourceSummary.failed === 0 ? "completed" : "partial", common_rules: rulesFor("common"), purpose_rules: { "deck.pitch": rulesFor("deck.pitch"), "prototype.dashboard": rulesFor("prototype.dashboard"), "prototype.diagram": rulesFor("prototype.diagram"), "prototype.editorial": rulesFor("prototype.editorial"), "prototype.landing": rulesFor("prototype.landing"), "prototype.sandbox": rulesFor("prototype.sandbox") }, conflicts: [] satisfies readonly ResearchConflict[], source_summary: input.sourceSummary }; }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
