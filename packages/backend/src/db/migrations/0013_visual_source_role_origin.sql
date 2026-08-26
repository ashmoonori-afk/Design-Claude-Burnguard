ALTER TABLE attachments
ADD COLUMN source_role_explicit INTEGER NOT NULL DEFAULT 0
CHECK(source_role_explicit IN (0,1));
