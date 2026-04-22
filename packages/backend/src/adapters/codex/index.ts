import { ulid } from "ulid";
import type { AdapterRunInput, AdapterRunResult } from "../types";

/**
 * Minimal Codex adapter — raw-mode best-effort. Streams stdout as chat.delta
 * chunks; no structured tool or file tracking. Upgrade as Codex's structured
 * output lands.
 */
export async function runCodexTurn(
  input: AdapterRunInput,
): Promise<AdapterRunResult> {
  const proc = Bun.spawn({
    cmd: [input.binaryPath, "-p", input.prompt],
    cwd: input.projectDir,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text.length > 0) {
        await input.onEvent({
          id: ulid(),
          ts: Date.now(),
          type: "chat.delta",
          turnId: input.turnId,
          text,
        });
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // noop
    }
  }

  if (input.onStderr) {
    const stderrReader = proc.stderr.getReader();
    try {
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;
        await input.onStderr(decoder.decode(value, { stream: true }));
      }
    } finally {
      try {
        stderrReader.releaseLock();
      } catch {
        // noop
      }
    }
  }

  const exitCode = await proc.exited;

  await input.onEvent({
    id: ulid(),
    ts: Date.now(),
    type: "chat.message_end",
    turnId: input.turnId,
  });
  await input.onEvent({
    id: ulid(),
    ts: Date.now(),
    type: "status.idle",
    stopReason: exitCode === 0 ? "end_turn" : "error",
  });

  return { exitCode };
}
