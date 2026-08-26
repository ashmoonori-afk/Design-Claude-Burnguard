ALTER TABLE attachments
ADD COLUMN source_role TEXT NOT NULL DEFAULT 'ordinary_content'
CHECK(source_role IN ('ordinary_content','immutable_reference'));
