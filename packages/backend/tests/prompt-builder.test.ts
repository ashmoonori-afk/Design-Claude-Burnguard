import { describe, expect, test } from "bun:test";
import { buildPrompt } from "../src/harness/prompt-builder";

type BuildContext = Parameters<typeof buildPrompt>[0];

function makeContext(
  overrides: Partial<BuildContext["project"]> = {},
  extra: Partial<Omit<BuildContext, "project">> = {},
): BuildContext {
  return {
    project: {
      project_id: "p1",
      project_name: "Test project",
      project_type: "prototype",
      entrypoint: "index.html",
      project_dir: "/tmp/p1",
      options_json: null,
      ...overrides,
    },
    files: [],
    designSystem: null,
    openComments: [],
    ...extra,
  } as BuildContext;
}

describe("buildPrompt", () => {
  test("emits project + delivery + request sections for prototype", async () => {
    const prompt = await buildPrompt(makeContext(), {
      type: "user.message",
      text: "make it red",
    });
    expect(prompt).toContain("# BurnGuard Design project session");
    expect(prompt).toContain("## Project");
    expect(prompt).toContain("- type: prototype");
    expect(prompt).toContain("## Delivery");
    expect(prompt).toContain("## Request");
    expect(prompt).toContain("make it red");
    expect(prompt).not.toContain("## Slide deck skill");
    expect(prompt).not.toContain("use_speaker_notes");
  });

  test("injects slide deck skill for slide_deck projects", async () => {
    const prompt = await buildPrompt(
      makeContext({
        project_type: "slide_deck",
        entrypoint: "deck.html",
        options_json: JSON.stringify({ use_speaker_notes: true }),
      }),
      { type: "user.message", text: "noop" },
    );
    expect(prompt).toContain("## Slide deck skill");
    expect(prompt).toContain("- use_speaker_notes: true");
  });

  test("serializes open comments with slide scope for deck pins", async () => {
    const prompt = await buildPrompt(
      makeContext(
        { project_type: "slide_deck", entrypoint: "deck.html" },
        {
          openComments: [
            {
              id: "c1",
              rel_path: "deck.html",
              node_selector: '[data-bg-node-id="hero"]',
              x_pct: 25,
              y_pct: 30,
              body: "Tighten hero copy",
              slide_index: 2,
            },
            {
              id: "c2",
              rel_path: "deck.html",
              node_selector: "body",
              x_pct: 10,
              y_pct: 90,
              body: "  ",
              slide_index: null,
            },
          ],
        },
      ),
      { type: "user.message", text: "address comments" },
    );
    expect(prompt).toContain("## Open comments");
    // slide_index=2 becomes user-facing slide 3.
    expect(prompt).toContain("slide=3 (slide_index=2)");
    expect(prompt).toContain("Tighten hero copy");
    expect(prompt).toContain("file-wide");
    expect(prompt).toContain("(no note)");
  });

  test("omits attachments section when there are none", async () => {
    const prompt = await buildPrompt(makeContext(), {
      type: "user.message",
      text: "hi",
    });
    expect(prompt).not.toContain("## Attachments");
  });

  test("lists attachments verbatim", async () => {
    const prompt = await buildPrompt(makeContext(), {
      type: "user.message",
      text: "see files",
      attachments: ["/tmp/a.png", "/tmp/b.png"],
    });
    expect(prompt).toContain("## Attachments");
    expect(prompt).toContain("- /tmp/a.png");
    expect(prompt).toContain("- /tmp/b.png");
  });
});
