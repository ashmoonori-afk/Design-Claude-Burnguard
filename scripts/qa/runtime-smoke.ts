#!/usr/bin/env bun
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { QaPreflightError, QaTimeoutError } from "./errors";
import { OwnedResources, waitForExactReadiness } from "./runtime";

async function allocatePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new QaPreflightError("port_allocation_failed", "OS did not allocate a TCP port"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
    server.listen(0, "127.0.0.1");
  });
}

async function main(): Promise<void> {
  if (process.argv.length !== 3 || process.argv[2] !== "--json") {
    throw new QaPreflightError("invalid_arguments", "Usage: runtime-smoke.ts --json");
  }
  const port = await allocatePort();
  const expected = `[burnguard] listening on http://127.0.0.1:${port}`;
  const resources = new OwnedResources();
  const home = await mkdtemp(`${tmpdir()}/burnguard-runtime-home.`);
  resources.trackHome(home);
  const child = Bun.spawn([
    "bun",
    `${import.meta.dir}/runtime-server-fixture.ts`,
    String(port),
    expected,
  ], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "pipe",
  });
  resources.trackChild(child, port);
  let readiness;
  try {
    readiness = await waitForExactReadiness({
      child,
      expectedLine: expected,
      port,
      manifestReady: () => true,
    });
  } catch (error) {
    await resources.cleanup();
    throw error;
  }
  const firstCleanup = await resources.cleanup();
  const secondCleanup = await resources.cleanup();

  const successLooking = Bun.spawn(["bun", "-e", `console.log(${JSON.stringify(expected)}); process.exit(7)`], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  let misleadingSuccessRejected = false;
  try {
    await waitForExactReadiness({
      child: successLooking,
      expectedLine: expected,
      port,
      manifestReady: () => true,
      timeoutMs: 1_000,
    });
  } catch (error) {
    if (error instanceof QaPreflightError) misleadingSuccessRejected = true;
    else throw error;
  }
  await successLooking.exited;

  const hung = Bun.spawn(["bun", "-e", "import { createServer } from 'node:net'; createServer().listen(0)"], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "pipe",
  });
  let timeoutRejected = false;
  try {
    await waitForExactReadiness({
      child: hung,
      expectedLine: expected,
      port,
      manifestReady: () => true,
      timeoutMs: 100,
    });
  } catch (error) {
    if (error instanceof QaTimeoutError) timeoutRejected = true;
    else throw error;
  } finally {
    if (hung.exitCode === null) hung.kill("SIGTERM");
    await hung.exited;
  }

  const passed =
    Object.values(readiness).every(Boolean) &&
    firstCleanup.processesExited &&
    firstCleanup.portsFree &&
    firstCleanup.browsersClosed &&
    firstCleanup.homesRemoved &&
    Object.values(secondCleanup).every(Boolean) &&
    misleadingSuccessRejected &&
    timeoutRejected;
  process.stdout.write(`${JSON.stringify({
    ok: passed,
    readiness,
    cleanup: secondCleanup,
    misleadingSuccessRejected,
    timeoutRejected,
  })}\n`);
  if (!passed) process.exit(1);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const code =
      error instanceof QaPreflightError || error instanceof QaTimeoutError
        ? error.name
        : error instanceof Error
          ? error.name
          : "UnexpectedFailure";
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exit(1);
  }
}
