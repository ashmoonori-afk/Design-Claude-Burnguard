import {
  UpgradeContractError,
  decodeContract,
  isRecord,
  requiredArray,
  requiredNumber,
  requiredRecord,
  requiredString,
  type UnknownRecord,
} from "./contract-parser";

export const RESEARCH_PROJECT_PURPOSES = ["deck.pitch", "prototype.dashboard", "prototype.diagram", "prototype.editorial", "prototype.landing", "prototype.sandbox"] as const;
export const RESEARCH_SOURCE_KINDS = ["web", "repository", "document", "fixture"] as const;
export const RESEARCH_RUN_STATUSES = ["pending", "running", "finalizing", "recovering", "completed", "partial", "cancelled", "failed", "corrupt"] as const;
export const RESEARCH_SOURCE_STATUSES = ["pending", "running", "recovering", "succeeded", "failed", "duplicate", "cancelled", "corrupt"] as const;
export const RESEARCH_STOP_REASONS = ["partial_sources", "user_cancelled", "no_usable_result", "orchestration_failed", "persisted_data_corrupt"] as const;
export const RESEARCH_SOURCE_ERROR_CODES = ["source_timeout", "fetch_failed", "malformed_source", "worker_failed", "invalid_worker_output", "user_cancelled", "persisted_data_corrupt"] as const;

export type ResearchProjectPurpose = (typeof RESEARCH_PROJECT_PURPOSES)[number];
export type SupportedPurpose = ResearchProjectPurpose;
export type ResearchSourceKind = (typeof RESEARCH_SOURCE_KINDS)[number];
export type ResearchRunStatus = (typeof RESEARCH_RUN_STATUSES)[number];
export type ResearchSourceStatus = (typeof RESEARCH_SOURCE_STATUSES)[number];
export type ResearchStopReason = (typeof RESEARCH_STOP_REASONS)[number];
export type ResearchSourceErrorCode = (typeof RESEARCH_SOURCE_ERROR_CODES)[number];
export type ResearchMode = "live" | "fixture";
export type ResearchSource = { readonly kind: ResearchSourceKind; readonly locator: string };
export type ResearchLimits = { readonly concurrency: number; readonly per_source_timeout_ms: number; readonly max_sources: number; readonly max_bytes_per_source: number };
export type ResearchRequestV1 = { readonly schema_version: 1; readonly purposes: readonly ResearchProjectPurpose[]; readonly sources: readonly ResearchSource[]; readonly limits: ResearchLimits; readonly orchestrator_version: string; readonly mode: ResearchMode; readonly fixture_id: string | null };
export type ResearchObservation = { readonly axis: string; readonly summary: string; readonly source_locator: string };
export type ResearchRuleCandidate = { readonly purpose: ResearchProjectPurpose | "common"; readonly axis: string; readonly directive: string; readonly rationale: string; readonly confidence: number };
export type ResearchFindingV1 = { readonly schema_version: 1; readonly source_id: string; readonly content_digest: string; readonly observations: readonly ResearchObservation[]; readonly candidates: readonly ResearchRuleCandidate[] };
export type ResearchRule = { readonly id: string; readonly axis: string; readonly directive: string; readonly rationale: string; readonly confidence: number; readonly source_ids: readonly string[] };
export type ResearchConflict = { readonly axis: string; readonly rule_ids: readonly string[]; readonly explanation: string };
export type ResearchSourceSummary = { readonly requested: number; readonly canonical: number; readonly succeeded: number; readonly failed: number; readonly duplicates: number };
export type ResearchResultV1 = { readonly schema_version: 1; readonly run_id: string; readonly request_digest: string; readonly evidence_set_digest: string; readonly outcome: "completed" | "partial"; readonly common_rules: readonly ResearchRule[]; readonly purpose_rules: Readonly<Record<ResearchProjectPurpose, readonly ResearchRule[]>>; readonly conflicts: readonly ResearchConflict[]; readonly source_summary: ResearchSourceSummary };
export type ResearchRunRecord = { readonly id: string; readonly request_key: string; readonly status: ResearchRunStatus; readonly mode: ResearchMode; readonly fixture_id: string | null; readonly request_json: string; readonly request_digest: string; readonly orchestrator_digest: string; readonly evidence_set_digest: string | null; readonly result_json: string | null; readonly result_digest: string | null; readonly usable: 0 | 1; readonly stop_reason: ResearchStopReason | null; readonly cancel_requested_at: number | null; readonly created_at: number; readonly updated_at: number; readonly completed_at: number | null };
export type ResearchSourceRecord = { readonly id: string; readonly run_id: string; readonly ordinal: number; readonly kind: ResearchSourceKind; readonly locator: string; readonly canonical_locator: string; readonly dedup_key: string; readonly duplicate_of_source_id: string | null; readonly status: ResearchSourceStatus; readonly attempt_count: number; readonly http_status: number | null; readonly content_digest: string | null; readonly evidence_json: string | null; readonly finding_json: string | null; readonly finding_digest: string | null; readonly error_code: ResearchSourceErrorCode | null; readonly error_message: string | null; readonly started_at: number | null; readonly finished_at: number | null; readonly created_at: number; readonly updated_at: number };

export function parseResearchRequestV1(input: unknown): ResearchRequestV1 {
  const record = decodeContract(input);
  exact(record, ["schema_version", "purposes", "sources", "limits", "orchestrator_version", "mode", "fixture_id"]);
  schemaV1(record);
  const purposes = requiredArray(record, "purposes").map((value, index) => parsePurpose(value, `purposes.${index}`));
  sortedUnique(purposes, "purposes", 1);
  const sources = requiredArray(record, "sources").map(parseResearchSource);
  const limits = parseResearchLimits(requiredRecord(record, "limits"));
  if (sources.length === 0 || sources.length > limits.max_sources) invalid("sources");
  const mode = parseMode(requiredString(record, "mode"));
  const fixtureId = nullableString(record, "fixture_id");
  if ((mode === "fixture") !== (fixtureId !== null)) invalid("fixture_id");
  return { schema_version: 1, purposes, sources, limits, orchestrator_version: requiredString(record, "orchestrator_version"), mode, fixture_id: fixtureId };
}

export function parseResearchSource(value: unknown, index = 0): ResearchSource {
  if (!isRecord(value)) invalid(`sources.${index}`);
  exact(value, ["kind", "locator"]);
  const kind = parseSourceKind(requiredString(value, "kind"));
  const locator = requiredString(value, "locator");
  if ((kind === "web" || kind === "repository") && !validHttpUrl(locator)) invalid(`sources.${index}.locator`);
  return { kind, locator };
}

export function parseResearchLimits(input: unknown): ResearchLimits {
  const record = isRecord(input) ? input : invalid("limits");
  exact(record, ["concurrency", "per_source_timeout_ms", "max_sources", "max_bytes_per_source"]);
  return {
    concurrency: integerRange(record, "concurrency", 1, 8),
    per_source_timeout_ms: integerRange(record, "per_source_timeout_ms", 1_000, 120_000),
    max_sources: integerRange(record, "max_sources", 1, 200),
    max_bytes_per_source: integerRange(record, "max_bytes_per_source", 1, 10_000_000),
  };
}

export function parseResearchFindingV1(input: unknown): ResearchFindingV1 {
  const record = decodeContract(input);
  exact(record, ["schema_version", "source_id", "content_digest", "observations", "candidates"]);
  schemaV1(record);
  const observations = requiredArray(record, "observations").map((value, index) => parseObservation(value, index));
  const candidates = requiredArray(record, "candidates").map((value, index) => parseCandidate(value, index));
  return { schema_version: 1, source_id: requiredString(record, "source_id"), content_digest: parseResearchDigest(requiredString(record, "content_digest"), "content_digest"), observations, candidates };
}

export function parseResearchResultV1(input: unknown): ResearchResultV1 {
  const record = decodeContract(input);
  exact(record, ["schema_version", "run_id", "request_digest", "evidence_set_digest", "outcome", "common_rules", "purpose_rules", "conflicts", "source_summary"]);
  schemaV1(record);
  const outcome = parseOutcome(requiredString(record, "outcome"));
  const commonRules = parseRules(requiredArray(record, "common_rules"), "common_rules");
  const purposeRecord = requiredRecord(record, "purpose_rules");
  exact(purposeRecord, RESEARCH_PROJECT_PURPOSES);
  const purposeRules = {
    "deck.pitch": parseRules(requiredArray(purposeRecord, "deck.pitch"), "purpose_rules.deck.pitch"),
    "prototype.dashboard": parseRules(requiredArray(purposeRecord, "prototype.dashboard"), "purpose_rules.prototype.dashboard"),
    "prototype.diagram": parseRules(requiredArray(purposeRecord, "prototype.diagram"), "purpose_rules.prototype.diagram"),
    "prototype.editorial": parseRules(requiredArray(purposeRecord, "prototype.editorial"), "purpose_rules.prototype.editorial"),
    "prototype.landing": parseRules(requiredArray(purposeRecord, "prototype.landing"), "purpose_rules.prototype.landing"),
    "prototype.sandbox": parseRules(requiredArray(purposeRecord, "prototype.sandbox"), "purpose_rules.prototype.sandbox"),
  };
  const conflicts = requiredArray(record, "conflicts").map(parseConflictAt);
  const allRuleIds = [...commonRules, ...purposeRules["deck.pitch"], ...purposeRules["prototype.dashboard"], ...purposeRules["prototype.diagram"], ...purposeRules["prototype.editorial"], ...purposeRules["prototype.landing"], ...purposeRules["prototype.sandbox"]].map((rule) => rule.id);
  if (new Set(allRuleIds).size !== allRuleIds.length || conflicts.some((conflict) => conflict.rule_ids.some((id) => !allRuleIds.includes(id)))) invalid("conflicts");
  const sourceSummary = parseSourceSummary(requiredRecord(record, "source_summary"));
  if ((outcome === "completed") !== (sourceSummary.failed === 0)) invalid("outcome");
  return { schema_version: 1, run_id: requiredString(record, "run_id"), request_digest: parseResearchDigest(requiredString(record, "request_digest"), "request_digest"), evidence_set_digest: parseResearchDigest(requiredString(record, "evidence_set_digest"), "evidence_set_digest"), outcome, common_rules: commonRules, purpose_rules: purposeRules, conflicts, source_summary: sourceSummary };
}

export function parseResearchRunRecord(input: unknown): ResearchRunRecord {
  const record = decodeContract(input);
  exact(record, ["id", "request_key", "status", "mode", "fixture_id", "request_json", "request_digest", "orchestrator_digest", "evidence_set_digest", "result_json", "result_digest", "usable", "stop_reason", "cancel_requested_at", "created_at", "updated_at", "completed_at"]);
  const status = parseResearchRunStatus(requiredString(record, "status"));
  const mode = parseMode(requiredString(record, "mode"));
  const fixtureId = nullableString(record, "fixture_id");
  const evidenceDigest = nullableDigest(record, "evidence_set_digest");
  const resultJson = nullableString(record, "result_json");
  const resultDigest = nullableDigest(record, "result_digest");
  const usableValue = requiredNumber(record, "usable");
  if (usableValue !== 0 && usableValue !== 1) invalid("usable");
  const usable: 0 | 1 = usableValue;
  const reason = parseResearchStopReason(nullableString(record, "stop_reason"));
  const completedAt = nullableNumber(record, "completed_at");
  const successful = status === "completed" || status === "partial";
  const terminal = successful || status === "cancelled" || status === "failed" || status === "corrupt";
  if ((mode === "fixture") !== (fixtureId !== null) || successful !== (resultJson !== null) || successful !== (resultDigest !== null) || successful !== (evidenceDigest !== null) || successful !== (usable === 1) || terminal === (completedAt === null)) invalid("status");
  if ((status === "completed" && reason !== null) || (status === "partial" && reason !== "partial_sources") || (status === "cancelled" && reason !== "user_cancelled") || (status === "corrupt" && reason !== "persisted_data_corrupt") || (status === "failed" && reason !== "no_usable_result" && reason !== "orchestration_failed") || (!terminal && reason !== null)) invalid("stop_reason");
  const cancelAt = nullableNumber(record, "cancel_requested_at");
  if (status === "cancelled" && cancelAt === null) invalid("cancel_requested_at");
  const createdAt = requiredNumber(record, "created_at");
  const updatedAt = requiredNumber(record, "updated_at");
  if (updatedAt < createdAt || (completedAt !== null && completedAt < createdAt)) invalid("updated_at");
  return { id: requiredString(record, "id"), request_key: requiredString(record, "request_key"), status, mode, fixture_id: fixtureId, request_json: requiredString(record, "request_json"), request_digest: parseResearchDigest(requiredString(record, "request_digest"), "request_digest"), orchestrator_digest: parseResearchDigest(requiredString(record, "orchestrator_digest"), "orchestrator_digest"), evidence_set_digest: evidenceDigest, result_json: resultJson, result_digest: resultDigest, usable, stop_reason: reason, cancel_requested_at: cancelAt, created_at: createdAt, updated_at: updatedAt, completed_at: completedAt };
}

export function parseResearchSourceRecord(input: unknown): ResearchSourceRecord {
  const record = decodeContract(input);
  exact(record, ["id", "run_id", "ordinal", "kind", "locator", "canonical_locator", "dedup_key", "duplicate_of_source_id", "status", "attempt_count", "http_status", "content_digest", "evidence_json", "finding_json", "finding_digest", "error_code", "error_message", "started_at", "finished_at", "created_at", "updated_at"]);
  const status = parseResearchSourceStatus(requiredString(record, "status"));
  const duplicateId = nullableString(record, "duplicate_of_source_id");
  const contentDigest = nullableDigest(record, "content_digest");
  const evidenceJson = nullableString(record, "evidence_json");
  const findingJson = nullableString(record, "finding_json");
  const findingDigest = nullableDigest(record, "finding_digest");
  const errorCode = parseResearchSourceErrorCode(nullableString(record, "error_code"));
  const errorMessage = nullableString(record, "error_message");
  if ((status === "duplicate") !== (duplicateId !== null)) invalid("duplicate_of_source_id");
  if (status === "succeeded" && (contentDigest === null || evidenceJson === null || findingJson === null || findingDigest === null || errorCode !== null || errorMessage !== null)) invalid("status");
  if ((status === "cancelled" && errorCode !== "user_cancelled") || (status === "corrupt" && errorCode !== "persisted_data_corrupt") || (status === "failed" && (errorCode === null || errorCode === "user_cancelled" || errorCode === "persisted_data_corrupt")) || ((status === "pending" || status === "running" || status === "recovering" || status === "duplicate") && errorCode !== null)) invalid("error_code");
  const httpStatus = nullableNumber(record, "http_status");
  if (httpStatus !== null && (httpStatus < 100 || httpStatus > 599)) invalid("http_status");
  const createdAt = requiredNumber(record, "created_at");
  const updatedAt = requiredNumber(record, "updated_at");
  if (updatedAt < createdAt) invalid("updated_at");
  return { id: requiredString(record, "id"), run_id: requiredString(record, "run_id"), ordinal: requiredNumber(record, "ordinal"), kind: parseSourceKind(requiredString(record, "kind")), locator: requiredString(record, "locator"), canonical_locator: requiredString(record, "canonical_locator"), dedup_key: parseResearchDigest(requiredString(record, "dedup_key"), "dedup_key"), duplicate_of_source_id: duplicateId, status, attempt_count: requiredNumber(record, "attempt_count"), http_status: httpStatus, content_digest: contentDigest, evidence_json: evidenceJson, finding_json: findingJson, finding_digest: findingDigest, error_code: errorCode, error_message: errorMessage, started_at: nullableNumber(record, "started_at"), finished_at: nullableNumber(record, "finished_at"), created_at: createdAt, updated_at: updatedAt };
}

export function parseResearchRule(input: unknown): ResearchRule { return parseRuleAt(input, "rule"); }
export function parseResearchConflict(input: unknown): ResearchConflict { return parseConflictAt(input, 0); }
export function parseResearchDigest(value: string, path = "digest"): string { if (!/^[0-9a-f]{64}$/.test(value)) invalid(path); return value; }
export function parseResearchRunStatus(value: string): ResearchRunStatus { switch (value) { case "pending": case "running": case "finalizing": case "recovering": case "completed": case "partial": case "cancelled": case "failed": case "corrupt": return value; default: return invalid("status"); } }
export function parseResearchSourceStatus(value: string): ResearchSourceStatus { switch (value) { case "pending": case "running": case "recovering": case "succeeded": case "failed": case "duplicate": case "cancelled": case "corrupt": return value; default: return invalid("status"); } }
export function parseResearchStopReason(value: string | null): ResearchStopReason | null { switch (value) { case null: case "partial_sources": case "user_cancelled": case "no_usable_result": case "orchestration_failed": case "persisted_data_corrupt": return value; default: return invalid("stop_reason"); } }
export function parseResearchSourceErrorCode(value: string | null): ResearchSourceErrorCode | null { switch (value) { case null: case "source_timeout": case "fetch_failed": case "malformed_source": case "worker_failed": case "invalid_worker_output": case "user_cancelled": case "persisted_data_corrupt": return value; default: return invalid("error_code"); } }

function parseObservation(value: unknown, index: number): ResearchObservation { if (!isRecord(value)) invalid(`observations.${index}`); exact(value, ["axis", "summary", "source_locator"]); return { axis: requiredString(value, "axis"), summary: requiredString(value, "summary"), source_locator: requiredString(value, "source_locator") }; }
function parseCandidate(value: unknown, index: number): ResearchRuleCandidate { if (!isRecord(value)) invalid(`candidates.${index}`); exact(value, ["purpose", "axis", "directive", "rationale", "confidence"]); const purposeValue = requiredString(value, "purpose"); const purpose = purposeValue === "common" ? purposeValue : parsePurpose(purposeValue, `candidates.${index}.purpose`); return { purpose, axis: requiredString(value, "axis"), directive: requiredString(value, "directive"), rationale: requiredString(value, "rationale"), confidence: confidence(value, "confidence") }; }
function parseRules(values: readonly unknown[], path: string): readonly ResearchRule[] { const rules = values.map((value, index) => parseRuleAt(value, `${path}.${index}`)); sortedUnique(rules.map((rule) => rule.id), path); return rules; }
function parseRuleAt(value: unknown, path: string): ResearchRule { if (!isRecord(value)) invalid(path); exact(value, ["id", "axis", "directive", "rationale", "confidence", "source_ids"]); const sourceIds = requiredArray(value, "source_ids").map((item, index) => typeof item === "string" && item.length > 0 ? item : invalid(`${path}.source_ids.${index}`)); sortedUnique(sourceIds, `${path}.source_ids`, 1); return { id: requiredString(value, "id"), axis: requiredString(value, "axis"), directive: requiredString(value, "directive"), rationale: requiredString(value, "rationale"), confidence: confidence(value, "confidence"), source_ids: sourceIds }; }
function parseConflictAt(value: unknown, index: number): ResearchConflict { if (!isRecord(value)) invalid(`conflicts.${index}`); exact(value, ["axis", "rule_ids", "explanation"]); const ruleIds = requiredArray(value, "rule_ids").map((item, ruleIndex) => typeof item === "string" && item.length > 0 ? item : invalid(`conflicts.${index}.rule_ids.${ruleIndex}`)); sortedUnique(ruleIds, `conflicts.${index}.rule_ids`, 2); return { axis: requiredString(value, "axis"), rule_ids: ruleIds, explanation: requiredString(value, "explanation") }; }
function parseSourceSummary(record: UnknownRecord): ResearchSourceSummary { exact(record, ["requested", "canonical", "succeeded", "failed", "duplicates"]); const summary = { requested: requiredNumber(record, "requested"), canonical: requiredNumber(record, "canonical"), succeeded: requiredNumber(record, "succeeded"), failed: requiredNumber(record, "failed"), duplicates: requiredNumber(record, "duplicates") }; if (summary.canonical + summary.duplicates !== summary.requested || summary.succeeded + summary.failed !== summary.canonical) invalid("source_summary"); return summary; }
function parsePurpose(value: unknown, path: string): ResearchProjectPurpose { switch (value) { case "deck.pitch": case "prototype.dashboard": case "prototype.diagram": case "prototype.editorial": case "prototype.landing": case "prototype.sandbox": return value; default: return invalid(path); } }
function parseSourceKind(value: string): ResearchSourceKind { switch (value) { case "web": case "repository": case "document": case "fixture": return value; default: return invalid("kind"); } }
function parseMode(value: string): ResearchMode { switch (value) { case "live": case "fixture": return value; default: return invalid("mode"); } }
function parseOutcome(value: string): ResearchResultV1["outcome"] { switch (value) { case "completed": case "partial": return value; default: return invalid("outcome"); } }
function schemaV1(record: UnknownRecord): void { if (requiredNumber(record, "schema_version") !== 1) invalid("schema_version"); }
function exact(record: UnknownRecord, keys: readonly string[]): void { const allowed = new Set(keys); for (const key of Object.keys(record)) if (!allowed.has(key)) invalid(key); for (const key of keys) if (!(key in record)) throw new UpgradeContractError("missing_required_field", key); }
function integerRange(record: UnknownRecord, key: string, minimum: number, maximum: number): number { const value = requiredNumber(record, key); if (value < minimum || value > maximum) invalid(key); return value; }
function confidence(record: UnknownRecord, key: string): number { const value = record[key]; if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) invalid(key); return value; }
function nullableString(record: UnknownRecord, key: string): string | null { const value = record[key]; if (value === null) return null; if (typeof value !== "string" || value.length === 0) invalid(key); return value; }
function nullableNumber(record: UnknownRecord, key: string): number | null { return record[key] === null ? null : requiredNumber(record, key); }
function nullableDigest(record: UnknownRecord, key: string): string | null { const value = nullableString(record, key); return value === null ? null : parseResearchDigest(value, key); }
function sortedUnique(values: readonly string[], path: string, minimum = 0): void { if (values.length < minimum) invalid(path); for (let index = 1; index < values.length; index += 1) { const previous = values[index - 1]; const current = values[index]; if (previous === undefined || current === undefined || previous >= current) invalid(path); } }
function validHttpUrl(value: string): boolean { if (!URL.canParse(value)) return false; const protocol = new URL(value).protocol; return protocol === "http:" || protocol === "https:"; }
function invalid(path: string): never { throw new UpgradeContractError("invalid_field", path); }
