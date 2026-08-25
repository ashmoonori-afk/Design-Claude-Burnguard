#!/usr/bin/env bun
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseResearchRequestV1, type ResearchRequestV1 } from "@bg/shared";
import { loadProductFunction, QaResourceTracker, runAdversarialCases, type CaseName, type ResearchDependencies, type ResearchExecution, type ResearchRunner } from "./mass-research-scenarios";

const CASES = ["timeout", "fetch_failure", "malformed_duplicate", "partial_worker_failure", "cancellation", "restart_recovery", "override_precedence", "unknown_purpose"] as const satisfies readonly CaseName[];
type Arguments = { readonly fixture: string; readonly evidenceDirectory: string; readonly purpose: "prototype" } | { readonly fixture: string; readonly evidenceDirectory: string; readonly scenario: "failures" };
type Fixture = { readonly kind: "happy"; readonly request: ResearchRequestV1 } | { readonly kind: "adversarial"; readonly cases: readonly CaseName[] };
class QaResearchError extends Error { readonly name = "QaResearchError"; constructor(readonly code: "invalid_arguments" | "invalid_fixture" | "scenario_failed", message: string) { super(message); } }

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const fixture = parseFixture(JSON.parse(await readFile(path.resolve(args.fixture), "utf8")), args);
  const tracker = new QaResourceTracker();
  const body = fixture.kind === "happy" ? await buildHappyReceipt(fixture.request, undefined, tracker) : await buildAdversarialReceipt(fixture.cases, tracker);
  const receipt = { ...body, cleanup: tracker.cleanup() };
  if (!receipt.cleanup.complete) throw new QaResearchError("scenario_failed", "Mass research QA leaked resources");
  await atomicReceipt(args.evidenceDirectory, receipt, tracker);
  if (!tracker.cleanup().complete) throw new QaResearchError("scenario_failed", "Mass research QA cleanup did not converge");
  process.stdout.write(`${canonicalJson(receipt)}\n`);
  if (!receipt.ok) throw new QaResearchError("scenario_failed", "A mass research QA case failed");
}

function parseArguments(values: readonly string[]): Arguments {
  if (values.length !== 6 || values[0] !== "--fixture" || values[4] !== "--evidence-dir") throw new QaResearchError("invalid_arguments", "Expected --fixture, one scenario selector, and --evidence-dir");
  const fixture = values[1]; const selector = values[2]; const selected = values[3]; const evidenceDirectory = values[5];
  if (fixture === undefined || evidenceDirectory === undefined) throw new QaResearchError("invalid_arguments", "Missing path argument");
  if (selector === "--purpose" && selected === "prototype") return { fixture, purpose: selected, evidenceDirectory };
  if (selector === "--scenario" && selected === "failures") return { fixture, scenario: selected, evidenceDirectory };
  throw new QaResearchError("invalid_arguments", "Unknown scenario selector");
}

function parseFixture(value: unknown, args: Arguments): Fixture {
  if (!record(value) || value["schema_version"] !== 1) throw new QaResearchError("invalid_fixture", "Fixture schema is invalid");
  if ("purpose" in args) {
    if (value["kind"] !== "happy" || Object.keys(value).length !== 3) throw new QaResearchError("invalid_fixture", "Expected happy fixture");
    const request = parseResearchRequestV1(value["request"]);
    if (request.mode !== "fixture" || request.fixture_id !== "mass-research-v1" || request.purposes.some((purpose) => !purpose.startsWith("prototype."))) throw new QaResearchError("invalid_fixture", "Happy fixture is not bounded prototype research");
    return { kind: "happy", request };
  }
  if (value["kind"] !== "adversarial" || value["scenario"] !== "failures" || Object.keys(value).length !== 4 || !Array.isArray(value["cases"])) throw new QaResearchError("invalid_fixture", "Expected adversarial fixture");
  const cases = value["cases"].map(caseName);
  if (canonicalJson(cases) !== canonicalJson(CASES)) throw new QaResearchError("invalid_fixture", "Adversarial cases must use the complete allowlist");
  return { kind: "adversarial", cases };
}

export async function buildHappyReceipt(request: ResearchRequestV1, suppliedRunner?: ResearchRunner, tracker = new QaResourceTracker()) {
  const runner = suppliedRunner ?? await loadProductFunction<ResearchRunner>("services/research-orchestrator.ts", "executeResearch");
  let id = 0; let forbiddenCalls = 0;
  const forbidden = async (): Promise<never> => { forbiddenCalls += 1; throw new TypeError("Fixture mode crossed an external dependency boundary"); };
  const execution = await runner(request, { now: () => 1_000 + id, newId: () => `qa-${++id}`, fetchSource: forbidden, runWorker: forbidden, synthesize: forbidden, setTimer: tracker.setTimer, clearTimer: tracker.clearTimer });
  if (execution.status !== "completed" || execution.result === null || execution.resultDigest === null) throw new QaResearchError("scenario_failed", "Product research execution did not produce a usable fixture result");
  const result = execution.result; const rules = [...result.common_rules, ...request.purposes.flatMap((purpose) => result.purpose_rules[purpose])];
  const locators = new Map(execution.sources.map((source) => [source.source.id, source.source.locator]));
  return {
    schema_version: 1 as const, ok: forbiddenCalls === 0 && rules.length > 0,
    bounded_concurrency: tracker.maximumTimers > 0 && tracker.maximumTimers <= request.limits.concurrency,
    digest: execution.resultDigest, result,
    common_rules: result.common_rules, purpose_rules: request.purposes.flatMap((purpose) => result.purpose_rules[purpose]),
    provenance: rules.flatMap((rule) => rule.source_ids.map((sourceId) => ({ rule_id: rule.id, source_id: sourceId, locator: locators.get(sourceId) }))),
    explanations: rules.map((rule) => ({ rule_id: rule.id, rationale: rule.rationale, confidence: rule.confidence })),
    execution: { status: execution.status, run_id: execution.runId, request_digest: execution.requestDigest, evidence_set_digest: execution.evidenceSetDigest, result_digest: execution.resultDigest, sources: execution.sources },
  };
}

async function buildAdversarialReceipt(cases: readonly CaseName[], tracker: QaResourceTracker) {
  const results = await runAdversarialCases(cases, tracker);
  return { schema_version: 1 as const, ok: results.every((item) => item.passed), cases: results, durable_rows_valid: results.find((item) => item.name === "restart_recovery")?.passed === true, corrupt_result_excluded: results.find((item) => item.name === "malformed_duplicate")?.passed === true };
}

function caseName(value: unknown): CaseName {
  if (typeof value === "string" && (CASES as readonly string[]).includes(value)) return value as CaseName;
  throw new QaResearchError("invalid_fixture", "Unknown adversarial case");
}
function canonicalJson(value: unknown): string { return JSON.stringify(sortJson(value)); }
function sortJson(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortJson); if (!record(value)) return value; return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])])); }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
async function atomicReceipt(directory: string, receipt: unknown, tracker: QaResourceTracker): Promise<void> {
  const absolute = path.resolve(directory); await mkdir(absolute, { recursive: true }); const temporary = path.join(absolute, `.receipt.${process.pid}.tmp`); tracker.trackArtifact(temporary);
  try { await writeFile(temporary, `${canonicalJson(receipt)}\n`, { flag: "wx" }); await rename(temporary, path.join(absolute, "receipt.json")); }
  finally { await rm(temporary, { force: true }); tracker.releaseArtifact(temporary); }
}

if (import.meta.main) { try { await main(); } catch (error) { const code = error instanceof QaResearchError ? error.code : "research_qa_failed"; process.stderr.write(`${canonicalJson({ ok: false, code })}\n`); process.exit(1); } }
