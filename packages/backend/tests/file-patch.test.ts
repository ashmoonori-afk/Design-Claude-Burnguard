import { describe, expect, test } from "bun:test";
import { applyHtmlNodePatch, FilePatchError } from "../src/services/file-patch";

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
});
