import { Hono } from "hono";
import { DECK_STAGE_JS } from "../runtime/deck-stage";

export const runtimeRoutes = new Hono();

runtimeRoutes.get("/runtime/deck-stage.js", (c) => {
  c.header("Content-Type", "application/javascript; charset=utf-8");
  // Moderate TTL — the runtime is small and rarely changes, but we want
  // users who rebuild the binary to see their update on the next reload.
  c.header("Cache-Control", "public, max-age=300");
  return c.body(DECK_STAGE_JS);
});
