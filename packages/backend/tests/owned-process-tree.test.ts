import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runClaudeCode } from "../src/adapters/claude-code/runner";

test("Given an adapter exits with a surviving child When its result resolves Then the owned process tree is absent before publication", async () => {
  if (process.platform === "win32") return;
  const root = await mkdtemp(path.join(tmpdir(), "burnguard-adapter-tree-"));
  const binary = path.join(root, "adapter-fixture");
  const childScript = "await new Promise(() => {})";
  await writeFile(binary, `#!/usr/bin/env bun\nconst child=Bun.spawn([process.execPath,"-e",${JSON.stringify(childScript)}],{stdin:"ignore",stdout:"ignore",stderr:"ignore"});child.unref();console.log(child.pid);\n`);
  await chmod(binary, 0o700);
  let childPid = 0;
  try {
    const result = await runClaudeCode({ binaryPath: binary, projectDir: root, prompt: "test", onStdoutLine: (line) => { childPid = Number(line); } });
    expect(result.exitCode).toBe(0);
    expect(Number.isSafeInteger(childPid) && childPid > 0).toBe(true);
    expect(() => process.kill(childPid, 0)).toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
