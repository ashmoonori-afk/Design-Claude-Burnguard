import { describe, expect, test } from "bun:test";
import * as selectorPanel from "../src/components/modes/SelectorReadOnlyPanel";
import type { SelectedNode } from "../src/types/project";

describe("selected canvas node to inline tweaks bridge", () => {
  test("preserves the authoring anchor and computed token context", () => {
    const selectedNode = {
      nodeId: '[data-bg-node-id="hero"]',
      bgId: "hero",
      tag: "button",
      rect: { x: 12, y: 24, w: 160, h: 44 },
      computed: {
        "font-size": "14px",
        color: "rgb(23, 25, 26)",
      },
      inline: {
        color: "#17191a",
      },
      file: "index.html",
    } as SelectedNode;
    const bridge = (
      selectorPanel as typeof selectorPanel & {
        selectedNodeToTweaksTarget?: (
          node: SelectedNode | null,
        ) => unknown;
      }
    ).selectedNodeToTweaksTarget;

    expect(typeof bridge).toBe("function");
    if (!bridge) return;

    expect(bridge(selectedNode)).toEqual({
      bg_id: "hero",
      tag: "button",
      computed: selectedNode.computed,
      inline: selectedNode.inline,
    });
    expect(bridge({ ...selectedNode, bgId: undefined })).toBeNull();
  });
});
