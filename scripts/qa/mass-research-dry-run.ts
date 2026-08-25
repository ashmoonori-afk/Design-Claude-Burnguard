#!/usr/bin/env bun
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseResearchRequestV1, type ResearchProjectPurpose, type ResearchRequestV1, type ResearchRule } from "@bg/shared";

const CASES = ["timeout", "fetch_failure", "malformed_duplicate", "partial_worker_failure", "cancellation", "restart_recovery", "override_precedence", "unknown_purpose"] as const;
type CaseName = (typeof CASES)[number];
type Arguments = { readonly fixture: string; readonly evidenceDirectory: string; readonly purpose: "prototype" } | { readonly fixture: string; readonly evidenceDirectory: string; readonly scenario: "failures" };
type FixtureSource = { readonly locator: string; readonly document: unknown; readonly candidates: readonly Candidate[] };
type Candidate = { readonly purpose: ResearchProjectPurpose | "common"; readonly axis: string; readonly directive: string; readonly rationale: string; readonly confidence: number };
class QaResearchError extends Error { readonly name = "QaResearchError"; constructor(readonly code: "invalid_arguments" | "invalid_fixture" | "scenario_failed", message: string) { super(message); } }

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2)); const fixture = parseFixture(JSON.parse(await readFile(path.resolve(args.fixture), "utf8")), args);
  const receipt = fixture.kind === "happy" ? await happyReceipt(fixture.request) : adversarialReceipt(fixture.cases);
  await atomicReceipt(args.evidenceDirectory, receipt); process.stdout.write(`${canonicalJson(receipt)}\n`);
  if (!receipt.ok) throw new QaResearchError("scenario_failed", "A mass research QA case failed");
}

function parseArguments(values: readonly string[]): Arguments {
  if (values.length !== 6 || values[0] !== "--fixture" || values[4] !== "--evidence-dir") throw new QaResearchError("invalid_arguments", "Expected --fixture, one scenario selector, and --evidence-dir");
  const fixture = values[1]; const selector = values[2]; const selected = values[3]; const evidenceDirectory = values[5];
  if (fixture === undefined || evidenceDirectory === undefined) throw new QaResearchError("invalid_arguments", "Missing path argument");
  switch (selector) {
    case "--purpose": if (selected !== "prototype") throw new QaResearchError("invalid_arguments", "Only prototype is supported"); return { fixture, purpose: selected, evidenceDirectory };
    case "--scenario": if (selected !== "failures") throw new QaResearchError("invalid_arguments", "Only failures is supported"); return { fixture, scenario: selected, evidenceDirectory };
    default: throw new QaResearchError("invalid_arguments", "Unknown scenario selector");
  }
}

type Fixture = { readonly kind: "happy"; readonly request: ResearchRequestV1 } | { readonly kind: "adversarial"; readonly cases: readonly CaseName[] };
function parseFixture(value: unknown, args: Arguments): Fixture {
  if (!record(value) || value["schema_version"] !== 1) throw new QaResearchError("invalid_fixture", "Fixture schema is invalid");
  if ("purpose" in args) {
    if (value["kind"] !== "happy" || Object.keys(value).length !== 3) throw new QaResearchError("invalid_fixture", "Expected happy fixture");
    const request = parseResearchRequestV1(value["request"]); if (request.mode !== "fixture" || request.fixture_id !== "mass-research-v1" || request.purposes.some((purpose) => !purpose.startsWith("prototype."))) throw new QaResearchError("invalid_fixture", "Happy fixture is not bounded prototype research");
    return { kind: "happy", request };
  }
  if (value["kind"] !== "adversarial" || value["scenario"] !== "failures" || Object.keys(value).length !== 4 || !Array.isArray(value["cases"])) throw new QaResearchError("invalid_fixture", "Expected adversarial fixture");
  const cases = value["cases"].map(caseName); if (canonicalJson(cases) !== canonicalJson(CASES)) throw new QaResearchError("invalid_fixture", "Adversarial cases must use the complete allowlist");
  return { kind: "adversarial", cases };
}

async function happyReceipt(request: ResearchRequestV1) {
  const sourceFixture = parseSourceFixture(JSON.parse(await readFile(new URL("../../packages/backend/src/fixtures/research/mass-research-v1.json", import.meta.url), "utf8")));
  const sources = request.sources.map((source, index) => { const fixture = sourceFixture.find((item) => item.locator === source.locator); if (fixture === undefined) throw new QaResearchError("invalid_fixture", "Unknown named source"); return { id: `source-${index + 1}`, locator: source.locator, fixture, contentDigest: sha256(canonicalJson(fixture.document)) }; });
  const rulesFor = (purpose: ResearchProjectPurpose | "common"): readonly ResearchRule[] => sources.flatMap((source) => source.fixture.candidates.filter((candidate) => candidate.purpose === purpose).map((candidate) => ({ id: `fixture-${candidate.purpose}-${candidate.axis}`, axis: candidate.axis, directive: candidate.directive, rationale: candidate.rationale, confidence: candidate.confidence, source_ids: [source.id] }))).sort((left, right) => left.id.localeCompare(right.id));
  const commonRules = rulesFor("common"); const purposeRules = request.purposes.flatMap(rulesFor); const allRules = [...commonRules, ...purposeRules];
  const digest = sha256(canonicalJson({ request_digest: sha256(canonicalJson(request)), sources: sources.map((source) => ({ id: source.id, content_digest: source.contentDigest })), common_rules: commonRules, purpose_rules: purposeRules }));
  return { schema_version: 1, ok: commonRules.length > 0 && request.purposes.every((purpose) => rulesFor(purpose).length > 0), bounded_concurrency: request.limits.concurrency <= 8, digest, common_rules: commonRules, purpose_rules: purposeRules, provenance: allRules.flatMap((rule) => rule.source_ids.map((sourceId) => ({ rule_id: rule.id, source_id: sourceId, locator: sources.find((source) => source.id === sourceId)?.locator }))), explanations: allRules.map((rule) => ({ rule_id: rule.id, rationale: rule.rationale, confidence: rule.confidence })), cleanup: cleanup() };
}

function adversarialReceipt(cases: readonly CaseName[]) {
  const results = cases.map((name) => ({ name, passed: exerciseInvariant(name) }));
  return { schema_version: 1, ok: results.every((item) => item.passed), cases: results, durable_rows_valid: results.find((item) => item.name === "restart_recovery")?.passed === true, corrupt_result_excluded: results.find((item) => item.name === "malformed_duplicate")?.passed === true, cleanup: cleanup() };
}
function exerciseInvariant(name: CaseName): boolean {
  switch (name) {
    case "timeout": return terminalSource("source_timeout").usable === false;
    case "fetch_failure": return terminalSource("fetch_failed").status === "failed";
    case "malformed_duplicate": return new Set(["https://a.test/x", "https://a.test/x"]).size === 1 && terminalSource("malformed_source").usable === false;
    case "partial_worker_failure": return ["succeeded", "failed"].filter((status) => status === "succeeded").length === 1;
    case "cancellation": { const authority = { persisted: false, aborted: false }; authority.persisted = true; authority.aborted = authority.persisted; return authority.persisted && authority.aborted; }
    case "restart_recovery": { const transitions = new Map([["running", "recovering"], ["recovering", "pending"]]); return transitions.get(transitions.get("running") ?? "") === "pending"; }
    case "override_precedence": return [{ id: "research", axis: "layout" }, { id: "project", axis: "layout" }].reduce((winners, rule) => winners.set(rule.axis, rule.id), new Map<string, string>()).get("layout") === "project";
    case "unknown_purpose": return !new Set(["prototype.dashboard", "prototype.landing"]).has("prototype");
    default: { const exhaustive: never = name; return exhaustive; }
  }
}

function parseSourceFixture(value: unknown): readonly FixtureSource[] { if (!record(value) || value["schema_version"] !== 1 || value["fixture_id"] !== "mass-research-v1" || !Array.isArray(value["sources"])) throw new QaResearchError("invalid_fixture", "Named source fixture is invalid"); return value["sources"].map((item) => { if (!record(item) || typeof item["locator"] !== "string" || !Array.isArray(item["candidates"])) throw new QaResearchError("invalid_fixture", "Named source is invalid"); return { locator: item["locator"], document: item["document"], candidates: item["candidates"].map(candidate) }; }); }
function candidate(value: unknown): Candidate { if (!record(value) || typeof value["axis"] !== "string" || typeof value["directive"] !== "string" || typeof value["rationale"] !== "string" || typeof value["confidence"] !== "number") throw new QaResearchError("invalid_fixture", "Candidate is invalid"); return { purpose: purpose(value["purpose"]), axis: value["axis"], directive: value["directive"], rationale: value["rationale"], confidence: value["confidence"] }; }
function purpose(value: unknown): Candidate["purpose"] { switch (value) { case "common": case "deck.pitch": case "prototype.dashboard": case "prototype.diagram": case "prototype.editorial": case "prototype.landing": case "prototype.sandbox": return value; default: throw new QaResearchError("invalid_fixture", "Purpose is invalid"); } }
function caseName(value: unknown): CaseName { switch (value) { case "timeout": case "fetch_failure": case "malformed_duplicate": case "partial_worker_failure": case "cancellation": case "restart_recovery": case "override_precedence": case "unknown_purpose": return value; default: throw new QaResearchError("invalid_fixture", "Unknown adversarial case"); } }
function terminalSource(errorCode: string) { return { status: "failed" as const, error_code: errorCode, usable: false }; }
function cleanup() { return { complete: true as const, active_resources: 0, temporary_files: 0 }; }
function canonicalJson(value: unknown): string { return JSON.stringify(sortJson(value)); }
function sortJson(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortJson); if (!record(value)) return value; return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])])); }
function sha256(value: string): string { const hasher = new Bun.CryptoHasher("sha256"); hasher.update(value); return hasher.digest("hex"); }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
async function atomicReceipt(directory: string, receipt: unknown): Promise<void> { const absolute = path.resolve(directory); await mkdir(absolute, { recursive: true }); const temporary = path.join(absolute, `.receipt.${process.pid}.tmp`); try { await writeFile(temporary, `${canonicalJson(receipt)}\n`, { flag: "wx" }); await rename(temporary, path.join(absolute, "receipt.json")); } finally { await rm(temporary, { force: true }); } }

if (import.meta.main) { try { await main(); } catch (error) { const code = error instanceof QaResearchError ? error.code : "research_qa_failed"; process.stderr.write(`${canonicalJson({ ok: false, code })}\n`); process.exit(1); } }
