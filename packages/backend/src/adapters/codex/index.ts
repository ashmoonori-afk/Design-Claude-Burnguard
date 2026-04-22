import { ulid } from "ulid";
import type { AdapterRunInput, AdapterRunResult } from "../types";
import { parseCodexLine, type CodexParserContext } from "./parser";

/**
 * Codex adapter — streams stdout through `parseCodexLine`.
 *
 * Forward-compatible: when Codex ships a structured JSON stream the
 * parser maps those lines to `NormalizedEvent`s (tool.started /
 * tool.finished / file.changed / usage.delta / status.idle etc.).
 * Any line that isn't structured — including the entire current CLI
 * output — falls through to `chat.delta` so the Phase 1 raw-mode
 * behaviour is preserved byte-for-byte.
 */
export async function runCodexTurn(
  input: AdapterRunInput,
): Promise<AdapterRunResult> {
  const ctx: CodexParserContext = {
    turnId: input.turnId,
    toolNames: new Map(),
  };

  let sawIdle = false;

  const proc = Bun.spawn({
    cmd: [input.binaryPath, "-p", input.prompt],
    cwd: input.projectDir,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal: input.signal,
    killSignal: "SIGKILL",
  });

  await Promise.all([
    readLines(proc.stdout, async (line) => {
      const events = parseCodexLine(line, ctx);
      for (const event of events) {
        if (event.type === "status.idle") sawIdle = true;
        await input.onEvent(event);
      }
    }),
    readLines(proc.stderr, async (line) => {
      await input.onStderr?.(line);
    }),
  ]);

  const exitCode = await proc.exited;

  await input.onEvent({
    id: ulid(),
    ts: Date.now(),
    type: "chat.message_end",
    turnId: input.turnId,
  });

  if (!sawIdle) {
    // The CLI exited without emitting a structured `done` line — emit
    // a synthetic status.idle so the UI unlocks the composer. Mirrors
    // the Claude Code adapter's "no result row → synthesize" behaviour.
    await input.onEvent({
      id: ulid(),
      ts: Date.now(),
      type: "status.idle",
      stopReason: input.signal?.aborted
        ? "interrupted"
        : exitCode === 0
          ? "end_turn"
          : "error",
    });
  }

  return { exitCode };
}

async function readLines(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => Promise<void> | void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx = buffer.indexOf("\n");
      while (idx >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.length > 0) {
          await onLine(line);
        }
        idx = buffer.indexOf("\n");
      }
    }
    if (buffer.length > 0) {
      await onLine(buffer);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}
