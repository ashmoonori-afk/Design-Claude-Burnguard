import { app } from "./server";
import { pickPort } from "./lib/port";
import { openBrowser } from "./lib/browser";
import { bootstrapLocalAppData } from "./bootstrap";
import { loadConfig } from "./config";

await bootstrapLocalAppData();
const config = await loadConfig();
// Dev + binary both prefer the canonical port 14070 (Vite proxy target).
// `pickPort` remains as a fallback only when a BG_SCAN_PORT env var is set —
// useful if a user explicitly runs two instances. For the normal case, a
// hard-coded port gives loud ECONNREFUSED if a zombie backend is lingering.
const envPort = process.env.BG_PORT
  ? Number.parseInt(process.env.BG_PORT, 10)
  : undefined;
const port =
  envPort ??
  config.port ??
  (process.env.BG_SCAN_PORT === "1" ? await pickPort() : 14070);
const host = "127.0.0.1";

const server = Bun.serve({
  port,
  hostname: host,
  // Bun's default is 10 seconds, which kills SSE streams (long-lived) and
  // any POST that awaits a multi-minute LLM CLI subprocess. 255 is the max
  // a single uint8 allows; SSE routes also write periodic heartbeats.
  idleTimeout: 255,
  fetch: app.fetch,
});

const url = `http://${host}:${server.port}`;
console.log(`[burnguard] listening on ${url}`);

// In dev (package.json sets BG_DEV=1), the React SPA is served by Vite on a
// separate port (5173-ish) and this backend only serves /api/*. Auto-opening
// 14070 would show the Phase 0 hello page instead of the app — skip it.
const isDev = process.env.BG_DEV === "1";
if (config.autoOpenBrowser && !isDev) {
  openBrowser(url);
}
if (isDev) {
  console.log(
    "[burnguard] dev mode — open the Vite frontend at http://127.0.0.1:5173/",
  );
}

// Keep the process alive and exit cleanly on Ctrl+C
process.on("SIGINT", () => {
  console.log("\n[burnguard] shutting down");
  server.stop(true);
  process.exit(0);
});
