import type { Database } from "bun:sqlite";
import { parseResearchResultV1, type ResearchConflict, type ResearchProjectPurpose, type ResearchRule, type ResearchSourceRecord } from "@bg/shared";
import { ResearchCorruptionError, evidenceSetDigest, getResearchRun, listResearchSources } from "../db/research-repository";
import { type CatalogConfidence, type CatalogSource, loadResearchCatalog, type ResearchCatalog } from "./research-catalog";
import {
  isPromptPurpose,
  type PromptPurpose,
} from "./prompt-purpose";

export class ResearchSelectionError extends Error {
  readonly name = "ResearchSelectionError";
  constructor(readonly code: "unknown_purpose" | "duplicate_rule_id" | "invalid_reference" | "reference_cycle" | "corrupt_result", readonly detail: string) { super(`${code}: ${detail}`); }
}

export type RuleReference = { readonly id: string; readonly reference: string };
export type ResearchRuleLayer = { readonly id: string; readonly rules: readonly (ResearchRule | RuleReference)[] };
export type ResolvedLayerRule = ResearchRule & { readonly layer_id: string; readonly low_confidence: boolean };
export type LayerConflict = { readonly axis: string; readonly winner_id: string; readonly overridden_rule_ids: readonly string[] };
export type LayerResolution = { readonly rules: readonly ResolvedLayerRule[]; readonly conflicts: readonly LayerConflict[] };
export type SelectedSource = { readonly id: string; readonly url: string };
export type CatalogSelectedRule = { readonly id: string; readonly axis: string; readonly directive: string; readonly rationale: string; readonly confidence: CatalogConfidence; readonly low_confidence: boolean; readonly source_ids: readonly string[]; readonly sources: readonly SelectedSource[] };
export type CatalogRuleSelection = { readonly purpose: PromptPurpose; readonly title: string; readonly confidence: CatalogConfidence; readonly low_confidence: boolean; readonly limitations: string; readonly common_rules: readonly CatalogSelectedRule[]; readonly purpose_rules: readonly CatalogSelectedRule[] };
export type RuntimeSelectedRule = ResearchRule & { readonly low_confidence: boolean; readonly sources: readonly SelectedSource[] };
export type ResearchPromptContext = { readonly schema_version: 1; readonly purpose: ResearchProjectPurpose; readonly run_id: string; readonly result_digest: string; readonly outcome: "completed" | "partial"; readonly common_rules: readonly RuntimeSelectedRule[]; readonly purpose_rules: readonly RuntimeSelectedRule[]; readonly conflicts: readonly ResearchConflict[] };

type FlattenedDeclaration = { readonly layerId: string; readonly declaration: ResearchRule | RuleReference };

export function selectCatalogRules(catalog: ResearchCatalog, purposeInput: unknown): CatalogRuleSelection {
  const purpose = supportedPromptPurpose(purposeInput);
  const purposeRecord = catalog.purposes.find((item) => item.id === purpose);
  if (purposeRecord === undefined) throw new ResearchSelectionError("unknown_purpose", String(purposeInput));
  const sources = new Map(catalog.sources.map((source) => [source.id, source]));
  const common = new Map(catalog.common_rules.map((rule) => [rule.id, rule]));
  const commonRules = purposeRecord.common_rule_ids.map((id) => {
    const rule = common.get(id);
    if (rule === undefined) throw new ResearchSelectionError("invalid_reference", id);
    return { id: rule.id, axis: rule.topic, directive: rule.statement, rationale: rule.limitations, confidence: rule.confidence, low_confidence: rule.confidence !== "high", source_ids: rule.source_ids, sources: catalogSources(rule.source_ids, sources) };
  });
  const purposeRules = purposeRecord.guidance.map((directive, index) => ({ id: `${purposeRecord.id}:${index + 1}`, axis: `purpose:${index + 1}`, directive, rationale: purposeRecord.limitations, confidence: purposeRecord.confidence, low_confidence: purposeRecord.confidence !== "high", source_ids: purposeRecord.source_ids, sources: catalogSources(purposeRecord.source_ids, sources) }));
  return { purpose, title: purposeRecord.title, confidence: purposeRecord.confidence, low_confidence: purposeRecord.confidence !== "high", limitations: purposeRecord.limitations, common_rules: commonRules, purpose_rules: purposeRules };
}

export function resolveResearchRuleLayers(layers: readonly ResearchRuleLayer[]): LayerResolution {
  const flattened: FlattenedDeclaration[] = [];
  const declarations = new Map<string, FlattenedDeclaration>();
  for (const layer of layers) {
    if (layer.id.length === 0) throw new ResearchSelectionError("invalid_reference", "layer id");
    for (const declaration of layer.rules) {
      if (declaration.id.length === 0) throw new ResearchSelectionError("invalid_reference", "rule id");
      if (declarations.has(declaration.id)) throw new ResearchSelectionError("duplicate_rule_id", declaration.id);
      const flattenedDeclaration = { layerId: layer.id, declaration };
      flattened.push(flattenedDeclaration);
      declarations.set(declaration.id, flattenedDeclaration);
    }
  }
  const resolvedById = new Map<string, ResolvedLayerRule>();
  const resolving = new Set<string>();
  const resolve = (id: string): ResolvedLayerRule => {
    const known = resolvedById.get(id);
    if (known !== undefined) return known;
    if (resolving.has(id)) throw new ResearchSelectionError("reference_cycle", id);
    const flattenedDeclaration = declarations.get(id);
    if (flattenedDeclaration === undefined) throw new ResearchSelectionError("invalid_reference", id);
    resolving.add(id);
    const declaration = flattenedDeclaration.declaration;
    const resolved = "reference" in declaration
      ? { ...resolve(declaration.reference), id: declaration.id, layer_id: flattenedDeclaration.layerId }
      : { ...declaration, layer_id: flattenedDeclaration.layerId, low_confidence: declaration.confidence < 0.5 };
    resolving.delete(id);
    resolvedById.set(id, resolved);
    return resolved;
  };
  const winners = new Map<string, ResolvedLayerRule>();
  const overridden = new Map<string, string[]>();
  for (const item of flattened) {
    const resolved = resolve(item.declaration.id);
    const previous = winners.get(resolved.axis);
    if (previous !== undefined) overridden.set(resolved.axis, [...(overridden.get(resolved.axis) ?? []), previous.id]);
    winners.delete(resolved.axis);
    winners.set(resolved.axis, resolved);
  }
  const conflicts = [...overridden].map(([axis, overriddenRuleIds]) => {
    const winner = winners.get(axis);
    if (winner === undefined) throw new ResearchSelectionError("invalid_reference", axis);
    return { axis, winner_id: winner.id, overridden_rule_ids: overriddenRuleIds };
  });
  return { rules: [...winners.values()], conflicts };
}

export function selectResearchPromptContext(db: Database, purposeInput: unknown): ResearchPromptContext | null {
  const purpose = supportedResearchPurpose(purposeInput);
  const candidates = db.query<{ readonly id: string }, []>("SELECT id FROM research_runs WHERE usable=1 AND status IN ('completed','partial') ORDER BY completed_at DESC,id DESC").all();
  for (const candidate of candidates) {
    try {
      return validatedContext(db, candidate.id, purpose);
    } catch (error) {
      if (!(error instanceof ResearchCorruptionError) && !(error instanceof ResearchSelectionError && error.code === "corrupt_result")) throw error;
      quarantineResearchResult(db, candidate.id);
    }
  }
  return null;
}

export function quarantineResearchResult(db: Database, runId: string): void {
  const changed = db.prepare("UPDATE research_runs SET status='corrupt',evidence_set_digest=NULL,result_json=NULL,result_digest=NULL,usable=0,stop_reason='persisted_data_corrupt' WHERE id=? AND status IN ('completed','partial') AND usable=1").run(runId).changes;
  if (changed !== 1) throw new ResearchSelectionError("corrupt_result", runId);
}

function validatedContext(db: Database, runId: string, purpose: ResearchProjectPurpose): ResearchPromptContext {
  const run = getResearchRun(db, runId);
  if (run.result_json === null || run.result_digest === null || run.evidence_set_digest === null) corrupt(runId);
  const result = parseResearchResultV1(run.result_json);
  const sources = listResearchSources(db, runId);
  if (evidenceSetDigest(sources) !== run.evidence_set_digest) corrupt(runId);
  const sourceLookup = new Map(sources.map((source) => [source.id, source]));
  const allRules = [...result.common_rules, ...result.purpose_rules["deck.pitch"], ...result.purpose_rules["prototype.dashboard"], ...result.purpose_rules["prototype.diagram"], ...result.purpose_rules["prototype.editorial"], ...result.purpose_rules["prototype.landing"], ...result.purpose_rules["prototype.sandbox"]];
  for (const rule of allRules) runtimeSources(rule.source_ids, sourceLookup, runId);
  const commonRules = result.common_rules.map((rule) => selectedRuntimeRule(rule, sourceLookup, runId));
  const purposeRules = result.purpose_rules[purpose].map((rule) => selectedRuntimeRule(rule, sourceLookup, runId));
  const selectedIds = new Set([...commonRules, ...purposeRules].map((rule) => rule.id));
  const conflicts = result.conflicts.filter((conflict) => conflict.rule_ids.some((id) => selectedIds.has(id)));
  return { schema_version: 1, purpose, run_id: run.id, result_digest: run.result_digest, outcome: result.outcome, common_rules: commonRules, purpose_rules: purposeRules, conflicts };
}

function selectedRuntimeRule(rule: ResearchRule, sources: ReadonlyMap<string, ResearchSourceRecord>, runId: string): RuntimeSelectedRule { return { ...rule, low_confidence: rule.confidence < 0.5, sources: runtimeSources(rule.source_ids, sources, runId) }; }
function runtimeSources(ids: readonly string[], sources: ReadonlyMap<string, ResearchSourceRecord>, runId: string): readonly SelectedSource[] { return ids.map((id) => { const source = sources.get(id); if (source === undefined || source.run_id !== runId || source.status !== "succeeded") corrupt(`${runId}:${id}`); return { id, url: source.canonical_locator }; }); }
function catalogSources(ids: readonly string[], sources: ReadonlyMap<string, CatalogSource>): readonly SelectedSource[] { return ids.map((id) => { const source = sources.get(id); if (source === undefined) throw new ResearchSelectionError("invalid_reference", id); return { id, url: source.url }; }); }
function supportedPromptPurpose(value: unknown): PromptPurpose {
  if (isPromptPurpose(value)) return value;
  throw new ResearchSelectionError("unknown_purpose", String(value));
}
function supportedResearchPurpose(value: unknown): ResearchProjectPurpose { switch (value) { case "deck.pitch": case "prototype.dashboard": case "prototype.diagram": case "prototype.editorial": case "prototype.landing": case "prototype.sandbox": return value; default: throw new ResearchSelectionError("unknown_purpose", String(value)); } }
function corrupt(detail: string): never { throw new ResearchSelectionError("corrupt_result", detail); }
