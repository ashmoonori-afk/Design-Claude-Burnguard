import { Hono } from "hono";
import type { ApiErrorBody, ApiSuccess, PlaywrightInstallStatus } from "@bg/shared";
import {
  getPlaywrightInstallStatus,
  startPlaywrightInstall,
} from "../services/playwright-install";

function ok<T>(data: T): ApiSuccess<T> {
  return { data };
}

function fail(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, details } };
}

export const settingsRoutes = new Hono();

settingsRoutes.get("/api/settings/playwright", (c) => {
  return c.json(ok(getPlaywrightInstallStatus() satisfies PlaywrightInstallStatus));
});

settingsRoutes.post("/api/settings/playwright/install", (c) => {
  const result = startPlaywrightInstall();
  if (!result.started) {
    return c.json(
      fail("install_in_progress", "A Playwright install is already running"),
      409,
    );
  }
  return c.json(
    ok(getPlaywrightInstallStatus() satisfies PlaywrightInstallStatus),
    202,
  );
});
