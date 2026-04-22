import { Hono } from "hono";
import { DECK_STAGE_JS } from "../runtime/deck-stage";

export const runtimeRoutes = new Hono();

runtimeRoutes.get("/runtime/deck-stage.js", (c) => {
  c.header("Content-Type", "application/javascript; charset=utf-8");
  // No caching — the runtime ships with the binary and evolves quickly
  // during development. A stale cached copy caused an infinite-loop build
  // to persist in the browser after the server-side fix shipped. The file
  // is ~10 KB so the re-fetch cost is negligible.
  c.header("Cache-Control", "no-store");
  return c.body(DECK_STAGE_JS);
});
