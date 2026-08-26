import { describe, expect, test } from "bun:test";
import { parseDesignBriefV1, type CreateProjectRequest } from "@bg/shared";
import {
  buildCreateProjectRequest,
  type BuildResult,
  type ProjectDraft,
} from "../src/lib/project-creation";

function draft(overrides: Partial<ProjectDraft> = {}): ProjectDraft {
  return {
    name: "SNS 그래픽",
    type: "graphic",
    backendId: "claude-code",
    designSystemId: null,
    audience: "SNS 방문자",
    objective: "행사 참여를 안내한다",
    contentSource: "none",
    visualMood: "friendly",
    density: "balanced",
    outputSize: "responsive",
    graphicWidth: 1080,
    graphicHeight: 1080,
    useSpeakerNotes: false,
    copyAsIs: false,
    ...overrides,
  };
}

function expectRequest(result: BuildResult): CreateProjectRequest {
  if (!result.ok) throw new TypeError(`expected request: ${result.problem}`);
  return result.request;
}

describe("graphic project creation", () => {
  test.each([
    [1080, 1080],
    [1200, 628],
    [1080, 1920],
    [1440, 900],
  ])("builds exact default preset and custom graphic dimensions", (width, height) => {
    const request = expectRequest(buildCreateProjectRequest(draft({
      graphicWidth: width,
      graphicHeight: height,
    }), []));

    expect(request.options?.graphic_canvas).toEqual({
      schema_version: 1,
      width,
      height,
    });
    expect(parseDesignBriefV1(request.options?.design_brief)).toMatchObject({
      output_type: "graphic",
      output_size: "custom",
    });
  });

  test.each([
    [319, 1080, "graphic_width_invalid"],
    [4097, 1080, "graphic_width_invalid"],
    [1080.5, 1080, "graphic_width_invalid"],
    [1080, 239, "graphic_height_invalid"],
    [1080, 4097, "graphic_height_invalid"],
    [4000, 4001, "graphic_pixel_limit"],
  ] as const)("rejects invalid graphic dimensions before create", (width, height, problem) => {
    expect(buildCreateProjectRequest(draft({
      graphicWidth: width,
      graphicHeight: height,
    }), [])).toEqual({ ok: false, problem });
  });

  test("keeps non-graphic request options unchanged", () => {
    const request = expectRequest(buildCreateProjectRequest(draft({
      type: "prototype",
      graphicWidth: 1200,
      graphicHeight: 628,
    }), []));
    expect(request.options?.graphic_canvas).toBeUndefined();
    expect(parseDesignBriefV1(request.options?.design_brief).output_size).toBe("responsive");
  });
});
