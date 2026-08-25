ALTER TABLE design_systems ADD COLUMN catalog_kind TEXT NOT NULL DEFAULT 'design-system'
  CHECK(catalog_kind IN ('design-system','pattern-library','template'));
ALTER TABLE design_systems ADD COLUMN catalog_owner TEXT NOT NULL DEFAULT 'local'
  CHECK(catalog_owner = 'local');
ALTER TABLE design_systems ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'active'
  CHECK(lifecycle IN ('active','archived','trashed'));
ALTER TABLE design_systems ADD COLUMN provenance_state TEXT NOT NULL DEFAULT 'unknown'
  CHECK(provenance_state IN ('observed','inferred','defaulted','unknown','conflicted'));
ALTER TABLE design_systems ADD COLUMN license_state TEXT NOT NULL DEFAULT 'unknown'
  CHECK(license_state IN ('verified','declared','unknown','restricted'));
ALTER TABLE design_systems ADD COLUMN trashed_at INTEGER;

ALTER TABLE design_system_receipts ADD COLUMN operation TEXT NOT NULL DEFAULT 'content'
  CHECK(operation IN ('content','duplicate','derive','trash','restore','purge'));
ALTER TABLE design_system_receipts ADD COLUMN parent_system_id TEXT;
ALTER TABLE design_system_receipts ADD COLUMN parent_receipt_id TEXT;
ALTER TABLE design_system_receipts ADD COLUMN parent_digest TEXT;
ALTER TABLE design_system_receipts ADD COLUMN reason TEXT;
ALTER TABLE design_system_receipts ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE design_system_receipts ADD COLUMN source_path TEXT;
ALTER TABLE design_system_receipts ADD COLUMN destination_path TEXT;

CREATE INDEX idx_design_system_catalog ON design_systems(lifecycle, catalog_kind, updated_at, id);
CREATE INDEX idx_design_system_receipt_operation ON design_system_receipts(design_system_id, operation, created_at);
CREATE UNIQUE INDEX uq_design_system_nonterminal_receipt ON design_system_receipts(design_system_id)
  WHERE operation != 'content' AND status IN ('prepared','recovering');
