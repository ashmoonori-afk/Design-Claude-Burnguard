import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "../../packages/backend/node_modules/playwright-core";
import { QaPreflightError } from "./errors";

export async function findChromiumExecutable(): Promise<string> {
  const preferred = chromium.executablePath();
  try {
    await access(preferred);
    return preferred;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
  }
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  const glob = new Bun.Glob("chromium_headless_shell-*/**/chrome-headless-shell");
  for await (const candidate of glob.scan({ cwd: cache, absolute: true, onlyFiles: true })) {
    await access(candidate);
    return candidate;
  }
  throw new QaPreflightError("chromium_missing", "Installed Chromium was not found");
}
