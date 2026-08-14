import { describe, expect, test } from "bun:test";
import { buildPrompt } from "../src/harness/prompt-builder";
import { DIAGRAM_SKILL_MD } from "../src/harness/skills/diagram-skill";

const MAX_SKILL_CHARS = 4000;
type BuildContext = Parameters<typeof buildPrompt>[0];

function makeContext(): BuildContext {
  return {
    project: {
      project_id: "p1",
      project_name: "Diagram project",
      project_type: "prototype",
      entrypoint: "index.html",
      project_dir: "/tmp/p1",
      options_json: null,
    },
    files: [],
    attachments: [],
    designSystem: null,
    openComments: [],
  } as BuildContext;
}

describe("diagram skill", () => {
  test("exports the router and complexity contracts within the skill budget", () => {
    expect(DIAGRAM_SKILL_MD.length).toBeLessThanOrEqual(MAX_SKILL_CHARS);
    expect(DIAGRAM_SKILL_MD).toContain("DIAGRAM_TYPE_ROUTER");
    expect(DIAGRAM_SKILL_MD).toContain("DIAGRAM_COMPLEXITY_BUDGET");

    for (const diagramType of [
      "flowchart",
      "sequence",
      "architecture",
      "timeline",
      "comparison",
      "hierarchy",
    ]) {
      expect(DIAGRAM_SKILL_MD).toContain(diagramType);
    }
  });

  test("selects the diagram skill for a diagram-shaped request", async () => {
    const prompt = await buildPrompt(makeContext(), {
      type: "user.message",
      text: "Create an architecture diagram for the service topology",
    });

    expect(prompt).toContain("## Diagram skill");
    expect(prompt).toContain("DIAGRAM_TYPE_ROUTER");
    expect(prompt).toContain("DIAGRAM_COMPLEXITY_BUDGET");
  });

  test("does not spend prompt budget on an unrelated request", async () => {
    const prompt = await buildPrompt(makeContext(), {
      type: "user.message",
      text: "Polish the landing page hero copy",
    });

    expect(prompt).not.toContain("## Diagram skill");
    expect(prompt).not.toContain("DIAGRAM_TYPE_ROUTER");
  });
});
