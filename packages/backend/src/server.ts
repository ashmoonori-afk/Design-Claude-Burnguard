import path from "node:path";
import { existsSync } from "node:fs";
import { Hono } from "hono";
import { APP_NAME } from "@bg/shared";
import { healthRoutes } from "./routes/health";
import { artifactRoutes } from "./routes/artifacts";
import { commentRoutes } from "./routes/comments";
import { homeRoutes } from "./routes/home";
import { projectRoutes } from "./routes/project";
import { runtimeRoutes } from "./routes/runtime";
import { sessionRoutes } from "./routes/session";
import { settingsRoutes } from "./routes/settings";
import { systemRoutes } from "./routes/system";
import { resolveRepoRoot } from "./lib/paths";

export const app = new Hono();

app.route("/", healthRoutes);
app.route("/", artifactRoutes);
app.route("/", commentRoutes);
app.route("/", homeRoutes);
app.route("/", projectRoutes);
app.route("/", runtimeRoutes);
app.route("/", sessionRoutes);
app.route("/", settingsRoutes);
app.route("/", systemRoutes);

app.get("/assets/*", async (c) => {
  const distDir = findFrontendDistDir();
  // Hono 4.x does not expose the wildcard match via c.req.param("*") for a
  // bare `/*` pattern — extract manually from the path.
  const prefix = "/assets/";
  const rawPath = new URL(c.req.url).pathname;
  const assetPath = rawPath.startsWith(prefix)
    ? decodeURIComponent(rawPath.slice(prefix.length))
    : "";
  if (!distDir || !assetPath || assetPath.includes("..")) {
    return c.notFound();
  }

  const absolutePath = path.join(distDir, "assets", assetPath);
  if (!existsSync(absolutePath)) {
    return c.notFound();
  }

  return new Response(Bun.file(absolutePath));
});

app.get("*", async (c) => {
  const pathname = new URL(c.req.url).pathname;
  if (pathname.startsWith("/api/")) {
    return c.notFound();
  }

  const distDir = findFrontendDistDir();
  if (distDir) {
    const indexPath = path.join(distDir, "index.html");
    if (existsSync(indexPath)) {
      return new Response(Bun.file(indexPath), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }
  }

  return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${APP_NAME} - Phase 0</title>
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
  </style>
</head>
<body>
  <div class="card">
    <h1>${APP_NAME}</h1>
    <p class="sub">Frontend dist not found yet. Build the Vite app to replace this placeholder.</p>
    <div class="kv" id="kv">loading /api/health...</div>
    <p class="foot">Phase 1 serves the React app from <code>packages/frontend/dist</code>.</p>
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

function findFrontendDistDir() {
  const repoRoot = resolveRepoRoot();
  const candidates = [
    path.join(repoRoot, "packages", "frontend", "dist"),
    path.join(import.meta.dir, "..", "..", "frontend", "dist"),
  ];

  return candidates.find((candidate) => existsSync(path.join(candidate, "index.html"))) ?? null;
}
