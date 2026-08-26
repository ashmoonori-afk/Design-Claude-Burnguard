import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const DATA_ROOT = new URL("../src/research-data/", import.meta.url);
const PURPOSE_IDS = [
  "deck.company",
  "deck.pitch",
  "deck.report",
  "deck.sales",
  "deck.training",
  "prototype.dashboard",
  "prototype.diagram",
  "prototype.editorial",
  "prototype.landing",
  "prototype.sandbox",
] as const;

type JsonRecord = Readonly<Record<string, unknown>>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  if (!isJsonRecord(value)) throw new TypeError("catalog value must be an object");
  return value;
}

function records(value: unknown): readonly JsonRecord[] {
  if (!Array.isArray(value)) throw new TypeError("catalog value must be an array");
  return value.map(record);
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError("catalog field must be nonempty text");
  return value;
}

function texts(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError("catalog field must be a string array");
  return value.map(text);
}

async function catalog(filename: string): Promise<JsonRecord> {
  const raw = await readFile(new URL(filename, DATA_ROOT), "utf8");
  const value: unknown = JSON.parse(raw);
  expect(raw).toBe(`${JSON.stringify(value, null, 2)}\n`);
  expect(record(value)["schema_version"]).toBe(1);
  return record(value);
}

function expectSortedUniqueIds(items: readonly JsonRecord[]): void {
  const ids = items.map((item) => text(item["id"]));
  expect(ids).toEqual([...ids].sort());
  expect(new Set(ids).size).toBe(ids.length);
}

function expectSortedUniqueTexts(values: readonly string[]): void {
  expect(values.length).toBeGreaterThan(0);
  expect(values).toEqual([...values].sort());
  expect(new Set(values).size).toBe(values.length);
}

describe("research catalog artifacts", () => {
  test("Given the source ledger When validated Then provenance fields and compact paraphrases are complete", async () => {
    // Given
    const ledger = await catalog("sources.json");

    // When
    const sources = records(ledger["sources"]);

    // Then
    expectSortedUniqueIds(sources);
    for (const source of sources) {
      expect(text(source["retrieved"])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(text(source["url"])).toMatch(/^https:\/\//);
      expect(text(source["title_or_owner"])).not.toBe("");
      expectSortedUniqueTexts(texts(source["tags"]));
      expect(text(source["evidence"]).trim().split(/\s+/).length).toBeLessThan(20);
      expect(text(source["license_usage"])).not.toBe("");
      expect(text(source["confidence"])).not.toBe("");
      expect(text(source["limitations"])).not.toBe("");
    }
  });

  test("Given common rules When validated Then authority classes stay separate and every citation resolves", async () => {
    // Given
    const [ledger, catalogValue] = await Promise.all([catalog("sources.json"), catalog("common-rules.json")]);
    const sourceIds = new Set(records(ledger["sources"]).map((source) => text(source["id"])));

    // When
    const rules = records(catalogValue["rules"]);

    // Then
    expectSortedUniqueIds(rules);
    expect(new Set(rules.map((rule) => text(rule["authority_class"])))).toEqual(
      new Set(["normative_web_constraint", "sampled_system_guidance"]),
    );
    for (const rule of rules) {
      expect(["normative_web_constraint", "sampled_system_guidance"]).toContain(text(rule["authority_class"]));
      expect(text(rule["statement"])).not.toBe("");
      expect(text(rule["confidence"])).not.toBe("");
      expect(text(rule["limitations"])).not.toBe("");
      const citations = texts(rule["source_ids"]);
      expectSortedUniqueTexts(citations);
      expect(citations.every((id) => sourceIds.has(id))).toBe(true);
    }
  });

  test("Given purpose references When validated Then only supported purposes exist with explicit axes and resolvable citations", async () => {
    // Given
    const [ledger, catalogValue] = await Promise.all([catalog("sources.json"), catalog("purpose-references.json")]);
    const sourceIds = new Set(records(ledger["sources"]).map((source) => text(source["id"])));
    const commonRuleIds = new Set(records((await catalog("common-rules.json"))["rules"]).map((rule) => text(rule["id"])));

    // When
    const purposes = records(catalogValue["purposes"]);

    // Then
    expectSortedUniqueIds(purposes);
    expect(purposes.map((purpose) => text(purpose["id"]))).toEqual([...PURPOSE_IDS]);
    for (const purpose of purposes) {
      const axes = record(purpose["axes"]);
      expect(text(axes["project_type"])).not.toBe("");
      expect(text(axes["request_intent"])).not.toBe("");
      expect(text(axes["creation_mode"])).not.toBe("");
      expect(text(axes["fallback"])).not.toBe("");
      expect(texts(purpose["guidance"]).length).toBeGreaterThan(0);
      expect(text(purpose["confidence"])).not.toBe("");
      expect(text(purpose["limitations"])).not.toBe("");
      const citations = texts(purpose["source_ids"]);
      const ruleIds = texts(purpose["common_rule_ids"]);
      expectSortedUniqueTexts(citations);
      expectSortedUniqueTexts(ruleIds);
      expect(citations.every((id) => sourceIds.has(id))).toBe(true);
      expect(ruleIds.every((id) => commonRuleIds.has(id))).toBe(true);
    }
  });

  test("Given deck purposes When validated Then each deck kind is separately axed at bounded confidence", async () => {
    // Given
    const catalogValue = await catalog("purpose-references.json");

    // When
    const deckPurposes = records(catalogValue["purposes"]).filter((purpose) => text(purpose["id"]).startsWith("deck."));

    // Then
    expect(deckPurposes.map((purpose) => text(purpose["id"]))).toEqual(["deck.company", "deck.pitch", "deck.report", "deck.sales", "deck.training"]);
    expect(deckPurposes.map((purpose) => text(record(purpose["axes"])["request_intent"]))).toEqual(["company", "pitch", "report", "sales", "training"]);
    for (const purpose of deckPurposes) {
      expect(text(record(purpose["axes"])["project_type"])).toBe("slide_deck");
      expect(text(purpose["confidence"])).toBe("medium");
      expect(texts(purpose["guidance"]).length).toBeGreaterThanOrEqual(3);
      expect(text(purpose["limitations"]).length).toBeGreaterThan(0);
    }
  });
});
