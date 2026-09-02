import type { BackendDetectionResult } from "@bg/shared";

const VERSION_PROBE_TIMEOUT_MS = 5_000;

let cachedValue: BackendDetectionResult | null = null;

/**
 * Runs `<binary> --version`. stdout and stderr are drained concurrently —
 * reading them in sequence deadlocks whenever a CLI fills the stderr pipe
 * buffer while we are still blocked on stdout. A CLI that never answers is
 * abandoned after `VERSION_PROBE_TIMEOUT_MS`; the binary is on PATH either
 * way, so the caller keeps `found: true` and just loses the version string.
 */
async function probeVersion(binaryPath: string): Promise<string | undefined> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => { timer = setTimeout(() => { controller.abort(); resolve(undefined); }, VERSION_PROBE_TIMEOUT_MS); });
  try {
    const proc = Bun.spawn({
      cmd: [binaryPath, "--version"],
      stdout: "pipe",
      stderr: "pipe",
      signal: controller.signal,
    });
    const read = Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
      .then(([stdout, stderr]) => stdout.trim() || stderr.trim() || undefined)
      .catch(() => undefined);
    return await Promise.race([read, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function detectOne(id: "claude-code" | "codex", binaryNames: string[], installHint: string) {
  for (const name of binaryNames) {
    const binaryPath = Bun.which(name);
    if (!binaryPath) continue;

    try {
      return {
        id,
        found: true,
        version: await probeVersion(binaryPath),
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

/**
 * Cached for the lifetime of the process: every turn start asks for the
 * detection result and each miss spawns two CLI subprocesses. Callers that
 * need to observe a freshly installed CLI pass `{ force: true }`.
 */
export async function detectBackends(options: { force?: boolean } = {}): Promise<BackendDetectionResult> {
  if (!options.force && cachedValue) {
    return cachedValue;
  }

  const backends = await Promise.all([
    detectOne("claude-code", ["claude", "claude.cmd"], "Install: https://claude.com/code"),
    detectOne("codex", ["codex", "codex.cmd", "openai-codex"], "Install: https://github.com/openai/codex"),
  ]);

  cachedValue = { backends };
  return cachedValue;
}
