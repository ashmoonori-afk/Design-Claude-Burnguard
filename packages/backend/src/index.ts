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
  fetch: app.fetch,
});

const url = `http://${host}:${server.port}`;
console.log(`[burnguard] listening on ${url}`);

if (config.autoOpenBrowser) {
  openBrowser(url);
}

// Keep the process alive and exit cleanly on Ctrl+C
process.on("SIGINT", () => {
  console.log("\n[burnguard] shutting down");
  server.stop(true);
  process.exit(0);
});
