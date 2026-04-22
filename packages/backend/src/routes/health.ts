import { Hono } from "hono";
import { APP_NAME, APP_VERSION, type HealthResponse } from "@bg/shared";

const startTime = Date.now();

export const healthRoutes = new Hono();

healthRoutes.get("/api/health", (c) => {
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
