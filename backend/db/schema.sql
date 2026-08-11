-- Платформа код-рев'ю — схема БД (PostgreSQL)

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- для gen_random_uuid()

CREATE TYPE user_role AS ENUM ('admin', 'reviewer', 'author');
CREATE TYPE member_role AS ENUM ('admin', 'reviewer', 'author');
CREATE TYPE review_status AS ENUM ('open', 'approved', 'changes_requested');

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          VARCHAR(255) NOT NULL,
    role          user_role NOT NULL DEFAULT 'author',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

CREATE TABLE projects (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(255) NOT NULL,
    owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_owner_id ON projects(owner_id);

CREATE TABLE project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       member_role NOT NULL DEFAULT 'author',
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX idx_project_members_user_id ON project_members(user_id);

CREATE TABLE reviews (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title         VARCHAR(255) NOT NULL,
    code_snapshot TEXT NOT NULL,
    author_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        review_status NOT NULL DEFAULT 'open',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_project_id ON reviews(project_id);
CREATE INDEX idx_reviews_author_id ON reviews(author_id);
CREATE INDEX idx_reviews_status ON reviews(status);

-- Every code push to a review (including the first one, at creation) is a
-- row here. reviews.code_snapshot always mirrors the latest revision's
-- code_snapshot, so existing reads of a review don't need to change; this
-- table exists purely to power the diff view between any two versions.
CREATE TABLE review_revisions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id     UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL,
    code_snapshot TEXT NOT NULL,
    author_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (review_id, revision_number)
);
CREATE INDEX idx_review_revisions_review_id ON review_revisions(review_id);

CREATE TABLE comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id   UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    line_number INTEGER,
    author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    parent_id   UUID REFERENCES comments(id) ON DELETE CASCADE,
    -- "Resolved" applies to a whole thread — only meaningful on a top-level
    -- comment (parent_id IS NULL); replies inherit the parent's state in
    -- the API/UI rather than tracking their own.
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_review_id ON comments(review_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
CREATE INDEX idx_comments_author_id ON comments(author_id);

CREATE TYPE notification_type AS ENUM ('reply', 'mention');

CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       notification_type NOT NULL,
    review_id  UUID REFERENCES reviews(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_id ON notifications(user_id, read_at);
