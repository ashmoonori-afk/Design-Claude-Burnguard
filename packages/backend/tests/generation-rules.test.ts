import { describe, expect, test } from "bun:test";
import { buildResearchPromptContext } from "../src/services/research-purpose";
import { resolveResearchRuleLayers } from "../src/services/research-selection";

describe("generation research rules acceptance", () => {
  test("Given a dashboard request When research context is built Then sourced common and purpose rules precede overrides", () => {
    const context = buildResearchPromptContext({
      projectType: "prototype",
      request: "Create an analytics dashboard",
      hasCapturedFiles: true,
    });

    expect(context.routing).toMatchObject({
      purpose: "prototype.dashboard",
      creation_mode: "existing",
    });
    expect(context.precedence).toEqual([
      "research",
      "design_system",
      "project",
      "user_request",
    ]);
    expect(context.rules.some((rule) => rule.id.startsWith("CR-"))).toBe(true);
    expect(
      context.rules.some((rule) =>
        rule.id.startsWith("prototype.dashboard:"),
      ),
    ).toBe(true);
    expect(
      context.rules.every(
        (rule) =>
          rule.source_ids.length > 0 &&
          rule.rationale.length > 0 &&
          rule.confidence.length > 0,
      ),
    ).toBe(true);
  });

  test("Given conflicting research and user rules When layers resolve Then later user authority wins with an explanation", () => {
    const resolved = resolveResearchRuleLayers([
      {
        id: "research",
        rules: [
          {
            id: "research-layout",
            axis: "layout",
            directive: "Use the research layout.",
            rationale: "Source evidence.",
            confidence: 0.7,
            source_ids: ["source-research"],
          },
        ],
      },
      {
        id: "user_request",
        rules: [
          {
            id: "user-layout",
            axis: "layout",
            directive: "Use the requested layout.",
            rationale: "Explicit user direction.",
            confidence: 1,
            source_ids: ["source-user"],
          },
        ],
      },
    ]);

    expect(resolved.rules).toEqual([
      expect.objectContaining({
        id: "user-layout",
        layer_id: "user_request",
      }),
    ]);
    expect(resolved.conflicts).toEqual([
      {
        axis: "layout",
        winner_id: "user-layout",
        overridden_rule_ids: ["research-layout"],
      },
    ]);
  });
});
