import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { BackendId, ThemeMode } from "@bg/shared";
import { APP_VERSION } from "@bg/shared";
import { appRootDir, configFilePath } from "./lib/paths";

export interface AppConfig {
  defaultBackend: BackendId;
  theme: ThemeMode;
  port: number | null;
  autoOpenBrowser: boolean;
  playwright: {
    installed: boolean;
    installPath: string | null;
  };
  harness: {
    maxConcurrentSessions: number;
    checkpointEveryTurns: number;
    toolAutoAllow: boolean;
  };
  chat: {
    /**
     * Minimum time (ms) a single CLI turn must run before the UI
     * surfaces the Interrupt button. Keeps fast turns uncluttered
     * while still giving the user a hard-stop on stuck ones.
     */
    abortThresholdMs: number;
    /**
     * Controls how much stable context is injected on every CLI turn.
     * Compact mode keeps long-running sessions cheaper by referencing
     * stable design-system files instead of re-inlining them every time.
     */
    contextMode: "compact" | "full";
  };
  logs: {
    level: "debug" | "info" | "warn" | "error";
  };
  user: {
    id: "local";
    displayName: string;
  };
  appVersion: string;
}

export const defaultConfig: AppConfig = {
  defaultBackend: "claude-code",
  theme: "light",
  port: null,
  autoOpenBrowser: true,
  playwright: {
    installed: false,
    installPath: null,
  },
  harness: {
    maxConcurrentSessions: 3,
    checkpointEveryTurns: 5,
    toolAutoAllow: true,
  },
  chat: {
    abortThresholdMs: 300_000,
    contextMode: "compact",
  },
  logs: {
    level: "info",
  },
  user: {
    id: "local",
    displayName: "You",
  },
  appVersion: APP_VERSION,
};

function mergeConfig(input: unknown): AppConfig {
  const candidate = typeof input === "object" && input !== null ? input : {};
  const source = candidate as Partial<AppConfig>;

  return {
    ...defaultConfig,
    ...source,
    playwright: {
      ...defaultConfig.playwright,
      ...source.playwright,
    },
    harness: {
      ...defaultConfig.harness,
      ...source.harness,
    },
    chat: {
      ...defaultConfig.chat,
      ...source.chat,
    },
    logs: {
      ...defaultConfig.logs,
      ...source.logs,
    },
    user: {
      ...defaultConfig.user,
      ...source.user,
    },
    appVersion: APP_VERSION,
  };
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(configFilePath, "utf8");
    return mergeConfig(JSON.parse(raw));
  } catch {
    return structuredClone(defaultConfig);
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(appRootDir, { recursive: true });
  await writeFile(configFilePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function ensureConfig(): Promise<AppConfig> {
  const config = await loadConfig();
  await saveConfig(config);
  return config;
}
