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
    signal: input.signal,
    killSignal: "SIGKILL",
  });

  await Promise.all([
    readStream(proc.stdout, async (text) => {
      await input.onEvent({
        id: ulid(),
        ts: Date.now(),
        type: "chat.delta",
        turnId: input.turnId,
        text,
      });
    }),
    readStream(proc.stderr, input.onStderr),
  ]);

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
    stopReason: input.signal?.aborted
      ? "interrupted"
      : exitCode === 0
        ? "end_turn"
        : "error",
  });

  return { exitCode };
}

async function readStream(
  stream: ReadableStream<Uint8Array>,
  onChunk?: (text: string) => Promise<void>,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text.length > 0) {
        await onChunk?.(text);
      }
    }

    const trailing = decoder.decode();
    if (trailing.length > 0) {
      await onChunk?.(trailing);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // noop
    }
  }
}
