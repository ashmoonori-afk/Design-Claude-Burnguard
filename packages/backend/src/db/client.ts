import path from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { appRootDir } from "../lib/paths";

let sqliteInstance: Database | null = null;
let drizzleInstance: ReturnType<typeof drizzle> | null = null;

export function getSqlite() {
  if (sqliteInstance) return sqliteInstance;
  const dbPath = path.join(appRootDir, "burnguard.db");
  sqliteInstance = new Database(dbPath, { create: true });
  sqliteInstance.exec("PRAGMA journal_mode = WAL;");
  sqliteInstance.exec("PRAGMA busy_timeout = 5000;");
  sqliteInstance.exec("PRAGMA foreign_keys = ON;");
  return sqliteInstance;
}

export function getDb() {
  if (drizzleInstance) return drizzleInstance;
  drizzleInstance = drizzle(getSqlite());
  return drizzleInstance;
}
