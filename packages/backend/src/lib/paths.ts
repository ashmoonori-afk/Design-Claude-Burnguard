import path from "node:path";
import { PathBoundaryError, resolveWithin } from "../security/path-boundary";
export * from "./app-paths";

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
