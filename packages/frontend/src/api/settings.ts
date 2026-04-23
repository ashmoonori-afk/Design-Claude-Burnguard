import type { PlaywrightInstallStatus, PythonSettings } from "@bg/shared";
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

export async function getPythonSettings(): Promise<PythonSettings> {
  return apiFetch<PythonSettings>("/api/settings/python");
}

export async function startPypdfInstall(): Promise<PythonSettings> {
  return apiFetch<PythonSettings>("/api/settings/python/install", {
    method: "POST",
  });
}
