import { beforeAll, describe, expect, test } from "bun:test";
import { getSqlite } from "../src/db/sqlite-client";
import { buildPrompt } from "../src/harness/prompt-builder";
import {
  hasReferenceLayoutIntent,
  parseReferenceLayoutCanvas,
} from "../src/services/reference-layout-values";
import { ensureLearningSchema } from "./learning-fixture";

type BuildContext = Parameters<typeof buildPrompt>[0];
type Attachment = BuildContext["attachments"][number];
type JsonRecord = Readonly<Record<string, unknown>>;

beforeAll(() => ensureLearningSchema(getSqlite()));

function attachment(
  filePath: string,
  mimeType: string,
  originalName: string,
): Attachment {
  return {
    id: originalName,
    session_id: "layout-session",
    turn_id: null,
    file_path: filePath,
    mime_type: mimeType,
    original_name: originalName,
    size_bytes: 1024,
    sha256: "a".repeat(64),
    created_at: 1,
  };
}

function context(attachments: readonly Attachment[]): BuildContext {
  return {
    project: {
      project_id: "layout-project",
      project_name: "Reference layout",
      project_type: "other",
      project_dir: "/tmp/layout-project",
      entrypoint: "index.html",
      options_json: null,
      current_revision: 0,
      current_digest: null,
    },
    designSystem: null,
    files: [],
    attachments,
    openComments: [],
  };
}

function taggedJson(prompt: string): JsonRecord {
  const match = prompt.match(
    /<burnguard-reference-layout-v1>\n([^\n]+)\n<\/burnguard-reference-layout-v1>/u,
  );
  expect(match).not.toBeNull();
  const parsed: unknown = JSON.parse(match?.[1] ?? "{}");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected reference-layout context object");
  }
  return parsed;
}

function nested(record: JsonRecord, key: string): JsonRecord {
  const value = record[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${key} object`);
  }
  return value;
}

describe("reference layout prompt context", () => {
  test("Given a Korean drawing and metric sheet When built Then geometry and unknown scale are explicit", async () => {
    const filePath = "/tmp/floor-plan.svg";
    const prompt = await buildPrompt(
      context([
        attachment(filePath, "image/svg+xml", "floor-plan.svg"),
        attachment("/tmp/unselected.png", "image/png", "unselected.png"),
      ]),
      {
        type: "user.message",
        text: "이 도면을 A3 가로 420×297mm, 300 DPI, 재단 여백 3mm, 안전 여백 12mm로 배치해줘. 축척은 미정이야.",
        attachments: [filePath],
      },
    );
    const block = taggedJson(prompt);
    const intent = nested(block, "intent");
    const reference = nested(block, "reference");
    const canvas = nested(block, "canvas");
    const scale = nested(canvas, "scale");
    const bleed = nested(canvas, "bleed");
    const safeMargin = nested(canvas, "safe_margin");
    const geometry = nested(block, "geometry_contract");
    const exporters = nested(block, "export_constraints");

    expect(block["schema_version"]).toBe(1);
    expect(block["layout_spec_path"]).toBe("layout-spec.json");
    expect(intent).toEqual({
      detected: true,
      source: "request_and_attachment",
      language: "ko",
    });
    expect(reference).toEqual({
      attachment_path: filePath,
      original_name: "floor-plan.svg",
      mime_type: "image/svg+xml",
      role: "immutable_underlay",
      evidence_boundary: "hard_geometry",
      editable: false,
    });
    expect(canvas["preset"]).toBe("a3");
    expect(canvas["width"]).toBe(420);
    expect(canvas["height"]).toBe(297);
    expect(canvas["unit"]).toBe("mm");
    expect(canvas["orientation"]).toBe("landscape");
    expect(canvas["aspect_ratio"]).toEqual({
      width: 420,
      height: 297,
      source: "dimensions",
    });
    expect(canvas["dpi"]).toBe(300);
    expect(scale).toEqual({ status: "unknown", value: null });
    expect(bleed).toEqual({ status: "known", value: 3, unit: "mm" });
    expect(safeMargin).toEqual({ status: "known", value: 12, unit: "mm" });
    expect(geometry).toEqual({
      origin: "top_left",
      x_axis: "right",
      y_axis: "down",
      anchor_space: "normalized_0_1",
      stable_anchors_required: true,
      preserve_aspect_ratio: true,
    });
    expect(nested(exporters, "pdf")).toEqual({
      supported: false,
      limitation: "preset_only",
      coerce_to_a4: false,
      on_unsupported: "report_and_preserve_spec",
    });
    expect(nested(exporters, "pptx")["supported"]).toBe(false);
    expect(nested(exporters, "png")["supported"]).toBe(true);
    expect(JSON.stringify(block)).not.toContain("unselected.png");

    const repeated = await buildPrompt(
      context([
        attachment(filePath, "image/svg+xml", "floor-plan.svg"),
        attachment("/tmp/unselected.png", "image/png", "unselected.png"),
      ]),
      {
        type: "user.message",
        text: "이 도면을 A3 가로 420×297mm, 300 DPI, 재단 여백 3mm, 안전 여백 12mm로 배치해줘. 축척은 미정이야.",
        attachments: [filePath],
      },
    );
    expect(taggedJson(repeated)).toEqual(block);
  });

  test("Given explicit imperial dimensions When built Then scale and raster mapping remain deterministic", async () => {
    const filePath = "/tmp/floor-plan.pdf";
    const prompt = await buildPrompt(
      context([attachment(filePath, "application/pdf", "floor-plan.pdf")]),
      {
        type: "user.message",
        text: "Use this floor plan as an immutable underlay on a 24x36in portrait sheet at 150 DPI. Bleed unknown, safe margin 0.5in, scale 1:100.",
        attachments: [filePath],
      },
    );
    const block = taggedJson(prompt);
    const canvas = nested(block, "canvas");

    expect(canvas["preset"]).toBe("custom");
    expect(canvas["width"]).toBe(24);
    expect(canvas["height"]).toBe(36);
    expect(canvas["unit"]).toBe("in");
    expect(canvas["orientation"]).toBe("portrait");
    expect(canvas["aspect_ratio"]).toEqual({
      width: 24,
      height: 36,
      source: "dimensions",
    });
    expect(nested(canvas, "scale")).toEqual({
      status: "known",
      value: "1:100",
    });
    expect(nested(canvas, "bleed")).toEqual({
      status: "unknown",
      value: null,
      unit: null,
    });
    expect(nested(canvas, "safe_margin")).toEqual({
      status: "known",
      value: 0.5,
      unit: "in",
    });
    expect(nested(canvas, "raster_target_px")).toEqual({
      status: "known",
      width: 3600,
      height: 5400,
    });
  });

  test("Given unrelated or unselected attachments When built Then no reference context is emitted", async () => {
    const prompt = await buildPrompt(
      context([
        attachment("/tmp/notes.txt", "text/plain", "notes.txt"),
        attachment("/tmp/reference.png", "image/png", "reference.png"),
      ]),
      {
        type: "user.message",
        text: "Summarize the attached notes",
        attachments: ["/tmp/notes.txt"],
      },
    );

    expect(prompt).not.toMatch(
      /<burnguard-reference-layout-v1>\n[^\n]+\n<\/burnguard-reference-layout-v1>/u,
    );
  });

  test("Given an ordinary selected logo When requested as content Then no layout contract is emitted", async () => {
    const filePath = "/tmp/logo.png";
    const prompt = await buildPrompt(
      context([attachment(filePath, "image/png", "logo.png")]),
      {
        type: "user.message",
        text: "Add our logo to the header",
        attachments: [filePath],
      },
    );

    expect(prompt).not.toMatch(
      /<burnguard-reference-layout-v1>\n[^\n]+\n<\/burnguard-reference-layout-v1>/u,
    );
  });

  test("Given ordinary English wording When canvas values are parsed Then no preset is inferred", () => {
    expect(
      parseReferenceLayoutCanvas(
        "Use this cover letter as a style reference with a standard report structure",
      ).preset,
    ).toBeNull();
    expect(
      parseReferenceLayoutCanvas(
        "Consider drawing attention to the primary call to action",
      ).preset,
    ).toBeNull();
    expect(
      hasReferenceLayoutIntent(
        "Consider drawing attention to the primary call to action",
      ),
    ).toBe(false);
  });

  test("Given a selected drawing filename When request text is generic Then the layout contract still activates", async () => {
    const filePath = "/tmp/floor-plan.svg";
    const prompt = await buildPrompt(
      context([attachment(filePath, "image/svg+xml", "floor-plan.svg")]),
      {
        type: "user.message",
        text: "Use the attached file",
        attachments: [filePath],
      },
    );

    const block = taggedJson(prompt);
    expect(nested(block, "intent")["source"]).toBe("attachment");
    expect(nested(block, "reference")["role"]).toBe("immutable_underlay");
  });
});
