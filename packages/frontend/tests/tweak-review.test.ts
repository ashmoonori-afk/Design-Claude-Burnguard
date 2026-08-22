import { describe, expect, test } from "bun:test";
import * as tweaksPanel from "../src/components/modes/TweaksPanel";
import type {
  TweaksStyleKey,
  TweaksTarget,
} from "../src/components/canvas/TweaksLayer";

describe("inline tweak review", () => {
  test("summarizes the source value and the proposed patch", () => {
    const target: TweaksTarget = {
      bg_id: "hero",
      tag: "h1",
      computed: { "font-size": "48px" },
      inline: { "font-size": "48px" },
    };
    const buildPreview = (
      tweaksPanel as typeof tweaksPanel & {
        buildTweakChangePreview?: (
          target: TweaksTarget,
          patch: Partial<Record<TweaksStyleKey, string | null>>,
        ) => unknown;
      }
    ).buildTweakChangePreview;

    expect(typeof buildPreview).toBe("function");
    if (!buildPreview) return;

    expect(buildPreview(target, { "font-size": "52px" })).toEqual({
      property: "font-size",
      from: "48px",
      to: "52px",
    });
  });
});
