import { describe, expect, test } from "bun:test";
import {
  parseCodexLine,
  type CodexParserContext,
} from "../src/adapters/codex/parser";

function ctx(): CodexParserContext {
  return { turnId: "turn-1", toolNames: new Map() };
}

describe("parseCodexLine — structured path", () => {
  test("tool_start becomes tool.started and registers the tool name", () => {
    const c = ctx();
    const events = parseCodexLine(
      JSON.stringify({
        type: "tool_start",
        id: "call-1",
        tool: "Bash",
        input: { command: "ls" },
      }),
      c,
    );
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.type).toBe("tool.started");
    if (e.type === "tool.started") {
      expect(e.toolCallId).toBe("call-1");
      expect(e.tool).toBe("Bash");
      expect(e.input).toEqual({ command: "ls" });
    }
    expect(c.toolNames.get("call-1")).toBe("Bash");
  });

  test("tool_result looks up the registered tool name when the line omits it", () => {
    const c = ctx();
    parseCodexLine(
      JSON.stringify({ type: "tool_start", id: "call-2", tool: "Read" }),
      c,
    );
    const [finished] = parseCodexLine(
      JSON.stringify({ type: "tool_result", id: "call-2", output: "hi" }),
      c,
    );
    expect(finished.type).toBe("tool.finished");
    if (finished.type === "tool.finished") {
      expect(finished.tool).toBe("Read");
      expect(finished.toolCallId).toBe("call-2");
      expect(finished.ok).toBe(true);
      expect(finished.output).toBe("hi");
    }
  });

  test("tool_result respects is_error / ok:false as failure signals", () => {
    const c = ctx();
    const [a] = parseCodexLine(
      JSON.stringify({ type: "tool_result", id: "c", tool: "Bash", is_error: true }),
      c,
    );
    const [b] = parseCodexLine(
      JSON.stringify({ type: "tool_result", id: "c", tool: "Bash", ok: false }),
      c,
    );
    if (a.type === "tool.finished") expect(a.ok).toBe(false);
    if (b.type === "tool.finished") expect(b.ok).toBe(false);
  });

  test("file_change maps to file.changed with a normalized action", () => {
    const c = ctx();
    const [edited] = parseCodexLine(
      JSON.stringify({ type: "file_change", path: "deck.html" }),
      c,
    );
    const [created] = parseCodexLine(
      JSON.stringify({ type: "file_change", path: "notes.md", action: "created" }),
      c,
    );
    const [unknown] = parseCodexLine(
      JSON.stringify({ type: "file_change", path: "x.css", action: "weird" }),
      c,
    );
    if (edited.type === "file.changed") expect(edited.action).toBe("edited");
    if (created.type === "file.changed") expect(created.action).toBe("created");
    if (unknown.type === "file.changed") expect(unknown.action).toBe("edited");
  });

  test("usage maps through and preserves cached when present", () => {
    const c = ctx();
    const [a] = parseCodexLine(
      JSON.stringify({ type: "usage", input_tokens: 123, output_tokens: 45 }),
      c,
    );
    const [b] = parseCodexLine(
      JSON.stringify({ type: "usage", input: 10, output: 20, cached: 5 }),
      c,
    );
    if (a.type === "usage.delta") {
      expect(a.input).toBe(123);
      expect(a.output).toBe(45);
      expect(a.cached).toBeUndefined();
    }
    if (b.type === "usage.delta") {
      expect(b.cached).toBe(5);
    }
  });

  test("done normalizes stopReason and falls back to end_turn", () => {
    const c = ctx();
    const [a] = parseCodexLine(JSON.stringify({ type: "done", reason: "interrupted" }), c);
    const [b] = parseCodexLine(JSON.stringify({ type: "done", reason: "unknown" }), c);
    if (a.type === "status.idle") expect(a.stopReason).toBe("interrupted");
    if (b.type === "status.idle") expect(b.stopReason).toBe("end_turn");
  });

  test("text / message map to chat.delta", () => {
    const c = ctx();
    const [a] = parseCodexLine(JSON.stringify({ type: "text", content: "hi" }), c);
    const [b] = parseCodexLine(JSON.stringify({ type: "message", text: "hi" }), c);
    if (a.type === "chat.delta") expect(a.text).toBe("hi");
    if (b.type === "chat.delta") expect(b.text).toBe("hi");
  });

  test("thinking maps to chat.thinking", () => {
    const c = ctx();
    const [e] = parseCodexLine(
      JSON.stringify({ type: "thinking", content: "pondering" }),
      c,
    );
    expect(e.type).toBe("chat.thinking");
  });

  test("error maps to status.error with recoverable default true", () => {
    const c = ctx();
    const [e] = parseCodexLine(
      JSON.stringify({ type: "error", message: "boom" }),
      c,
    );
    if (e.type === "status.error") {
      expect(e.message).toBe("boom");
      expect(e.recoverable).toBe(true);
    }
  });
});

describe("parseCodexLine — raw-mode fallthrough", () => {
  test("non-JSON text falls through to chat.delta byte-for-byte", () => {
    const c = ctx();
    const raw = "  hello world from codex  ";
    const events = parseCodexLine(raw, c);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.type).toBe("chat.delta");
    if (e.type === "chat.delta") expect(e.text).toBe(raw);
  });

  test("JSON with an unknown type also falls through", () => {
    const c = ctx();
    const [e] = parseCodexLine(JSON.stringify({ type: "new_and_exciting" }), c);
    expect(e.type).toBe("chat.delta");
  });

  test("JSON without a type field falls through", () => {
    const c = ctx();
    const [e] = parseCodexLine(JSON.stringify({ hello: "world" }), c);
    expect(e.type).toBe("chat.delta");
  });

  test("malformed JSON falls through instead of throwing", () => {
    const c = ctx();
    const [e] = parseCodexLine(`{ "type": "text",`, c);
    expect(e.type).toBe("chat.delta");
  });

  test("empty / whitespace-only lines are dropped", () => {
    const c = ctx();
    expect(parseCodexLine("", c)).toHaveLength(0);
    expect(parseCodexLine("   ", c)).toHaveLength(0);
    expect(parseCodexLine("\t\n", c)).toHaveLength(0);
  });
});
