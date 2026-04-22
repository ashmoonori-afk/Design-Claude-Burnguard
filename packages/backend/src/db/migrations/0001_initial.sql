CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'You',
  email TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS design_systems (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK(status IN ('draft','review','published')),
  source_type TEXT CHECK(source_type IN ('sample','github','figma','upload','manual')),
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
CREATE INDEX IF NOT EXISTS idx_ds_status ON design_systems(status);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('prototype','slide_deck','from_template','other')),
  design_system_id TEXT REFERENCES design_systems(id),
  dir_path TEXT NOT NULL,
  entrypoint TEXT NOT NULL DEFAULT 'index.html',
  thumbnail_path TEXT,
  backend_id TEXT NOT NULL,
  options_json TEXT,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_ds ON projects(design_system_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  backend_id TEXT NOT NULL,
  backend_session_state TEXT,
  status TEXT NOT NULL CHECK(status IN ('idle','running','awaiting_tool','error','terminated')),
  pid INTEGER,
  last_turn_id TEXT,
  usage_input_tokens INTEGER NOT NULL DEFAULT 0,
  usage_output_tokens INTEGER NOT NULL DEFAULT 0,
  usage_cache_read INTEGER NOT NULL DEFAULT 0,
  usage_cache_write INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK(direction IN ('up','down')),
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  turn_id TEXT,
  processed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_session_time ON events(session_id, processed_at ASC);
CREATE INDEX IF NOT EXISTS idx_events_turn ON events(turn_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(session_id, type);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_id TEXT,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_session ON attachments(session_id);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('stylesheet','script','document','asset','folder','html','other')),
  size_bytes INTEGER,
  hash TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_id, rel_path)
);
CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  anchor_file TEXT NOT NULL,
  anchor_node_id TEXT NOT NULL,
  anchor_rect_json TEXT,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL DEFAULT 'local',
  resolved_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id, resolved_at);

CREATE TABLE IF NOT EXISTS tweaks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  node_id TEXT NOT NULL,
  prop TEXT NOT NULL,
  value TEXT NOT NULL,
  turn_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tweaks_project_node ON tweaks(project_id, node_id);
CREATE INDEX IF NOT EXISTS idx_tweaks_turn ON tweaks(turn_id);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK(format IN ('html_zip','pdf','pptx','handoff')),
  status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed')),
  output_path TEXT,
  error_message TEXT,
  size_bytes INTEGER,
  options_json TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_exports_project ON exports(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS meta_schema (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
