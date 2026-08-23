import { describe, expect, test } from "bun:test";
import { parseExtractionDomain } from "@bg/shared/extraction-domain";

describe("extraction domain runtime contract", () => {
  test("Given every independent domain When parsed Then each required value is accepted", () => {
    // Given
    const inputs: readonly unknown[] = [
      "token", "typography", "spacing", "border", "layout", "component", "asset",
      "breakpoint", "responsiveness", "animation", "interaction", "accessibility", "state",
    ];

    // When
    const domains = inputs.map(parseExtractionDomain);

    // Then
    expect(domains).toEqual(inputs);
  });

  test.each(["breakpoint-responsiveness", "interaction-accessibility-state"])(
    "Given obsolete combined domain %s When parsed Then typed contract rejection is returned",
    (input) => {
      // Given / When
      const parse = (): void => { parseExtractionDomain(input); };

      // Then
      expect(parse).toThrow();
    },
  );

  test("Given an unknown domain When parsed Then typed contract rejection is returned", () => {
    // Given
    const input: unknown = "outline";

    // When
    const parse = (): void => { parseExtractionDomain(input); };

    // Then
    expect(parse).toThrow();
  });
});
