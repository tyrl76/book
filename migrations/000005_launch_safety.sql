ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
    ADD COLUMN IF NOT EXISTS reviewed_by text,
    ADD COLUMN IF NOT EXISTS resolution text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS account_deletion_requests (
    user_id uuid PRIMARY KEY,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error text NOT NULL DEFAULT '',
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    requested_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS moderation_hidden_targets (
    target_type text NOT NULL CHECK (target_type IN ('user', 'feed_event', 'comment')),
    target_id uuid NOT NULL,
    reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 1000),
    hidden_by text NOT NULL,
    hidden_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (target_type, target_id)
);

CREATE TABLE IF NOT EXISTS user_sanctions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('warning', 'suspension', 'ban')),
    reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
    expires_at timestamptz,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    revoked_by text,
    CHECK ((kind = 'suspension' AND expires_at IS NOT NULL) OR (kind <> 'suspension' AND expires_at IS NULL))
);

CREATE TABLE IF NOT EXISTS moderation_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
    operator_id text NOT NULL,
    action text NOT NULL CHECK (action IN ('dismiss', 'hide', 'restore', 'warn', 'suspend', 'ban', 'revoke_sanction')),
    target_type text NOT NULL CHECK (target_type IN ('user', 'feed_event', 'comment')),
    target_id uuid NOT NULL,
    subject_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 1000),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_deletion_requests_due_idx
    ON account_deletion_requests (status, next_attempt_at)
    WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS user_sanctions_active_idx
    ON user_sanctions (user_id, kind, expires_at)
    WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS moderation_actions_created_idx
    ON moderation_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_hidden_targets_lookup_idx
    ON moderation_hidden_targets (target_type, target_id);
