import os from "node:os";
import path from "node:path";
import { PathBoundaryError, resolveWithin } from "../security/path-boundary";

export const appRootDir = path.join(os.homedir(), ".burnguard");
export const configFilePath = path.join(appRootDir, "config.json");
export const dataDir = path.join(appRootDir, "data");
export const systemsDir = path.join(dataDir, "systems");
export const projectsDir = path.join(dataDir, "projects");
export const cacheDir = path.join(appRootDir, "cache");
export const logsDir = path.join(appRootDir, "logs");
export const exportsDir = path.join(cacheDir, "exports");

/** Resolves a DB-sourced absolute path against its managed storage root. */
export function resolveManagedPath(root: string, target: string): string {
  const relative = path.relative(root, target);
  if (!relative) {
    throw new PathBoundaryError("outside_root", "Managed storage root is not a record path");
  }
  return resolveWithin(root, relative);
}

export function resolveRepoRoot(fromDir = import.meta.dir): string {
  return path.resolve(fromDir, "../../../..");
}
