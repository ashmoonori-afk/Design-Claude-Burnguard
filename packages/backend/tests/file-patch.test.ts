import { afterEach, describe, expect, test } from "bun:test";
import {
  __resetFilePatchUndoStoreForTests,
  applyHtmlNodePatch,
  FilePatchError,
  getFileUndoState,
  parseInlineStyle,
  serializeInlineStyle,
} from "../src/services/file-patch";

afterEach(() => {
  __resetFilePatchUndoStoreForTests();
});

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

  test("escapes quotes too so a future caller cannot inject into an attribute", () => {
    // Defense-in-depth — the current call site (set_content) treats
    // quotes as plain text, but the helper is named generically and
    // could be reused on an attribute path later.
    const out = applyHtmlNodePatch(FIXTURE, {
      node_bg_id: "hero-title",
      text: `He said "hi" and 'bye'`,
    });
    expect(out).toContain("&quot;hi&quot;");
    expect(out).toContain("&#39;bye&#39;");
    expect(out).not.toContain('"hi"');
    expect(out).not.toContain("'bye'");
  });

  test("blocks the classic xss payload via raw event handler injection", () => {
    // node-html-parser parses set_content output as HTML, so any
    // unescaped tag / attribute would survive into the resulting tree.
    // The escape pass turns < > " ' into entities so an attribute like
    // `onerror="..."` becomes inert text. The 'onerror=' substring may
    // still appear in the visible text — what matters is that there
    // is no real onerror attribute on any element.
    const xssPayload = `" onerror="alert('xss')" x="`;
    const out = applyHtmlNodePatch(FIXTURE, {
      node_bg_id: "hero-title",
      text: xssPayload,
    });
    // Quotes are escaped → no real attribute is parsed onto the h1.
    expect(out).not.toMatch(/<h1[^>]*\sonerror\s*=/);
    expect(out).toContain("&quot;");
    expect(out).toContain("&#39;xss&#39;");
    // And the payload script tag analogue — `<img src=x onerror=...>` —
    // also survives only as inert text because `<` is escaped.
    const imgPayload = `<img src=x onerror="alert(1)">`;
    const out2 = applyHtmlNodePatch(FIXTURE, {
      node_bg_id: "hero-title",
      text: imgPayload,
    });
    expect(out2).not.toMatch(/<img\s/);
    expect(out2).toContain("&lt;img");
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

  test("does not split on `;` inside parens — url(), linear-gradient()", () => {
    const map = parseInlineStyle(
      "background: url(data:image/png;base64,abc==); color: red",
    );
    expect(map).toEqual({
      background: "url(data:image/png;base64,abc==)",
      color: "red",
    });
  });

  test("does not split on `,` inside parens — gradient stops, var() fallbacks", () => {
    const map = parseInlineStyle(
      "background: linear-gradient(90deg, red 0%, blue 100%); color: var(--brand, #333)",
    );
    expect(map).toEqual({
      background: "linear-gradient(90deg, red 0%, blue 100%)",
      color: "var(--brand, #333)",
    });
  });

  test("respects single-quoted and double-quoted strings inside values", () => {
    const map = parseInlineStyle(
      `font-family: "Helvetica Neue, sans"; content: 'a; b'`,
    );
    expect(map).toEqual({
      "font-family": '"Helvetica Neue, sans"',
      content: "'a; b'",
    });
  });

  test("nested parens do not corrupt depth tracking", () => {
    const map = parseInlineStyle(
      "filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2)); margin: 4px",
    );
    expect(map).toEqual({
      filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))",
      margin: "4px",
    });
  });
});

// File-level single-step undo store (audit fix #7). The full round-trip
// (patchHtmlNode → undoLastFilePatch → file content restored) needs a
// real project on disk + a DB row, so it's exercised manually in the
// app. These tests pin the public read-only surface so the empty-store
// contract and the test reset helper never silently regress.
describe("file undo store", () => {
  test("getFileUndoState returns can_undo:false on an unseen file", () => {
    const state = getFileUndoState("project-x", "deck.html");
    expect(state.can_undo).toBe(false);
    expect(state.stored_at).toBeNull();
  });

  test("the test-only reset helper is idempotent", () => {
    expect(() => __resetFilePatchUndoStoreForTests()).not.toThrow();
    expect(() => __resetFilePatchUndoStoreForTests()).not.toThrow();
    expect(getFileUndoState("project-x", "deck.html").can_undo).toBe(false);
  });
});
