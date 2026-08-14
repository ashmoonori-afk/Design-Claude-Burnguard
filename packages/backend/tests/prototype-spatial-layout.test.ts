import { describe, expect, test } from "bun:test";
import { buildPrompt } from "../src/harness/prompt-builder";
import { PROTOTYPE_SKILL_MD } from "../src/harness/skills/prototype-skill";

const MAX_SKILL_CHARS = 4000;
const SPATIAL_SENTINELS = ["scroll-owner", "wrap-first", "load-bearing"];

describe("prototype spatial layout vocabulary", () => {
  test("ships each spatial rule group in the built prototype prompt", async () => {
    const prompt = await buildPrompt(
      {
        project: {
          project_id: "spatial-layout-test",
          project_name: "Spatial layout test",
          project_type: "prototype",
          entrypoint: "index.html",
          project_dir: "/missing/spatial-layout-test",
          options_json: null,
        },
        files: [],
        attachments: [],
        designSystem: null,
        openComments: [],
      },
      { type: "user.message", text: "Build a responsive page" },
    );

    for (const sentinel of SPATIAL_SENTINELS) {
      expect(prompt).toContain(sentinel);
    }
  });

  test("stays within the injected skill budget", () => {
    expect(PROTOTYPE_SKILL_MD.length).toBeLessThanOrEqual(MAX_SKILL_CHARS);
  });
});
