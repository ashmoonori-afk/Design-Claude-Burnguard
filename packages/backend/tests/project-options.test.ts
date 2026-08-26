import { describe, expect, test } from "bun:test";
import { UpgradeContractError } from "@bg/shared";
import {
  parseProjectOptions,
  parseStoredProjectOptions,
} from "../src/services/project-options";

const validBrief = {
  schema_version: 1,
  output_type: "slide_deck",
  audience: "영업팀",
  objective: "성과와 다음 행동을 공유한다",
  content_source: "attached",
  locale: "ko-KR",
  brand_mode: "selected_design_system",
  visual_mood: "formal",
  density: "balanced",
  output_size: "widescreen-16x9",
} as const;

describe("project options", () => {
  test("Given valid options When parsed Then the canonical brief is preserved", () => {
    expect(
      parseProjectOptions({
        use_speaker_notes: true,
        copy_as_is: false,
        design_brief: validBrief,
      }),
    ).toEqual({
      use_speaker_notes: true,
      copy_as_is: false,
      design_brief: validBrief,
      graphic_canvas: null,
    });
  });

  test("Given graphic dimensions When parsed Then the canonical canvas is preserved", () => {
    expect(
      parseProjectOptions({
        graphic_canvas: { schema_version: 1, width: 1200, height: 628 },
      }),
    ).toMatchObject({
      graphic_canvas: { schema_version: 1, width: 1200, height: 628 },
    });
  });

  test("Given invalid option fields When parsed Then typed boundary errors identify them", () => {
    expect(() =>
      parseProjectOptions({ use_speaker_notes: "yes" }),
    ).toThrow(UpgradeContractError);
    expect(() =>
      parseProjectOptions({
        design_brief: { ...validBrief, visual_mood: "cinematic" },
      }),
    ).toThrow(UpgradeContractError);
  });

  test("Given malformed stored JSON When parsed Then safe defaults are returned", () => {
    expect(parseStoredProjectOptions("{")).toEqual({
      use_speaker_notes: false,
      copy_as_is: false,
      design_brief: null,
      graphic_canvas: null,
    });
  });
});
