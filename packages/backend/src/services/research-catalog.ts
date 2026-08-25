import commonDocument from "../research-data/common-rules.json";
import purposeDocument from "../research-data/purpose-references.json";
import sourceDocument from "../research-data/sources.json";
import {
  isPromptPurpose,
  PROMPT_PURPOSES,
  type PromptPurpose,
} from "./prompt-purpose";

export type CatalogConfidence = "high" | "medium" | "low";
export type CatalogSource = { readonly id: string; readonly retrieved: string; readonly url: string; readonly title_or_owner: string; readonly tags: readonly string[]; readonly evidence: string; readonly license_usage: string; readonly confidence: CatalogConfidence; readonly limitations: string };
export type CatalogCommonRule = { readonly id: string; readonly authority_class: "normative_web_constraint" | "sampled_system_guidance"; readonly topic: string; readonly statement: string; readonly source_ids: readonly string[]; readonly confidence: CatalogConfidence; readonly limitations: string };
export type CatalogPurpose = { readonly id: PromptPurpose; readonly axes: { readonly project_type: string; readonly request_intent: string; readonly creation_mode: string; readonly fallback: string }; readonly title: string; readonly guidance: readonly string[]; readonly common_rule_ids: readonly string[]; readonly source_ids: readonly string[]; readonly confidence: CatalogConfidence; readonly limitations: string };
export type ResearchCatalog = { readonly sources: readonly CatalogSource[]; readonly common_rules: readonly CatalogCommonRule[]; readonly purposes: readonly CatalogPurpose[] };

export class ResearchCatalogError extends Error {
  readonly name = "ResearchCatalogError";
  constructor(readonly path: string) { super(`invalid research catalog: ${path}`); }
}

export function loadResearchCatalog(): ResearchCatalog {
  return parseResearchCatalog(sourceDocument, commonDocument, purposeDocument);
}

export function parseResearchCatalog(sourcesInput: unknown, commonInput: unknown, purposesInput: unknown): ResearchCatalog {
  const sourcesRoot = object(sourcesInput, "sources");
  exact(sourcesRoot, ["schema_version", "sources"], "sources");
  version(sourcesRoot, "sources");
  const sources = array(sourcesRoot["sources"], "sources.sources").map(parseSource);
  sortedUnique(sources.map((source) => source.id), "sources.sources", 1);
  const sourceIds = new Set(sources.map((source) => source.id));

  const commonRoot = object(commonInput, "common_rules");
  exact(commonRoot, ["schema_version", "rules"], "common_rules");
  version(commonRoot, "common_rules");
  const commonRules = array(commonRoot["rules"], "common_rules.rules").map(parseCommonRule);
  sortedUnique(commonRules.map((rule) => rule.id), "common_rules.rules", 1);
  for (const rule of commonRules) citations(rule.source_ids, sourceIds, `common_rules.${rule.id}.source_ids`);
  const commonIds = new Set(commonRules.map((rule) => rule.id));

  const purposeRoot = object(purposesInput, "purposes");
  exact(purposeRoot, ["schema_version", "purposes"], "purposes");
  version(purposeRoot, "purposes");
  const purposes = array(purposeRoot["purposes"], "purposes.purposes").map(parsePurpose);
  sortedUnique(purposes.map((purpose) => purpose.id), "purposes.purposes", 1);
  if (purposes.length !== PROMPT_PURPOSES.length || purposes.some((purpose, index) => purpose.id !== PROMPT_PURPOSES[index])) fail("purposes.purposes");
  for (const purpose of purposes) {
    citations(purpose.source_ids, sourceIds, `purposes.${purpose.id}.source_ids`);
    citations(purpose.common_rule_ids, commonIds, `purposes.${purpose.id}.common_rule_ids`);
  }
  return { sources, common_rules: commonRules, purposes };
}

function parseSource(value: unknown, index: number): CatalogSource {
  const path = `sources.sources.${index}`;
  const record = object(value, path);
  exact(record, ["id", "retrieved", "url", "title_or_owner", "tags", "evidence", "license_usage", "confidence", "limitations"], path);
  const url = text(record, "url", path);
  if (!URL.canParse(url) || new URL(url).protocol !== "https:") fail(`${path}.url`);
  const tags = texts(record["tags"], `${path}.tags`);
  sortedUnique(tags, `${path}.tags`, 1);
  const retrieved = text(record, "retrieved", path);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(retrieved)) fail(`${path}.retrieved`);
  return { id: identified(record, "id", path, /^S-\d{3}$/u), retrieved, url, title_or_owner: text(record, "title_or_owner", path), tags, evidence: text(record, "evidence", path), license_usage: text(record, "license_usage", path), confidence: confidence(record["confidence"], `${path}.confidence`), limitations: text(record, "limitations", path) };
}

function parseCommonRule(value: unknown, index: number): CatalogCommonRule {
  const path = `common_rules.rules.${index}`;
  const record = object(value, path);
  exact(record, ["id", "authority_class", "topic", "statement", "source_ids", "confidence", "limitations"], path);
  const authority = record["authority_class"];
  if (authority !== "normative_web_constraint" && authority !== "sampled_system_guidance") fail(`${path}.authority_class`);
  const sourceIds = texts(record["source_ids"], `${path}.source_ids`);
  sortedUnique(sourceIds, `${path}.source_ids`, 1);
  return { id: identified(record, "id", path, /^CR-\d{3}$/u), authority_class: authority, topic: text(record, "topic", path), statement: text(record, "statement", path), source_ids: sourceIds, confidence: confidence(record["confidence"], `${path}.confidence`), limitations: text(record, "limitations", path) };
}

function parsePurpose(value: unknown, index: number): CatalogPurpose {
  const path = `purposes.purposes.${index}`;
  const record = object(value, path);
  exact(record, ["id", "axes", "title", "guidance", "common_rule_ids", "source_ids", "confidence", "limitations"], path);
  const axes = object(record["axes"], `${path}.axes`);
  exact(axes, ["project_type", "request_intent", "creation_mode", "fallback"], `${path}.axes`);
  const sourceIds = texts(record["source_ids"], `${path}.source_ids`);
  const commonIds = texts(record["common_rule_ids"], `${path}.common_rule_ids`);
  const guidance = texts(record["guidance"], `${path}.guidance`);
  sortedUnique(sourceIds, `${path}.source_ids`, 1);
  sortedUnique(commonIds, `${path}.common_rule_ids`, 1);
  if (guidance.length === 0) fail(`${path}.guidance`);
  return { id: purposeId(record["id"], `${path}.id`), axes: { project_type: text(axes, "project_type", `${path}.axes`), request_intent: text(axes, "request_intent", `${path}.axes`), creation_mode: text(axes, "creation_mode", `${path}.axes`), fallback: text(axes, "fallback", `${path}.axes`) }, title: text(record, "title", path), guidance, common_rule_ids: commonIds, source_ids: sourceIds, confidence: confidence(record["confidence"], `${path}.confidence`), limitations: text(record, "limitations", path) };
}

type JsonObject = Readonly<Record<string, unknown>>;
function object(value: unknown, path: string): JsonObject { if (!isJsonObject(value)) fail(path); return value; }
function isJsonObject(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
function array(value: unknown, path: string): readonly unknown[] { if (!Array.isArray(value)) fail(path); return value; }
function text(record: JsonObject, key: string, path: string): string { const value = record[key]; if (typeof value !== "string" || value.trim().length === 0) fail(`${path}.${key}`); return value; }
function texts(value: unknown, path: string): readonly string[] { return array(value, path).map((item, index) => typeof item === "string" && item.length > 0 ? item : fail(`${path}.${index}`)); }
function identified(record: JsonObject, key: string, path: string, pattern: RegExp): string { const value = text(record, key, path); if (!pattern.test(value)) fail(`${path}.${key}`); return value; }
function exact(record: JsonObject, keys: readonly string[], path: string): void { if (Object.keys(record).length !== keys.length || keys.some((key) => !(key in record))) fail(path); }
function version(record: JsonObject, path: string): void { if (record["schema_version"] !== 1) fail(`${path}.schema_version`); }
function confidence(value: unknown, path: string): CatalogConfidence { switch (value) { case "high": case "medium": case "low": return value; default: return fail(path); } }
function purposeId(value: unknown, path: string): PromptPurpose {
  return isPromptPurpose(value) ? value : fail(path);
}
function sortedUnique(values: readonly string[], path: string, minimum: number): void { if (values.length < minimum) fail(path); for (let index = 1; index < values.length; index += 1) { const previous = values[index - 1]; const current = values[index]; if (previous === undefined || current === undefined || previous >= current) fail(path); } }
function citations(values: readonly string[], known: ReadonlySet<string>, path: string): void { if (values.some((value) => !known.has(value))) fail(path); }
function fail(path: string): never { throw new ResearchCatalogError(path); }
