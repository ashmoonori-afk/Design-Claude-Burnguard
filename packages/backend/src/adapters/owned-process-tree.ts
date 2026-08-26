export function ownedProcessSpawnOptions(): { readonly detached: boolean } {
  return { detached: process.platform !== "win32" };
}

export async function closeOwnedProcessTree(processId: number): Promise<void> {
  if (process.platform === "win32") {
    const result = Bun.spawnSync(["taskkill", "/PID", String(processId), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    if (result.exitCode !== 0 && isProcessPresent(processId)) throw new Error("adapter_process_tree_cleanup_failed");
    return;
  }
  try {
    process.kill(-processId, "SIGKILL");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
  for (let attempt = 0; attempt < 1024; attempt += 1) {
    if (!isProcessGroupPresent(processId)) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("adapter_process_tree_cleanup_failed");
}

function isProcessPresent(processId: number): boolean {
  try { process.kill(processId, 0); return true; }
  catch (error) { return !(error instanceof Error && "code" in error && error.code === "ESRCH"); }
}

function isProcessGroupPresent(processId: number): boolean {
  try { process.kill(-processId, 0); return true; }
  catch (error) { return !(error instanceof Error && "code" in error && error.code === "ESRCH"); }
}
