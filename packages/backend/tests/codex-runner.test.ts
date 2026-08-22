import { describe, expect, test } from "bun:test";
import { buildCodexCommand } from "../src/adapters/codex";

describe("buildCodexCommand", () => {
  test("uses Codex exec with JSON events and stdin prompt input", () => {
    expect(buildCodexCommand("/opt/homebrew/bin/codex")).toEqual([
      "/opt/homebrew/bin/codex",
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "-",
    ]);
  });
});
