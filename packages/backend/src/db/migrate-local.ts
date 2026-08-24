import path from "node:path";
import { runMigrationsFrom } from "./migrate";

export async function runMigrations(): Promise<void> {
  const { getSqlite } = await import("./sqlite-client");
  await runMigrationsFrom(getSqlite(), path.join(import.meta.dir, "migrations"));
}
