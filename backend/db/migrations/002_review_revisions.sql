-- For databases created before diff-view existed. A fresh
-- `psql -f backend/db/schema.sql` already includes this table.
CREATE TABLE IF NOT EXISTS review_revisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id       UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL,
    code_snapshot   TEXT NOT NULL,
    author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (review_id, revision_number)
);
CREATE INDEX IF NOT EXISTS idx_review_revisions_review_id ON review_revisions(review_id);

-- Backfill: every existing review's current code_snapshot becomes its
-- revision 1, so the diff view has something to compare against even for
-- reviews created before this migration.
INSERT INTO review_revisions (review_id, revision_number, code_snapshot, author_id, created_at)
SELECT id, 1, code_snapshot, author_id, created_at
FROM reviews
WHERE NOT EXISTS (
    SELECT 1 FROM review_revisions rr WHERE rr.review_id = reviews.id
);
