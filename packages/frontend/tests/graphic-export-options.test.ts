import { describe, expect, test } from "bun:test";
import {
  buildExportMenuModel,
  buildExportRetryRequest,
} from "../src/components/export/export-options";

describe("graphic export menu model", () => {
  test("Given persisted graphic dimensions When modeled Then only exact DPR1 PNG is exposed", () => {
    expect(buildExportMenuModel("graphic", JSON.stringify({
      use_speaker_notes: false,
      copy_as_is: false,
      design_brief: null,
      graphic_canvas: { schema_version: 1, width: 1200, height: 628 },
    }))).toEqual({
      ok: true,
      options: [{
        key: "graphic-png",
        format: "png",
        options: { png_width: 1200, png_height: 628, png_dpr: 1 },
        label: "PNG · 1200×628",
      }],
    });
  });

  test.each([null, "{", JSON.stringify({ graphic_canvas: null })])(
    "Given missing or malformed persisted dimensions When modeled Then no wrong-size action is exposed",
    (optionsJson) => {
      const model = buildExportMenuModel("graphic", optionsJson);
      expect(model.ok).toBe(false);
      if (model.ok) throw new TypeError("expected invalid graphic export model");
      expect(model.options).toEqual([]);
    },
  );

  test("Given graphic PNG retry When requested Then persisted exact options are reused", () => {
    const model = buildExportMenuModel("graphic", JSON.stringify({
      graphic_canvas: { schema_version: 1, width: 1200, height: 628 },
    }));

    expect(buildExportRetryRequest("graphic", "png", model)).toEqual({
      format: "png",
      options: { png_width: 1200, png_height: 628, png_dpr: 1 },
    });
  });

  test("Given a standard retry When requested Then existing format-only semantics remain", () => {
    const model = buildExportMenuModel("prototype", null);
    expect(buildExportRetryRequest("prototype", "html_zip", model)).toEqual({
      format: "html_zip",
    });
  });

  test("Given a non-graphic project When modeled Then existing actions remain available", () => {
    const model = buildExportMenuModel("prototype", null);
    expect(model.ok).toBe(true);
    if (!model.ok) throw new TypeError("expected normal export model");
    expect(model.options.filter((option) => option.disabledReason === undefined).map((option) => option.format)).toEqual(["html_zip", "handoff"]);
    expect(model.options.filter((option) => option.disabledReason === "deck_only").map((option) => option.format)).toEqual(["pdf", "pdf", "pdf", "pptx", "pptx"]);
  });
});
