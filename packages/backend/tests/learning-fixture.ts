import type { Database } from "bun:sqlite";

export function ensureLearningSchema(db: Database): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, dir_path TEXT NOT NULL,
      backend_id TEXT NOT NULL, current_revision INTEGER NOT NULL DEFAULT 0, current_digest TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS learning_items (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, content_json TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      parent_item_id TEXT REFERENCES learning_items(id) ON DELETE SET NULL,
      deleted_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS learning_progress (
      item_id TEXT PRIMARY KEY REFERENCES learning_items(id) ON DELETE CASCADE,
      state TEXT NOT NULL DEFAULT 'not_started', revision INTEGER NOT NULL DEFAULT 0,
      feedback_draft TEXT, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS learning_checkpoints (
      id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES learning_items(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      parent_checkpoint_id TEXT REFERENCES learning_checkpoints(id) ON DELETE RESTRICT,
      artifact_revision INTEGER NOT NULL, artifact_digest TEXT NOT NULL, feedback TEXT NOT NULL,
      next_context_json TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS immutable_learning_checkpoints BEFORE UPDATE ON learning_checkpoints
    BEGIN SELECT RAISE(ABORT, 'immutable_learning_checkpoint'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_learning_checkpoints_delete BEFORE DELETE ON learning_checkpoints
    BEGIN SELECT RAISE(ABORT, 'immutable_learning_checkpoint'); END;
  `);
}
