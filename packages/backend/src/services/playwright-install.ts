import type { PlaywrightInstallStatus } from "@bg/shared";

const MAX_TAIL = 120;

let status: PlaywrightInstallStatus = {
  state: "idle",
  started_at: null,
  finished_at: null,
  exit_code: null,
  error: null,
  tail: [],
};

let runningProc: ReturnType<typeof Bun.spawn> | null = null;

export function getPlaywrightInstallStatus(): PlaywrightInstallStatus {
  return { ...status, tail: [...status.tail] };
}

/**
 * Kicks off `npx playwright install chromium` as a background child process.
 * Returns `{ started: true }` when a fresh install begins, or
 * `{ started: false }` if one is already running.
 *
 * The stream outputs are buffered into `status.tail` so the UI can surface
 * a short log without subscribing to a stream. Final state is `success` or
 * `error`. Single global slot — concurrent requests are ignored.
 */
export function startPlaywrightInstall(): { started: boolean } {
  if (status.state === "installing") return { started: false };

  status = {
    state: "installing",
    started_at: Date.now(),
    finished_at: null,
    exit_code: null,
    error: null,
    tail: [],
  };

  try {
    const cmd =
      process.platform === "win32"
        ? ["cmd.exe", "/c", "npx", "-y", "playwright", "install", "chromium"]
        : ["npx", "-y", "playwright", "install", "chromium"];

    runningProc = Bun.spawn({
      cmd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      env: { ...process.env },
    });
  } catch (err) {
    status = {
      ...status,
      state: "error",
      finished_at: Date.now(),
      error: err instanceof Error ? err.message : String(err),
    };
    return { started: false };
  }

  const proc = runningProc;
  const pushLine = (line: string) => {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed) return;
    status.tail.push(trimmed);
    if (status.tail.length > MAX_TAIL) status.tail.shift();
  };

  if (proc.stdout instanceof ReadableStream) void readStream(proc.stdout, pushLine);
  if (proc.stderr instanceof ReadableStream) void readStream(proc.stderr, pushLine);

  void proc.exited.then((exitCode) => {
    status = {
      ...status,
      state: exitCode === 0 ? "success" : "error",
      finished_at: Date.now(),
      exit_code: exitCode,
      error:
        exitCode === 0
          ? null
          : `npx playwright install exited with code ${exitCode}. See tail for details.`,
    };
    runningProc = null;
  });

  return { started: true };
}

async function readStream(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
) {
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
        onLine(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
        idx = buffer.indexOf("\n");
      }
    }
    if (buffer.length > 0) onLine(buffer);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}
