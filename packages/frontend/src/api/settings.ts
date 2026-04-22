import type { PlaywrightInstallStatus } from "@bg/shared";
import { apiFetch } from "./client";

export async function getPlaywrightInstallStatus(): Promise<PlaywrightInstallStatus> {
  return apiFetch<PlaywrightInstallStatus>("/api/settings/playwright");
}

export async function startPlaywrightInstall(): Promise<PlaywrightInstallStatus> {
  return apiFetch<PlaywrightInstallStatus>(
    "/api/settings/playwright/install",
    { method: "POST" },
  );
}
