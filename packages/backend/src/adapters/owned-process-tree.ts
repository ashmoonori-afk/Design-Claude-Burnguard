const CLEANUP_POLL_MS = 25;
const CLEANUP_TIMEOUT_MS = 3_000;

export function ownedProcessSpawnOptions(): { readonly detached: boolean } {
  return { detached: process.platform !== "win32" };
}

export async function closeOwnedProcessTree(processId: number): Promise<void> {
  if (process.platform === "win32") {
    const result = Bun.spawnSync(["taskkill", "/PID", String(processId), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    // A non-zero taskkill exit usually means the root already exited on its
    // own, which is the normal path — only an actually surviving process is
    // worth reporting, and never by throwing (see warnCleanupIncomplete).
    if (result.exitCode !== 0 && isProcessPresent(processId)) warnCleanupIncomplete(processId);
    return;
  }
  try {
    process.kill(-processId, "SIGKILL");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
  // Real elapsed time, not scheduler ticks: the previous setImmediate loop
  // drained in a couple of milliseconds and reported failure long before a
  // signalled process group had a chance to be reaped.
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!isProcessGroupPresent(processId)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, CLEANUP_POLL_MS));
  }
  if (isProcessGroupPresent(processId)) warnCleanupIncomplete(processId);
}

/**
 * Cleanup runs on the success path of every turn as well as on abort. A
 * straggler is worth a log line but must never turn a completed turn into
 * a failed one, so this warns where the previous implementation threw.
 */
function warnCleanupIncomplete(processId: number): void {
  // eslint-disable-next-line no-console
  console.warn(`[adapter] owned process tree ${processId} did not fully exit`);
}

function isProcessPresent(processId: number): boolean {
  try { process.kill(processId, 0); return true; }
  catch (error) { return !(error instanceof Error && "code" in error && error.code === "ESRCH"); }
}

function isProcessGroupPresent(processId: number): boolean {
  try { process.kill(-processId, 0); return true; }
  catch (error) { return !(error instanceof Error && "code" in error && error.code === "ESRCH"); }
}
