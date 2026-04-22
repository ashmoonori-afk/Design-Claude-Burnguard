-- P2.4 bugfix: anchor comments to a specific slide inside deck.html.
-- Nullable — prototype projects (single HTML file) leave it NULL.

ALTER TABLE comments ADD COLUMN slide_index INTEGER;
