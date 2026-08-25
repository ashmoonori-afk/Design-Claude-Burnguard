CREATE TABLE research_runs (
  id TEXT NOT NULL PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending','running','finalizing','recovering','completed','partial','cancelled','failed','corrupt')),
  mode TEXT NOT NULL CHECK(mode IN ('live','fixture')),
  fixture_id TEXT,
  request_json TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  orchestrator_digest TEXT NOT NULL,
  evidence_set_digest TEXT,
  result_json TEXT,
  result_digest TEXT,
  usable INTEGER NOT NULL DEFAULT 0 CHECK(usable IN (0,1)),
  stop_reason TEXT CHECK(stop_reason IN ('partial_sources','user_cancelled','no_usable_result','orchestration_failed','persisted_data_corrupt')),
  cancel_requested_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  CHECK((mode='fixture') = (fixture_id IS NOT NULL)),
  CHECK((status IN ('completed','partial')) = (result_json IS NOT NULL)),
  CHECK((status IN ('completed','partial')) = (result_digest IS NOT NULL)),
  CHECK((status IN ('completed','partial')) = (evidence_set_digest IS NOT NULL)),
  CHECK((status IN ('completed','partial')) = (usable=1))
);
CREATE INDEX idx_research_runs_prompt ON research_runs(usable, completed_at DESC);

CREATE TABLE research_sources (
  id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('web','repository','document','fixture')),
  locator TEXT NOT NULL,
  canonical_locator TEXT NOT NULL,
  dedup_key TEXT NOT NULL,
  duplicate_of_source_id TEXT REFERENCES research_sources(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('pending','running','recovering','succeeded','failed','duplicate','cancelled','corrupt')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  http_status INTEGER,
  content_digest TEXT,
  evidence_json TEXT,
  finding_json TEXT,
  finding_digest TEXT,
  error_code TEXT CHECK(error_code IN ('source_timeout','fetch_failed','malformed_source','worker_failed','invalid_worker_output','user_cancelled','persisted_data_corrupt')),
  error_message TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(run_id, ordinal),
  CHECK((status='duplicate') = (duplicate_of_source_id IS NOT NULL)),
  CHECK(status!='succeeded' OR (content_digest IS NOT NULL AND evidence_json IS NOT NULL AND finding_json IS NOT NULL AND finding_digest IS NOT NULL))
);
CREATE UNIQUE INDEX uq_research_sources_canonical ON research_sources(run_id, dedup_key) WHERE duplicate_of_source_id IS NULL;
CREATE INDEX idx_research_sources_claim ON research_sources(run_id, status, ordinal);
