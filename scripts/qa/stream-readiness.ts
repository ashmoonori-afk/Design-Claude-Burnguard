#!/usr/bin/env bun
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { QaInputError } from "./errors";

async function main(): Promise<void> {
  const [expectedLine, signalPath, receiptPath] = process.argv.slice(2);
  if (expectedLine === undefined || signalPath === undefined || receiptPath === undefined) {
    throw new QaInputError("invalid_arguments", "Expected line, signal FIFO, and receipt path");
  }
  if (!path.isAbsolute(signalPath) || !path.isAbsolute(receiptPath)) {
    throw new QaInputError("invalid_path", "Readiness paths must be absolute");
  }
  await appendFile(signalPath, "subscribed\n");
  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let found = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    if (!found && lines.some((line) => line.replace(/\r$/, "") === expectedLine)) {
      found = true;
      await appendFile(receiptPath, `${JSON.stringify({ exactLog: true })}\n`);
      await appendFile(signalPath, "ready\n");
    }
  }
  if (!found) process.exit(1);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const code = error instanceof QaInputError ? error.code : "readiness_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exit(1);
  }
}
