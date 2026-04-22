import { Hono } from "hono";
import { APP_NAME, APP_VERSION, type HealthResponse } from "@bg/shared";

const startTime = Date.now();

export const app = new Hono();

app.get("/api/health", (c) => {
  const body: HealthResponse = {
    ok: true,
    name: APP_NAME,
    version: APP_VERSION,
    uptimeMs: Date.now() - startTime,
    runtime: typeof Bun !== "undefined" ? "bun" : "node",
    platform: process.platform,
  };
  return c.json(body);
});

/**
 * Phase 0: inline a hello page so the binary alone (without the Vite frontend
 * bundled yet) proves the distribution path works. Phase 1 replaces this with
 * embedded frontend assets served via Bun.file().
 */
app.get("/", (c) => {
  return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${APP_NAME} — Phase 0</title>
  <style>
    :root { color-scheme: light; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #FAFAF7;
      color: #1C2B36;
      display: grid;
      place-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
    }
    .card {
      background: #FFFFFF;
      padding: 48px;
      border-radius: 12px;
      border: 1px solid #E8E3DB;
      box-shadow: 0 6px 16px rgba(28, 43, 54, 0.10);
      max-width: 480px;
      width: 100%;
    }
    h1 { margin: 0 0 8px; font-size: 28px; font-weight: 600; }
    .sub { color: #5B7282; margin: 0 0 24px; }
    .kv {
      background: #F2F5F7;
      border-radius: 8px;
      padding: 16px;
      font-family: "SF Mono", Consolas, monospace;
      font-size: 13px;
      line-height: 1.6;
    }
    .foot { margin-top: 24px; font-size: 12px; color: #9FB1BD; }
    code { background: #F2F5F7; padding: 2px 6px; border-radius: 4px; }
    a { color: #186ADE; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${APP_NAME}</h1>
    <p class="sub">Phase 0 — the compiled binary boots, Hono serves HTTP, the browser opened automatically.</p>
    <div class="kv" id="kv">loading /api/health…</div>
    <p class="foot">
      This inline page ships with the binary. In Phase 1 it is replaced by the Vite-built React SPA, served from embedded assets.
    </p>
  </div>
  <script>
    fetch("/api/health")
      .then(r => r.json())
      .then(h => {
        document.getElementById("kv").innerHTML =
          "version: " + h.version + "<br>" +
          "runtime: " + h.runtime + "<br>" +
          "platform: " + h.platform + "<br>" +
          "uptime: " + h.uptimeMs + "ms";
      })
      .catch(e => {
        document.getElementById("kv").textContent = "health error: " + e;
      });
  </script>
</body>
</html>`);
});
