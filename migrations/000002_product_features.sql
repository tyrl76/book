ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS default_visibility text NOT NULL DEFAULT 'friends'
        CHECK (default_visibility IN ('private', 'friends', 'group', 'public')),
    ADD COLUMN IF NOT EXISTS progress_precision text NOT NULL DEFAULT 'milestone'
        CHECK (progress_precision IN ('hidden', 'milestone', 'exact'));

ALTER TABLE progress_entries
    ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0
        CHECK (duration_seconds >= 0 AND duration_seconds <= 86400);

CREATE TABLE IF NOT EXISTS friend_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inviter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    accepted_by uuid REFERENCES users(id) ON DELETE SET NULL,
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anchored_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_event_id uuid NOT NULL REFERENCES feed_events(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id uuid REFERENCES anchored_comments(id) ON DELETE CASCADE,
    normalized_anchor integer NOT NULL CHECK (normalized_anchor BETWEEN 0 AND 10000),
    reveal_policy text NOT NULL DEFAULT 'after_position'
        CHECK (reveal_policy IN ('always', 'after_position', 'finished')),
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type text NOT NULL CHECK (target_type IN ('user', 'feed_event', 'comment')),
    target_id uuid NOT NULL,
    reason text NOT NULL CHECK (reason IN ('spoiler', 'harassment', 'spam', 'privacy', 'other')),
    detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 1000),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    push_enabled boolean NOT NULL DEFAULT true,
    friend_requests boolean NOT NULL DEFAULT true,
    comments boolean NOT NULL DEFAULT true,
    milestones boolean NOT NULL DEFAULT false,
    daily_digest boolean NOT NULL DEFAULT true,
    quiet_start time,
    quiet_end time,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_push_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    token text NOT NULL UNIQUE,
    enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reading_goals (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year integer NOT NULL CHECK (year BETWEEN 2000 AND 2200),
    target_books integer NOT NULL CHECK (target_books BETWEEN 1 AND 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, year)
);

CREATE INDEX IF NOT EXISTS friend_invites_inviter_created_idx
    ON friend_invites (inviter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS friend_invites_active_token_idx
    ON friend_invites (token, expires_at) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS anchored_comments_event_created_idx
    ON anchored_comments (feed_event_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS reports_status_created_idx
    ON reports (status, created_at);
CREATE INDEX IF NOT EXISTS device_push_tokens_user_idx
    ON device_push_tokens (user_id, enabled);
