import type { NormalizedEvent, UserEvent } from "@bg/shared";

/** Input passed from turns.ts → adapters/registry → each adapter. */
export interface AdapterRunInput {
  sessionId: string;
  turnId: string;
  projectDir: string;
  binaryPath: string;
  prompt: string;
  userEvent: Extract<UserEvent, { type: "user.message" }>;
  onEvent: (event: NormalizedEvent) => Promise<void>;
  onStderr?: (line: string) => Promise<void>;
}

export interface AdapterRunResult {
  exitCode: number;
}
