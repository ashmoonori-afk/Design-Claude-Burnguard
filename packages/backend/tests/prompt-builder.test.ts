import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { buildPrompt } from "../src/harness/prompt-builder";
import {
  attachmentExtractedTextPath,
  attachmentSummaryPath,
} from "../src/services/attachments";

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
    attachments: [],
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

  test("injects prototype skill for prototype projects", async () => {
    const prompt = await buildPrompt(makeContext(), {
      type: "user.message",
      text: "build me a landing page",
    });
    expect(prompt).toContain("## Prototype skill");
    expect(prompt).toContain("# Prototype authoring conventions");
    expect(prompt).toContain("data-section");
    expect(prompt).toContain("hero-centered");
    expect(prompt).toContain("data-bg-node-id");
    // Skills must not cross-contaminate.
    expect(prompt).not.toContain("## Slide deck skill");
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

  test("inlines compact summaries for pptx/pdf attachments and points Read to extracted text", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "bg-prompt-attachment-"));
    try {
      const filePath = path.join(tempDir, "deck.pptx");
      await writeFile(filePath, "");
      await writeFile(
        attachmentSummaryPath(filePath),
        JSON.stringify({
          kind: "pptx",
          brand_name: "Quarterly Review",
          page_count: 3,
          fonts: ["Inter"],
          colors: ["#112233", "#445566"],
          font_sizes: ["24pt"],
          font_weights: ["700"],
          spacing_values: [],
          radii: [],
          shadows: [],
          notes: ["Token-optimized upload summary generated via Python extractor."],
          headings: ["Quarterly Review"],
          bodies: ["Revenue expanded 22% year over year."],
          misc_lines: ["Get started", "Revenue expanded 22% year over year."],
          pages: [
            {
              index: 1,
              title: "Quarterly Review",
              summary: "Revenue expanded 22% year over year.",
              text_excerpt:
                "Quarterly Review\nRevenue expanded 22% year over year.",
            },
          ],
        }),
        "utf8",
      );
      await writeFile(
        attachmentExtractedTextPath(filePath),
        "# Extracted attachment text",
        "utf8",
      );

      const prompt = await buildPrompt(
        makeContext({}, {
          attachments: [
            {
              id: "a1",
              session_id: "s1",
              turn_id: null,
              file_path: filePath,
              mime_type:
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              original_name: "deck.pptx",
              size_bytes: 1024,
              sha256: null,
              created_at: Date.now(),
            },
          ],
        }),
        {
          type: "user.message",
          text: "Use this attachment as source material.",
          attachments: [filePath],
        },
      );

      expect(prompt).toContain(
        `source_path: ${filePath} (binary attachment; do not Read/Glob/Bash this file directly)`,
      );
      expect(prompt).toContain(
        `extracted_text_path: ${attachmentExtractedTextPath(filePath)} (safe text version for Read)`,
      );
      expect(prompt).toContain(
        "summary: PPTX | 3 page(s) | brand=Quarterly Review",
      );
      expect(prompt).toContain("colors: #112233, #445566");
      expect(prompt).toContain(
        "page 1: Quarterly Review -> Revenue expanded 22% year over year.",
      );
      expect(prompt).toContain("use this compact summary first for planning");
      expect(prompt).toContain(
        "if an extracted_text_path is listed and you need slide/page wording, Read that file instead of the original binary file.",
      );
      expect(prompt).toContain(
        "do not use Read, Glob, or Bash against the original .pptx/.pdf attachment path.",
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
