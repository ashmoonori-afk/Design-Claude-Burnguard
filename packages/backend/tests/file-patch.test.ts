import { describe, expect, test } from "bun:test";
import {
  applyHtmlNodePatch,
  FilePatchError,
  parseInlineStyle,
  serializeInlineStyle,
} from "../src/services/file-patch";

const FIXTURE = `<!doctype html>
<html>
<body>
  <h1 data-bg-node-id="hero-title" class="hero">Original title</h1>
  <p data-bg-node-id="hero-sub">Sub</p>
  <div id="other">untouched</div>
</body>
</html>`;

describe("applyHtmlNodePatch", () => {
  test("rewrites text of the targeted node only", () => {
    const out = applyHtmlNodePatch(FIXTURE, {
      node_bg_id: "hero-title",
      text: "New title",
    });
    expect(out).toContain(
      '<h1 data-bg-node-id="hero-title" class="hero">New title</h1>',
    );
    expect(out).toContain('<p data-bg-node-id="hero-sub">Sub</p>');
    expect(out).toContain('<div id="other">untouched</div>');
  });

  test("escapes HTML special characters in text", () => {
    const out = applyHtmlNodePatch(FIXTURE, {
      node_bg_id: "hero-title",
      text: "<script>alert(1)</script> & done",
    });
    expect(out).toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt; &amp; done",
    );
    expect(out).not.toContain("<script>alert(1)</script>");
  });

  test("sets, updates, and removes attributes", () => {
    const out = applyHtmlNodePatch(FIXTURE, {
      node_bg_id: "hero-title",
      attributes: {
        class: "hero hero--big",
        "data-role": "headline",
        title: null,
      },
    });
    expect(out).toContain('class="hero hero--big"');
    expect(out).toContain('data-role="headline"');
  });

  test("silently ignores edits to the data-bg-node-id anchor", () => {
    const out = applyHtmlNodePatch(FIXTURE, {
      node_bg_id: "hero-title",
      attributes: { "data-bg-node-id": "hijacked" },
    });
    expect(out).toContain('data-bg-node-id="hero-title"');
    expect(out).not.toContain("hijacked");
  });

  test("throws FilePatchError(node_not_found) when the anchor is missing", () => {
    expect(() =>
      applyHtmlNodePatch(FIXTURE, { node_bg_id: "does-not-exist", text: "x" }),
    ).toThrow(FilePatchError);
  });

  test("no-op when neither text nor attributes are provided", () => {
    const out = applyHtmlNodePatch(FIXTURE, { node_bg_id: "hero-title" });
    expect(out).toContain(
      '<h1 data-bg-node-id="hero-title" class="hero">Original title</h1>',
    );
  });

  test("styles: adds inline style to a bare element", () => {
    const out = applyHtmlNodePatch(FIXTURE, {
      node_bg_id: "hero-sub",
      styles: { "font-size": "24px", color: "red" },
    });
    expect(out).toContain('style="font-size: 24px; color: red"');
  });

  test("styles: merges into existing style without losing siblings", () => {
    const withStyle = FIXTURE.replace(
      '<p data-bg-node-id="hero-sub">Sub</p>',
      '<p data-bg-node-id="hero-sub" style="color: blue; line-height: 1.4">Sub</p>',
    );
    const out = applyHtmlNodePatch(withStyle, {
      node_bg_id: "hero-sub",
      styles: { "font-size": "24px", color: "red" },
    });
    // color updated, line-height preserved, font-size appended.
    expect(out).toMatch(/color:\s*red/);
    expect(out).toMatch(/line-height:\s*1\.4/);
    expect(out).toMatch(/font-size:\s*24px/);
    expect(out).not.toMatch(/color:\s*blue/);
  });

  test("styles: null removes a property; removing all drops the attribute", () => {
    const withStyle = FIXTURE.replace(
      '<p data-bg-node-id="hero-sub">Sub</p>',
      '<p data-bg-node-id="hero-sub" style="color: blue">Sub</p>',
    );
    const out = applyHtmlNodePatch(withStyle, {
      node_bg_id: "hero-sub",
      styles: { color: null },
    });
    expect(out).toContain('<p data-bg-node-id="hero-sub">Sub</p>');
    expect(out).not.toContain("style=");
  });

  test("styles: coexist with attributes patch in the same call", () => {
    const out = applyHtmlNodePatch(FIXTURE, {
      node_bg_id: "hero-title",
      attributes: { class: "hero hero--xl" },
      styles: { "font-size": "96px" },
    });
    expect(out).toContain('class="hero hero--xl"');
    expect(out).toMatch(/font-size:\s*96px/);
  });
});

describe("parseInlineStyle / serializeInlineStyle", () => {
  test("round-trips key/value pairs", () => {
    const map = parseInlineStyle("font-size: 24px; color: red; line-height: 1.4");
    expect(map).toEqual({
      "font-size": "24px",
      color: "red",
      "line-height": "1.4",
    });
    expect(serializeInlineStyle(map)).toBe(
      "font-size: 24px; color: red; line-height: 1.4",
    );
  });

  test("parse tolerates trailing semicolons and whitespace", () => {
    expect(parseInlineStyle("; color: red ;  ")).toEqual({ color: "red" });
  });

  test("parse ignores declarations without a colon", () => {
    expect(parseInlineStyle("garbage; color: red")).toEqual({ color: "red" });
  });

  test("serialize empty map yields empty string", () => {
    expect(serializeInlineStyle({})).toBe("");
  });
});
