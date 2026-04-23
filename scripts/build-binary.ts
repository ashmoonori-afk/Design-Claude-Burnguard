#!/usr/bin/env bun
/**
 * Phase 0 build: compile the backend into a single Windows x64 executable.
 *
 * Phase 0 does NOT embed the React frontend yet — the binary serves an inline
 * hello page (see packages/backend/src/server.ts) to validate:
 *   (1) `bun build --compile --target=bun-windows-x64` succeeds
 *   (2) the resulting .exe runs on Windows
 *   (3) Hono + native http stack work from the compiled binary
 *   (4) the browser auto-opens
 *
 * Phase 1 replaces the inline page with embedded frontend assets.
 */
import { $ } from "bun";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const OUT_DIR = path.join(ROOT, "dist");
const OUT = path.join(OUT_DIR, "burnguard-design.exe");
const ENTRY = path.join(ROOT, "packages/backend/src/index.ts");

async function main() {
  if (!existsSync(ENTRY)) {
    console.error(`entry not found: ${ENTRY}`);
    process.exit(1);
  }

  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log(`[build] entry:  ${ENTRY}`);
  console.log(`[build] output: ${OUT}`);
  console.log(`[build] target: bun-windows-x64`);

  const start = Date.now();
  // --external electron: playwright-core imports electron in an
  // optional loader we never hit (we only drive headless chromium).
  // Without the flag bun fails to resolve the module at compile.
  await $`bun build ${ENTRY} \
    --compile \
    --target=bun-windows-x64 \
    --minify \
    --external electron \
    --outfile ${OUT}`.cwd(ROOT);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[build] done in ${elapsed}s`);
  console.log(`[build] run: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
