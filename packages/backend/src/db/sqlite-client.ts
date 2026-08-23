import path from "node:path";
import { Database } from "bun:sqlite";
import { appRootDir } from "../lib/paths";

let sqliteInstance: Database | null = null;

export function getSqlite(): Database {
  if (sqliteInstance !== null) return sqliteInstance;
  const dbPath = path.join(appRootDir, "burnguard.db");
  sqliteInstance = new Database(dbPath, { create: true });
  sqliteInstance.exec("PRAGMA journal_mode = WAL;");
  sqliteInstance.exec("PRAGMA busy_timeout = 5000;");
  sqliteInstance.exec("PRAGMA foreign_keys = ON;");
  return sqliteInstance;
}
