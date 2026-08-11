-- For databases created before notifications existed. A fresh
-- `psql -f backend/db/schema.sql` already includes this.
DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM ('reply', 'mention');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       notification_type NOT NULL,
    review_id  UUID REFERENCES reviews(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, read_at);
