import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  EXTRACTION_DOMAINS,
  buildExtractionProvenance,
  discoveriesFromAnalysis,
  normalizeProvenanceKey,
  selectCanonicalToken,
  type ExtractionDiscovery,
} from "../src/services/extraction-provenance";
import { analyzeLocalTree } from "../src/services/extraction-local-tree";

const observed = (
  key: string,
  value: string | null,
  sourceLocator: string,
  confidence = 1,
): ExtractionDiscovery => ({
  domain: "token",
  key,
  value,
  sourceLocator,
  confidence,
  state: value === null ? "unknown" : "observed",
  unknownReason: value === null ? "unsupported_css" : undefined,
  lineage: ["fixture"],
});

describe("deterministic extraction provenance", () => {
  test("Given Unicode and whitespace When key normalization runs Then identity is stable", () => {
    // Given / When / Then
    expect(normalizeProvenanceKey("  Brand   Primary  ")).toBe("brand-primary");
  });
  test("Given reversed discovery order When provenance is built Then content and digest are byte-identical", () => {
    // Given
    const discoveries = [
      observed("brand-primary", "#112233", "styles/a.css:2"),
      observed("font-body", "Inter", "styles/b.css:4"),
    ];

    // When
    const forward = buildExtractionProvenance(discoveries, 10);
    const reversed = buildExtractionProvenance([...discoveries].reverse(), 20);

    // Then
    expect(reversed.content).toEqual(forward.content);
    expect(reversed.content_digest).toBe(forward.content_digest);
  });

  test("Given byte-identical input When extraction repeats Then timestamp stays outside stable content", () => {
    // Given
    const discoveries = [observed("primary", "#abcdef", "tokens.css:1")];

    // When
    const first = buildExtractionProvenance(discoveries, 100);
    const second = buildExtractionProvenance(discoveries, 200);

    // Then
    expect(second.generated_at).not.toBe(first.generated_at);
    expect(JSON.stringify(second.content)).toBe(JSON.stringify(first.content));
    expect(second.content_digest).toBe(first.content_digest);
  });

  test("Given a prefixed primary token in real CSS When production analysis selects canonical primary Then observed evidence wins over fallback", async () => {
    // Given
    const root = await mkdtemp(path.join(tmpdir(), "bg-css-primary-"));
    try {
      await writeFile(path.join(root, "tokens.css"), ":root { --figma-brand-primary: #123456; }\n");
      const analysis = await analyzeLocalTree(root, "Fixture", new AbortController().signal);

      // When
      const selected = selectCanonicalToken(discoveriesFromAnalysis(analysis), ["primary"], "#0057b8");

      // Then
      expect(selected).toMatchObject({ value: "#123456", state: "observed" });
      expect(selected.candidates[0]?.source_locator).toBe("tokens.css:1:9");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("Given tied conflicting tokens When provenance is built Then candidates and conflicts are explicit", () => {
    // Given
    const discoveries = [
      observed("primary", "#111111", "a.css:1", 0.9),
      observed("primary", "#222222", "b.css:1", 0.9),
    ];

    // When
    const sidecar = buildExtractionProvenance(discoveries, 1);
    const primary = sidecar.content.entries.find((entry) => entry.key === "primary");

    // Then
    expect(primary?.state).toBe("conflicted");
    expect(primary?.conflicts).toEqual(["#111111", "#222222"]);
    expect(primary?.candidates).toHaveLength(2);
  });

  test("Given real CSS files with conflicting duplicate tokens When production analysis runs Then every candidate and locator survives deterministically", async () => {
    // Given
    const root = await mkdtemp(path.join(tmpdir(), "bg-css-provenance-"));
    const controller = new AbortController();
    try {
      await mkdir(path.join(root, "styles"));
      await writeFile(path.join(root, "styles", "a.css"), ":root { --brand-primary: #111111; --brand-primary: #111111; }\n");
      await writeFile(path.join(root, "styles", "b.css"), ":root { --brand-primary: #222222; }\n.card { border: 1px solid #111111; border-radius: 8px; }\n");

      // When
      const analysis = await analyzeLocalTree(root, "Fixture", controller.signal);
      const forward = buildExtractionProvenance(discoveriesFromAnalysis(analysis), 1);
      const reversed = buildExtractionProvenance([...discoveriesFromAnalysis(analysis)].reverse(), 2);
      const primary = forward.content.entries.find((entry) => entry.key === "brand-primary");
      const border = forward.content.entries.find((entry) => entry.domain === "border" && entry.state === "observed");

      // Then
      expect(primary?.state).toBe("conflicted");
      expect(primary?.conflicts).toEqual(["#111111", "#222222"]);
      expect(primary?.candidates).toHaveLength(3);
      expect(primary?.source_locators).toEqual([
        "styles/a.css:1:35",
        "styles/a.css:1:9",
        "styles/b.css:1:9",
      ]);
      expect(border?.candidates.map((candidate) => candidate.value)).toContain("1px solid #111111");
      expect(reversed.content_digest).toBe(forward.content_digest);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("Given malformed and unsupported real CSS When production analysis runs Then typed unknown evidence has exact locators", async () => {
    // Given
    const root = await mkdtemp(path.join(tmpdir(), "bg-css-errors-"));
    const controller = new AbortController();
    try {
      await writeFile(path.join(root, "malformed.css"), ":root { --primary: #fff;\n");
      await writeFile(path.join(root, "unsupported.css"), ".x { border-image: url(https://example.test/a.png) 30; }\n");

      // When
      const analysis = await analyzeLocalTree(root, "Fixture", controller.signal);
      const sidecar = buildExtractionProvenance(discoveriesFromAnalysis(analysis), 1);
      const malformed = sidecar.content.entries.find((entry) => entry.unknown_reason === "malformed_css");
      const unsupported = sidecar.content.entries.find((entry) => entry.unknown_reason === "unsupported_css_value");

      // Then
      expect(malformed?.source_locators).toEqual(["malformed.css:1:1"]);
      expect(unsupported?.source_locators).toEqual(["unsupported.css:1:6"]);
      expect(malformed?.state).toBe("unknown");
      expect(unsupported?.state).toBe("unknown");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("Given duplicate tokens When provenance is built Then normalized keys are unique", () => {
    // Given
    const discoveries = [
      observed(" Brand Primary ", "#111111", "a.css:1"),
      observed("brand   primary", "#111111", "a.css:1"),
    ];

    // When
    const sidecar = buildExtractionProvenance(discoveries, 1);
    const entries = sidecar.content.entries.filter((entry) => entry.key === "brand-primary");

    // Then
    expect(entries).toHaveLength(1);
    expect(entries[0]?.source_locators).toEqual(["a.css:1"]);
  });

  test("Given malformed or unsupported CSS When provenance is built Then unknown lineage is explicit", () => {
    // Given
    const discoveries = [observed("unsupported-grid", null, "styles.css:9", 0)];

    // When
    const sidecar = buildExtractionProvenance(discoveries, 1);
    const entry = sidecar.content.entries.find((item) => item.key === "unsupported-grid");

    // Then
    expect(entry).toMatchObject({ state: "unknown", confidence: 0, unknown_reason: "unsupported_css", lineage: ["fixture"] });
  });

  test("Given an asset reference When provenance is built Then its stable locator and lineage are retained", () => {
    // Given
    const discoveries = discoveriesFromAnalysis({
      cssVars: new Map([["primary", "#123456"]]), fontFamilies: ["Inter"], colors: ["#123456"], fontSizes: ["16px"], fontWeights: ["700"],
      cssDeclarations: [], spacingValues: ["8px"], radii: ["4px"], shadows: ["none"], borders: [], assets: ["assets/logos/brand.svg"], components: { buttons: ["Save"] },
    });

    // When
    const sidecar = buildExtractionProvenance(discoveries, 1);
    const asset = sidecar.content.entries.find((entry) => entry.domain === "asset");

    // Then
    expect(asset).toMatchObject({ key: "assets/logos/brand.svg", state: "observed", source_locators: ["asset:assets/logos/brand.svg"], lineage: ["source-extraction"] });
  });

  test("Given low-confidence inferred evidence When provenance is built Then confidence and lineage remain explicit", () => {
    // Given
    const discovery: ExtractionDiscovery = { domain: "layout", key: "grid", value: "12 columns", sourceLocator: "inference:grid", confidence: 0.3, state: "inferred", lineage: ["heuristic-v1"] };

    // When
    const sidecar = buildExtractionProvenance([discovery], 1);
    const grid = sidecar.content.entries.find((entry) => entry.key === "grid");

    // Then
    expect(grid).toMatchObject({ state: "inferred", confidence: 0.3, lineage: ["heuristic-v1"] });
  });

  test("Given validated re-extraction lineage When provenance is built Then parent identity remains typed", () => {
    // Given
    const lineage = { operation: "re-extraction", parent_receipt_id: "receipt-parent", parent_content_digest: "a".repeat(64), reason: "refresh", metadata: { actor: "local" } } as const;

    // When
    const sidecar = buildExtractionProvenance([], 1, lineage);

    // Then
    expect(sidecar.lineage).toEqual(lineage);
  });

  test("Given all extraction domains When provenance is built Then every required domain has stable evidence", () => {
    // Given
    const discoveries = [observed("primary", "#000000", "tokens.css:1")];

    // When
    const sidecar = buildExtractionProvenance(discoveries, 1);
    const domains = [...new Set(sidecar.content.entries.map((entry) => entry.domain))];

    // Then
    expect(domains.sort()).toEqual([...EXTRACTION_DOMAINS].sort());
    expect(sidecar.content.entries.filter((entry) => entry.state === "unknown").every((entry) => entry.unknown_reason !== null)).toBe(true);
  });
});
