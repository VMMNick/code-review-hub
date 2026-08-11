-- For databases created before resolved/unresolved comments existed.
-- A fresh `psql -f backend/db/schema.sql` already includes these columns.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id) ON DELETE SET NULL;
