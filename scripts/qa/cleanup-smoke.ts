#!/usr/bin/env bun
import { rm } from "node:fs/promises";
import { QaInputError, QaPreflightError } from "./errors";
import { OwnedResources } from "./runtime";

const PORT = 14_079;
const operations = {
  removeHome: async (path: string) => rm(path, { recursive: true, force: true }),
  portIsFree: async () => true,
};

async function ready(child: Bun.Subprocess<"pipe", "pipe", "pipe">): Promise<void> {
  const reader = child.stdout.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const line = new Response(new ReadableStream({
      async start(controller) {
        const { value } = await reader.read();
        controller.enqueue(value);
        controller.close();
      },
    })).text();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new QaPreflightError("ready_timeout", "Child readiness timed out")), 1_000);
    });
    if (!(await Promise.race([line, timeout])).includes("READY")) {
      throw new QaPreflightError("ready_missing", "Child readiness was missing");
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    await reader.cancel();
  }
}

function alive(pid: number): boolean {
  try {
    return process.kill(pid, 0);
  } catch (error) {
    if (error instanceof Error) return false;
    throw error;
  }
}

function exitedProcess() {
  return {
    pid: process.pid,
    exitCode: 0,
    exited: Promise.resolve(0),
    kill: () => undefined,
  };
}

async function main(): Promise<void> {
  if (process.argv.length !== 3 || process.argv[2] !== "--json") {
    throw new QaInputError("invalid_arguments", "Usage: cleanup-smoke.ts --json");
  }
  let closeAttempts = 0;
  const closeFailure = new OwnedResources();
  closeFailure.trackCloseable({
    close: async () => {
      closeAttempts += 1;
      if (closeAttempts === 1) {
        throw new QaPreflightError("close_failed_once", "Injected close failure");
      }
    },
  });
  const closeFirst = await closeFailure.cleanup();
  const closeRepeated = await closeFailure.cleanup();
  const transientCloseFailureLatched =
    !closeFirst.browsersClosed &&
    !closeRepeated.browsersClosed &&
    closeRepeated.repeatedCleanupSafe;

  let processKillAttempts = 0;
  const processFailure = new OwnedResources();
  processFailure.trackProcess({
    pid: process.pid,
    get exitCode() { return processKillAttempts > 0 ? 0 : null; },
    exited: Promise.resolve(0),
    kill: () => {
      processKillAttempts += 1;
      if (processKillAttempts === 1) {
        throw new QaPreflightError("exit_failed_once", "Injected process failure");
      }
    },
  });
  const processFirst = await processFailure.cleanup();
  const processRepeated = await processFailure.cleanup();
  const processExitFailureLatched =
    !processFirst.processesExited && !processRepeated.processesExited;

  let portAttempts = 0;
  const portFailure = new OwnedResources({
    ...operations,
    portIsFree: async () => {
      portAttempts += 1;
      return portAttempts > 1;
    },
  });
  portFailure.trackProcess(exitedProcess(), PORT);
  const portFirst = await portFailure.cleanup();
  const portRepeated = await portFailure.cleanup();
  const transientPortFailureLatched = !portFirst.portsFree && !portRepeated.portsFree;

  let homeAttempts = 0;
  const homeFailure = new OwnedResources({
    ...operations,
    removeHome: async () => {
      homeAttempts += 1;
      if (homeAttempts === 1) {
        throw new QaPreflightError("home_failed_once", "Injected HOME failure");
      }
    },
  });
  homeFailure.trackHome("/worker-owned/fake-home");
  const homeFirst = await homeFailure.cleanup();
  const homeRepeated = await homeFailure.cleanup();
  const transientHomeFailureLatched = !homeFirst.homesRemoved && !homeRepeated.homesRemoved;

  let terminationSignals = 0;
  const hung = new OwnedResources({ ...operations, exitTimeoutMs: 50 });
  hung.trackProcess({
    pid: process.pid,
    exitCode: null,
    exited: new Promise<number>(() => undefined),
    kill: () => { terminationSignals += 1; },
  }, PORT);
  const hungCleanupBounded = await Promise.race([
    hung.cleanup().then(
      (receipt) => !receipt.processesExited && terminationSignals === 2,
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 200)),
  ]);

  const untracked = await new OwnedResources().cleanup();
  const untrackedResourcesRejected = !untracked.processesExited && !untracked.portsFree;

  const owned = Bun.spawn([
    "bun", "-e",
    "process.on('SIGTERM',()=>{}); console.log('READY'); await Bun.stdin.text()",
  ], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const sentinel = Bun.spawn([
    "bun", "-e", "console.log('READY'); await Bun.stdin.text()",
  ], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  let realOwnedKillCompleted = false;
  let unrelatedSentinelSurvived = false;
  try {
    await Promise.all([ready(owned), ready(sentinel)]);
    const realCleanup = new OwnedResources({ ...operations, exitTimeoutMs: 50 });
    realCleanup.trackChild(owned, PORT);
    const realReceipt = await realCleanup.cleanup();
    realOwnedKillCompleted = realReceipt.processesExited && !alive(owned.pid);
    unrelatedSentinelSurvived = alive(sentinel.pid);
  } finally {
    if (alive(owned.pid)) owned.kill("SIGKILL");
    if (alive(sentinel.pid)) sentinel.kill("SIGTERM");
    await Promise.all([owned.exited, sentinel.exited]);
  }
  const receipt = {
    transientCloseFailureLatched,
    processExitFailureLatched,
    transientPortFailureLatched,
    transientHomeFailureLatched,
    hungCleanupBounded,
    untrackedResourcesRejected,
    realOwnedKillCompleted,
    unrelatedSentinelSurvived,
  };
  const ok = Object.values(receipt).every(Boolean);
  process.stdout.write(`${JSON.stringify({ ok, ...receipt })}\n`);
  if (!ok) process.exit(1);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const code = error instanceof QaInputError ? error.code : "cleanup_smoke_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exit(1);
  }
}
