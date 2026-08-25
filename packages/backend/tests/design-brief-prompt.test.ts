import { beforeAll, describe, expect, test } from "bun:test";
import { getSqlite } from "../src/db/sqlite-client";
import { buildPrompt } from "../src/harness/prompt-builder";
import { ensureLearningSchema } from "./learning-fixture";

type BuildContext = Parameters<typeof buildPrompt>[0];

beforeAll(() => ensureLearningSchema(getSqlite()));

function context(optionsJson: string | null): BuildContext {
  return {
    project: {
      project_id: "brief-project",
      project_name: "분기 영업 보고서",
      project_type: "slide_deck",
      project_dir: "/tmp/brief-project",
      entrypoint: "deck.html",
      options_json: optionsJson,
      current_revision: 0,
      current_digest: null,
    },
    designSystem: null,
    files: [],
    attachments: [],
    openComments: [],
  };
}

function taggedJson(prompt: string, tag: string): Readonly<Record<string, unknown>> {
  const match = prompt.match(new RegExp(`<${tag}>\\n([^\\n]+)\\n</${tag}>`));
  expect(match).not.toBeNull();
  const parsed: unknown = JSON.parse(match?.[1] ?? "{}");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected ${tag} to contain an object`);
  }
  return parsed;
}

describe("design brief prompt context", () => {
  test("Given a versioned project brief When the prompt is built Then machine fields are injected", async () => {
    const designBrief = {
      schema_version: 1,
      output_type: "slide_deck",
      audience: "영업팀 리더",
      objective: "분기 성과와 다음 행동을 공유한다",
      content_source: "attached",
      locale: "ko-KR",
      brand_mode: "selected_design_system",
      visual_mood: "formal",
      density: "balanced",
      output_size: "widescreen-16x9",
    } as const;
    const prompt = await buildPrompt(
      context(JSON.stringify({ design_brief: designBrief })),
      { type: "user.message", text: "이 자료로 영업 보고서를 만들어줘" },
    );

    expect(taggedJson(prompt, "burnguard-design-brief-v1")).toEqual(
      designBrief,
    );
  });

  test("Given malformed project options When the prompt is built Then no partial brief leaks", async () => {
    const prompt = await buildPrompt(
      context(
        JSON.stringify({
          design_brief: {
            schema_version: 1,
            output_type: "slide_deck",
            audience: "",
          },
        }),
      ),
      { type: "user.message", text: "자료를 만들어줘" },
    );

    expect(prompt).not.toMatch(
      /<burnguard-design-brief-v1>\n[^\n]+\n<\/burnguard-design-brief-v1>/u,
    );
  });
});
