import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getSqlite } from "./client";

export async function runMigrations() {
  const db = getSqlite();
  const migrationsDir = path.join(import.meta.dir, "migrations");
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);",
  );

  const rows = db
    .query("SELECT id FROM schema_migrations")
    .all() as Array<{ id: string }>;
  const applied = new Set(rows.map((row) => row.id));
  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const txn = db.transaction(() => {
      db.exec(sql);
      db
        .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
        .run(file, Date.now());
    });
    txn();
  }
}
