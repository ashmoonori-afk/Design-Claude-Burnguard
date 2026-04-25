import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { ensureConfig } from "./config";
import { runMigrations } from "./db/migrate";
import { seedCoreData } from "./db/seed";
import { seedTutorialsOnce } from "./db/seed-tutorials";
import { ensureAllProjectWatchers } from "./services/watchers";
import {
  appRootDir,
  cacheDir,
  dataDir,
  exportsDir,
  logsDir,
  projectsDir,
  resolveRepoRoot,
  systemsDir,
} from "./lib/paths";

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true when a path inside the bundled sample DS source tree
 * is safe to copy into the runtime systems directory.
 *
 * Currently filters out `uploads/` and everything below it: that
 * folder is a local drop-zone for design references during
 * exploration and is also gitignored at the repo level (P4.7b).
 * If a developer happens to have files there locally, this stops
 * those files from propagating into `~/.burnguard/data/systems/`
 * on first run.
 *
 * `relPath` is the path relative to the source root, normalised
 * to forward-slash separators.
 */
export function isSampleSourcePathAllowed(relPath: string): boolean {
  if (relPath === "" || relPath === ".") return true;
  const normalized = relPath.replace(/\\/g, "/");
  const [first] = normalized.split("/");
  return first !== "uploads";
}

async function seedSampleDesignSystem(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const source = path.join(repoRoot, "design system sample");
  const destination = path.join(systemsDir, "northvale-capital");

  if (await exists(destination)) return;
  await cp(source, destination, {
    recursive: true,
    filter: (src) => isSampleSourcePathAllowed(path.relative(source, src)),
  });
}

export async function bootstrapLocalAppData(): Promise<void> {
  await mkdir(appRootDir, { recursive: true });
  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    mkdir(systemsDir, { recursive: true }),
    mkdir(projectsDir, { recursive: true }),
    mkdir(cacheDir, { recursive: true }),
    mkdir(exportsDir, { recursive: true }),
    mkdir(logsDir, { recursive: true }),
  ]);
  await ensureConfig();
  await seedSampleDesignSystem();
  await runMigrations();
  await seedCoreData();
  await seedTutorialsOnce();
  await ensureAllProjectWatchers();
}
