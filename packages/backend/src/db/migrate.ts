import type { Database } from "bun:sqlite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function runMigrationsFrom(
  db: Database,
  migrationsDir: string,
): Promise<void> {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);",
  );

  const rows = db
    .query<{ readonly id: string }, []>("SELECT id FROM schema_migrations")
    .all();
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

export async function runMigrations(): Promise<void> {
  const { getSqlite } = await import("./client");
  await runMigrationsFrom(getSqlite(), path.join(import.meta.dir, "migrations"));
}
