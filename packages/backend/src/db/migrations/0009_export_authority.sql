ALTER TABLE export_attempts RENAME TO export_attempts_legacy_0009;
ALTER TABLE exports RENAME TO exports_legacy_0009;
DROP INDEX idx_export_attempts_job;
DROP INDEX idx_exports_project;

CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK(format IN ('html_zip','pdf','png','pptx','handoff')),
  status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed')),
  output_path TEXT,
  error_message TEXT,
  size_bytes INTEGER,
  options_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
INSERT INTO exports(id,project_id,format,status,output_path,error_message,size_bytes,options_json,created_at,completed_at)
SELECT id,project_id,format,status,output_path,error_message,size_bytes,COALESCE(options_json,'{}'),created_at,completed_at
FROM exports_legacy_0009;
CREATE INDEX idx_exports_project ON exports(project_id, created_at DESC);

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
  input_closure_digest TEXT,
  design_system_digest TEXT,
  renderer_digest TEXT NOT NULL,
  capture_digest TEXT NOT NULL,
  output_digest TEXT,
  receipt_digest TEXT,
  findings_json TEXT NOT NULL,
  retention_json TEXT NOT NULL,
  cancel_requested_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO export_attempts(
  id,job_id,parent_attempt_id,status,progress_json,stop_reason,project_revision,project_digest,
  canonical_options_json,options_digest,input_closure_digest,design_system_digest,renderer_digest,
  capture_digest,output_digest,receipt_digest,findings_json,retention_json,cancel_requested_at,created_at,updated_at
)
SELECT id,job_id,parent_attempt_id,status,progress_json,stop_reason,project_revision,project_digest,
  COALESCE((SELECT options_json FROM exports WHERE exports.id=export_attempts_legacy_0009.job_id),'{}'),options_digest,input_closure_digest,NULL,renderer_digest,
  capture_digest,output_digest,receipt_digest,findings_json,retention_json,NULL,created_at,updated_at
FROM export_attempts_legacy_0009;
CREATE INDEX idx_export_attempts_job ON export_attempts(job_id, created_at);
CREATE UNIQUE INDEX uq_export_attempts_nonterminal ON export_attempts(job_id)
  WHERE status IN ('pending','running','validating','retrying','recovering');
CREATE UNIQUE INDEX uq_export_attempts_parent ON export_attempts(parent_attempt_id)
  WHERE parent_attempt_id IS NOT NULL;

DROP TABLE export_attempts_legacy_0009;
DROP TABLE exports_legacy_0009;
