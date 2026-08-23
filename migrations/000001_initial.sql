CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleting')),
    locale text NOT NULL DEFAULT 'ko-KR',
    timezone text NOT NULL DEFAULT 'Asia/Seoul',
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE profiles (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    nickname text NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 40),
    avatar_url text,
    bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 160),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE friendships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_low uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_high uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'removed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz,
    CHECK (requester_id <> addressee_id),
    CHECK (user_low < user_high),
    UNIQUE (user_low, user_high)
);

CREATE TABLE blocks (
    blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

CREATE TABLE works (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    author text NOT NULL,
    cover_color text NOT NULL DEFAULT '#C9725B',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE editions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    isbn13 text UNIQUE,
    publisher text,
    language text NOT NULL DEFAULT 'ko',
    page_count integer CHECK (page_count > 0),
    audio_seconds integer CHECK (audio_seconds > 0),
    cover_url text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reading_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    edition_id uuid NOT NULL REFERENCES editions(id),
    status text NOT NULL CHECK (status IN ('want_to_read', 'reading', 'paused', 'finished', 'dnf')),
    progress_basis text NOT NULL CHECK (progress_basis IN ('pages', 'percent', 'audio_seconds')),
    current_value double precision NOT NULL DEFAULT 0 CHECK (current_value >= 0),
    total_value double precision NOT NULL CHECK (total_value > 0),
    normalized_progress integer NOT NULL DEFAULT 0 CHECK (normalized_progress BETWEEN 0 AND 10000),
    visibility text NOT NULL DEFAULT 'friends' CHECK (visibility IN ('private', 'friends', 'group', 'public')),
    progress_precision text NOT NULL DEFAULT 'milestone' CHECK (progress_precision IN ('hidden', 'milestone', 'exact')),
    auto_share boolean NOT NULL DEFAULT true,
    run_number integer NOT NULL DEFAULT 1 CHECK (run_number > 0),
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, edition_id, run_number)
);

CREATE TABLE progress_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reading_run_id uuid NOT NULL REFERENCES reading_runs(id) ON DELETE CASCADE,
    client_operation_id uuid NOT NULL,
    previous_value double precision NOT NULL,
    new_value double precision NOT NULL,
    previous_normalized_progress integer NOT NULL CHECK (previous_normalized_progress BETWEEN 0 AND 10000),
    new_normalized_progress integer NOT NULL CHECK (new_normalized_progress BETWEEN 0 AND 10000),
    source text NOT NULL CHECK (source IN ('timer', 'manual', 'import')),
    note text CHECK (char_length(note) <= 280),
    is_correction boolean NOT NULL DEFAULT false,
    recorded_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    corrected_at timestamptz,
    UNIQUE (reading_run_id, client_operation_id)
);

CREATE TABLE feed_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reading_run_id uuid NOT NULL REFERENCES reading_runs(id) ON DELETE CASCADE,
    progress_entry_id uuid NOT NULL REFERENCES progress_entries(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('started', 'milestone_25', 'milestone_50', 'milestone_75', 'finished', 'dnf', 'shared_note', 'weekly_group')),
    visibility text NOT NULL CHECK (visibility IN ('private', 'friends', 'group', 'public')),
    note text CHECK (char_length(note) <= 280),
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    superseded_at timestamptz
);

CREATE TABLE reactions (
    feed_event_id uuid NOT NULL REFERENCES feed_events(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL DEFAULT 'cheer' CHECK (kind IN ('cheer')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (feed_event_id, user_id)
);

CREATE TABLE outbox_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reading_runs_user_status_idx ON reading_runs (user_id, status, updated_at DESC);
CREATE INDEX progress_entries_run_recorded_idx ON progress_entries (reading_run_id, recorded_at DESC);
CREATE INDEX feed_events_actor_occurred_idx ON feed_events (actor_id, occurred_at DESC, id DESC);
CREATE UNIQUE INDEX feed_events_active_milestone_uidx ON feed_events (reading_run_id, type) WHERE superseded_at IS NULL;
CREATE INDEX friendships_pair_status_idx ON friendships (user_low, user_high, status);
CREATE INDEX outbox_pending_idx ON outbox_events (available_at, created_at) WHERE processed_at IS NULL;
