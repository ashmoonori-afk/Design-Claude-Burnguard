import type { BackendId } from "@bg/shared";
import type { AdapterRunInput, AdapterRunResult } from "./types";
import { runClaudeCodeTurn } from "./claude-code";
import { runCodexTurn } from "./codex";

export async function runAdapterTurn(
  backendId: BackendId,
  input: AdapterRunInput,
): Promise<AdapterRunResult> {
  switch (backendId) {
    case "claude-code":
      return runClaudeCodeTurn(input);
    case "codex":
      return runCodexTurn(input);
    default:
      throw new Error(`Unknown backend: ${backendId}`);
  }
}
