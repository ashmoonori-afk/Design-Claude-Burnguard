import { app } from "./server";
import { pickPort } from "./lib/port";
import { openBrowser } from "./lib/browser";

const port = await pickPort();
const host = "127.0.0.1";

const server = Bun.serve({
  port,
  hostname: host,
  fetch: app.fetch,
});

const url = `http://${host}:${server.port}`;
console.log(`[burnguard] listening on ${url}`);

openBrowser(url);

// Keep the process alive and exit cleanly on Ctrl+C
process.on("SIGINT", () => {
  console.log("\n[burnguard] shutting down");
  server.stop(true);
  process.exit(0);
});
