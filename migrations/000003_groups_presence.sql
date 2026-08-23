CREATE TABLE IF NOT EXISTS reading_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
    group_id uuid NOT NULL REFERENCES reading_groups(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL REFERENCES reading_groups(id) ON DELETE CASCADE,
    inviter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    accepted_by uuid REFERENCES users(id) ON DELETE SET NULL,
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reading_presence (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    reading_run_id uuid NOT NULL REFERENCES reading_runs(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours')
);

ALTER TABLE reading_runs
    ADD COLUMN IF NOT EXISTS share_group_id uuid REFERENCES reading_groups(id) ON DELETE SET NULL;

ALTER TABLE feed_events
    ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES reading_groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members (user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS group_invites_active_token_idx ON group_invites (token, expires_at) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS reading_presence_expires_idx ON reading_presence (expires_at);
CREATE INDEX IF NOT EXISTS feed_events_group_occurred_idx ON feed_events (group_id, occurred_at DESC) WHERE group_id IS NOT NULL;
