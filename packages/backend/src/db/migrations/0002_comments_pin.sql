-- P2.4: replace comments table with pin-oriented schema (rel_path / node_selector / x_pct / y_pct).
-- Table was never populated in prior sessions, so a drop+recreate is safe.

DROP INDEX IF EXISTS idx_comments_project;
DROP TABLE IF EXISTS comments;

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  node_selector TEXT NOT NULL DEFAULT '',
  x_pct REAL NOT NULL,
  y_pct REAL NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL DEFAULT 'local',
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id, resolved_at);
