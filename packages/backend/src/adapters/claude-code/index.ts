import { ulid } from "ulid";
import type { AdapterRunInput, AdapterRunResult } from "../types";
import { runClaudeCode } from "./runner";
import { parseStreamLine, type ParserContext } from "./parser";

export async function runClaudeCodeTurn(
  input: AdapterRunInput,
): Promise<AdapterRunResult> {
  const ctx: ParserContext = {
    turnId: input.turnId,
    projectDir: input.projectDir,
    toolNames: new Map(),
    toolInputs: new Map(),
  };

  let sawIdle = false;

  // Register the decision sink so user.tool_decision payloads flow
  // in while the CLI runs. `-p` mode is one-shot and doesn't read
  // additional stdin today, so decisions are only logged — a later
  // slice that moves to `--input-format stream-json` can write them
  // through the process stdin for a real round-trip.
  const unsubscribeDecision = input.onDecision?.((decision) => {
    // eslint-disable-next-line no-console
    console.log(
      `[claude-code] tool decision received for ${decision.toolCallId}: ${decision.decision}` +
        (decision.reason ? ` (${decision.reason})` : ""),
    );
  });

  const result = await runClaudeCode({
    binaryPath: input.binaryPath,
    projectDir: input.projectDir,
    prompt: input.prompt,
    signal: input.signal,
    sessionId: input.sessionId,
    onStdoutLine: async (line) => {
      const events = parseStreamLine(line, ctx);
      for (const event of events) {
        if (event.type === "status.idle") sawIdle = true;
        await input.onEvent(event);
      }
    },
    onStderrLine: input.onStderr
      ? async (line) => {
          await input.onStderr?.(line);
        }
      : undefined,
  });

  if (!sawIdle) {
    // The CLI exited without emitting a final `result` line.
    // Emit a synthetic idle so the UI unlocks the composer.
    await input.onEvent({
      id: ulid(),
      ts: Date.now(),
      type: "status.idle",
      stopReason: input.signal?.aborted
        ? "interrupted"
        : result.exitCode === 0
          ? "end_turn"
          : "error",
    });
  }

  unsubscribeDecision?.();
  return result;
}
