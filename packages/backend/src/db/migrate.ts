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

  const pending = files.filter((file) => !applied.has(file));
  if (pending.length === 0) return;

  // Some migrations rebuild a table to swap a CHECK constraint — that
  // involves DROP+RENAME on a parent the projects FK points at, which
  // trips under foreign_keys=ON. PRAGMA is a no-op inside a transaction,
  // so it has to toggle at the outer loop. Re-enabled in `finally` so a
  // failing migration still leaves the connection in the normal state.
  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    for (const file of pending) {
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      const txn = db.transaction(() => {
        db.exec(sql);
        db
          .prepare(
            "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
          )
          .run(file, Date.now());
      });
      txn();
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}
