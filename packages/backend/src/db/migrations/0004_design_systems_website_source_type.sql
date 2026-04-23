-- Extend design_systems.source_type CHECK to include 'website' so the
-- auto-extract service can record homepage-derived systems alongside
-- git clones. SQLite cannot mutate a CHECK constraint in place, so we
-- rebuild the table, copy rows across, and restore the one index.
--
-- The projects table still references design_systems(id) via a FK;
-- migrate.ts toggles PRAGMA foreign_keys OFF around the migration loop
-- so DROP+RENAME here doesn't trip the reference check (PRAGMA inside
-- a transaction is a no-op, so it has to live at the loop level).

CREATE TABLE design_systems_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK(status IN ('draft','review','published')),
  source_type TEXT CHECK(source_type IN ('sample','github','website','figma','upload','manual')),
  source_uri TEXT,
  is_template INTEGER NOT NULL DEFAULT 0,
  dir_path TEXT NOT NULL,
  skill_md_path TEXT,
  tokens_css_path TEXT,
  readme_md_path TEXT,
  thumbnail_path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);

INSERT INTO design_systems_new (
  id, name, description, status, source_type, source_uri, is_template,
  dir_path, skill_md_path, tokens_css_path, readme_md_path, thumbnail_path,
  created_at, updated_at, archived_at
)
SELECT
  id, name, description, status, source_type, source_uri, is_template,
  dir_path, skill_md_path, tokens_css_path, readme_md_path, thumbnail_path,
  created_at, updated_at, archived_at
FROM design_systems;

DROP TABLE design_systems;
ALTER TABLE design_systems_new RENAME TO design_systems;

CREATE INDEX IF NOT EXISTS idx_ds_status ON design_systems(status);
