import type { BackendDetectionResult } from "@bg/shared";

const CACHE_TTL_MS = 30_000;

let cachedAt = 0;
let cachedValue: BackendDetectionResult | null = null;

async function detectOne(id: "claude-code" | "codex", binaryNames: string[], installHint: string) {
  for (const name of binaryNames) {
    const binaryPath = Bun.which(name);
    if (!binaryPath) continue;

    try {
      const proc = Bun.spawn({
        cmd: [binaryPath, "--version"],
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const output = stdout.trim() || stderr.trim();
      return {
        id,
        found: true,
        version: output || undefined,
        binary_path: binaryPath,
      } as const;
    } catch {
      return {
        id,
        found: true,
        binary_path: binaryPath,
        install_hint: `${id} found but version probe failed`,
      } as const;
    }
  }

  return {
    id,
    found: false,
    install_hint: installHint,
  } as const;
}

export async function detectBackends(force = false): Promise<BackendDetectionResult> {
  const now = Date.now();
  if (!force && cachedValue && now - cachedAt < CACHE_TTL_MS) {
    return cachedValue;
  }

  const backends = await Promise.all([
    detectOne("claude-code", ["claude", "claude.cmd"], "Install: https://claude.com/code"),
    detectOne("codex", ["codex", "codex.cmd", "openai-codex"], "Install: https://github.com/openai/codex"),
  ]);

  cachedValue = { backends };
  cachedAt = now;
  return cachedValue;
}
