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

async function seedSampleDesignSystem(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const source = path.join(repoRoot, "design system sample");
  const destination = path.join(systemsDir, "northvale-capital");

  if (await exists(destination)) return;
  await cp(source, destination, { recursive: true });
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
