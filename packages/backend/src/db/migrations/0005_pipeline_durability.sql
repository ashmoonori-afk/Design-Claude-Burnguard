ALTER TABLE design_systems ADD COLUMN metadata_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN current_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN current_digest TEXT;
ALTER TABLE events ADD COLUMN sequence INTEGER;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY processed_at, id) AS value
  FROM events
)
UPDATE events SET sequence = (SELECT value FROM ranked WHERE ranked.id = events.id);
CREATE UNIQUE INDEX uq_events_session_sequence ON events(session_id, sequence);

CREATE TABLE design_system_tags (
  design_system_id TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (design_system_id, tag),
  UNIQUE (design_system_id, ordinal)
);

CREATE TABLE design_system_receipts (
  id TEXT NOT NULL PRIMARY KEY,
  design_system_id TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('prepared','committed','recovering','failed')) DEFAULT 'prepared',
  content_revision INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  digest TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (design_system_id, content_revision)
);
CREATE INDEX idx_design_system_receipts_system ON design_system_receipts(design_system_id, content_revision DESC);

CREATE TABLE learning_items (
  id TEXT NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('lesson','example','skill-card')),
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  parent_item_id TEXT REFERENCES learning_items(id) ON DELETE SET NULL,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_learning_items_kind ON learning_items(kind, deleted_at);

CREATE TABLE learning_progress (
  item_id TEXT NOT NULL PRIMARY KEY REFERENCES learning_items(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK(state IN ('not_started','in_progress','completed')) DEFAULT 'not_started',
  revision INTEGER NOT NULL DEFAULT 0,
  feedback_draft TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE learning_checkpoints (
  id TEXT NOT NULL PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES learning_items(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  parent_checkpoint_id TEXT REFERENCES learning_checkpoints(id) ON DELETE RESTRICT,
  artifact_revision INTEGER NOT NULL,
  artifact_digest TEXT NOT NULL,
  feedback TEXT NOT NULL,
  next_context_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_learning_checkpoints_item ON learning_checkpoints(item_id, created_at);
CREATE TRIGGER immutable_learning_checkpoints
BEFORE UPDATE ON learning_checkpoints
BEGIN
  SELECT RAISE(ABORT, 'immutable_learning_checkpoint');
END;

CREATE TABLE artifact_operations (
  id TEXT NOT NULL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('pending','working','committed','cancelled','failed','conflicted','recovering','recovered')) DEFAULT 'pending',
  base_revision INTEGER NOT NULL,
  base_digest TEXT NOT NULL,
  result_revision INTEGER,
  result_digest TEXT,
  expected_revision INTEGER NOT NULL,
  expected_file_hash TEXT NOT NULL,
  node_fingerprint TEXT NOT NULL,
  diff_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  retention_json TEXT NOT NULL,
  replay_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_artifact_operations_project ON artifact_operations(project_id, created_at DESC);
CREATE UNIQUE INDEX uq_artifact_operations_nonterminal ON artifact_operations(project_id)
  WHERE status IN ('pending','working','recovering');

CREATE TABLE export_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES exports(id) ON DELETE CASCADE,
  parent_attempt_id TEXT REFERENCES export_attempts(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','running','validating','validated','failed','cancelled','retrying','recovering','expired','corrupt')),
  progress_json TEXT NOT NULL,
  stop_reason TEXT,
  project_revision INTEGER NOT NULL,
  project_digest TEXT NOT NULL,
  canonical_options_json TEXT NOT NULL,
  options_digest TEXT NOT NULL,
  input_closure_digest TEXT NOT NULL,
  renderer_digest TEXT NOT NULL,
  capture_digest TEXT NOT NULL,
  output_digest TEXT NOT NULL,
  receipt_digest TEXT NOT NULL,
  findings_json TEXT NOT NULL,
  retention_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_export_attempts_job ON export_attempts(job_id, created_at);
