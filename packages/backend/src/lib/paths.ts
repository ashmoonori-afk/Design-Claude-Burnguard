import os from "node:os";
import path from "node:path";

export const appRootDir = path.join(os.homedir(), ".burnguard");
export const configFilePath = path.join(appRootDir, "config.json");
export const dataDir = path.join(appRootDir, "data");
export const systemsDir = path.join(dataDir, "systems");
export const projectsDir = path.join(dataDir, "projects");
export const cacheDir = path.join(appRootDir, "cache");
export const logsDir = path.join(appRootDir, "logs");
export const exportsDir = path.join(cacheDir, "exports");

export function resolveRepoRoot(fromDir = import.meta.dir): string {
  return path.resolve(fromDir, "../../../..");
}
