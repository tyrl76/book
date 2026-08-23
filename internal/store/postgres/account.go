package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/datau/book/internal/api"
	"github.com/jackc/pgx/v5"
)

func (s *Store) GetProfile(ctx context.Context, userID string) (api.Profile, error) {
	var item api.Profile
	err := s.pool.QueryRow(ctx, `
		SELECT p.user_id::text, p.nickname, COALESCE(p.avatar_url, ''), p.bio,
		       p.default_visibility, p.progress_precision,
		       (SELECT COUNT(*)::int FROM friendships f
		        WHERE f.status = 'accepted' AND (f.user_low = p.user_id OR f.user_high = p.user_id))
		FROM profiles p WHERE p.user_id = $1::uuid`, userID).
		Scan(&item.UserID, &item.Nickname, &item.AvatarURL, &item.Bio,
			&item.DefaultVisibility, &item.ProgressPrecision, &item.FriendCount)
	if errors.Is(err, pgx.ErrNoRows) {
		if err := s.EnsureUser(ctx, userID, ""); err != nil {
			return api.Profile{}, err
		}
		return s.GetProfile(ctx, userID)
	}
	if err != nil {
		return api.Profile{}, fmt.Errorf("get profile: %w", err)
	}
	return item, nil
}

func (s *Store) UpdateProfile(ctx context.Context, userID string, command api.UpdateProfileCommand) (api.Profile, error) {
	if err := s.EnsureUser(ctx, userID, ""); err != nil {
		return api.Profile{}, err
	}
	_, err := s.pool.Exec(ctx, `
		UPDATE profiles
		SET nickname = COALESCE($2, nickname),
		    bio = COALESCE($3, bio),
		    default_visibility = COALESCE($4, default_visibility),
		    progress_precision = COALESCE($5, progress_precision),
		    updated_at = now()
		WHERE user_id = $1::uuid`, userID, command.Nickname, command.Bio, command.DefaultVisibility, command.ProgressPrecision)
	if err != nil {
		return api.Profile{}, fmt.Errorf("update profile: %w", err)
	}
	return s.GetProfile(ctx, userID)
}

func (s *Store) UpdateReadingRun(ctx context.Context, userID, runID string, command api.UpdateReadingRunCommand) (api.ReadingRun, error) {
	var item api.ReadingRun
	err := s.pool.QueryRow(ctx, `
		WITH updated AS (
			UPDATE reading_runs
			SET status = COALESCE($3, status),
			    visibility = COALESCE($4, visibility),
			    progress_precision = COALESCE($5, progress_precision),
			    auto_share = COALESCE($6, auto_share),
			    share_group_id = CASE
			        WHEN $4 IS NOT NULL AND $4 <> 'group' THEN NULL
			        WHEN $4 = 'group' THEN NULLIF($7, '')::uuid
			        ELSE share_group_id
			    END,
			    started_at = CASE WHEN $3 = 'reading' THEN COALESCE(started_at, now()) ELSE started_at END,
			    finished_at = CASE
			        WHEN $3 = 'finished' THEN COALESCE(finished_at, now())
			        WHEN $3 IS NOT NULL AND $3 <> 'finished' THEN NULL
			        ELSE finished_at
			    END,
			    normalized_progress = CASE WHEN $3 = 'finished' THEN 10000 ELSE normalized_progress END,
			    current_value = CASE WHEN $3 = 'finished' THEN total_value ELSE current_value END,
			    updated_at = now()
			WHERE id = $1::uuid AND user_id = $2::uuid
			  AND ($4 IS DISTINCT FROM 'group' OR EXISTS (
			      SELECT 1 FROM group_members gm
			      WHERE gm.group_id = NULLIF($7, '')::uuid AND gm.user_id = $2::uuid
			  ))
			RETURNING *
		)
		SELECT updated.id::text, w.title, w.author, COALESCE(e.cover_url, ''), w.cover_color,
		       updated.status, updated.progress_basis, updated.current_value, updated.total_value,
		       updated.normalized_progress, updated.visibility, COALESCE(updated.share_group_id::text, ''), updated.progress_precision, updated.auto_share,
		       updated.run_number, updated.started_at, updated.finished_at, updated.updated_at
		FROM updated JOIN editions e ON e.id = updated.edition_id JOIN works w ON w.id = e.work_id`,
		runID, userID, command.Status, command.Visibility, command.ProgressPrecision, command.AutoShare, command.ShareGroupID).
		Scan(&item.ID, &item.Title, &item.Author, &item.CoverURL, &item.CoverColor,
			&item.Status, &item.ProgressBasis, &item.CurrentValue, &item.TotalValue,
			&item.NormalizedProgress, &item.Visibility, &item.ShareGroupID, &item.ProgressPrecision, &item.AutoShare,
			&item.RunNumber, &item.StartedAt, &item.FinishedAt, &item.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return api.ReadingRun{}, api.ErrNotFound
	}
	if err != nil {
		return api.ReadingRun{}, fmt.Errorf("update reading run: %w", err)
	}
	return item, nil
}

func (s *Store) ListProgressEntries(ctx context.Context, userID, runID string) ([]api.ProgressEntry, error) {
	var owned bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM reading_runs WHERE id = $1::uuid AND user_id = $2::uuid)`, runID, userID).Scan(&owned); err != nil {
		return nil, fmt.Errorf("check progress owner: %w", err)
	}
	if !owned {
		return nil, api.ErrNotFound
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, previous_value, new_value, new_normalized_progress,
		       COALESCE(note, ''), duration_seconds, is_correction, recorded_at
		FROM progress_entries WHERE reading_run_id = $1::uuid
		ORDER BY recorded_at DESC, id DESC`, runID)
	if err != nil {
		return nil, fmt.Errorf("list progress entries: %w", err)
	}
	defer rows.Close()
	items := make([]api.ProgressEntry, 0)
	for rows.Next() {
		var item api.ProgressEntry
		if err := rows.Scan(&item.ID, &item.PreviousValue, &item.NewValue, &item.NormalizedProgress,
			&item.Note, &item.DurationSeconds, &item.Correction, &item.RecordedAt); err != nil {
			return nil, fmt.Errorf("scan progress entry: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) GetReadingStats(ctx context.Context, userID string, year int) (api.ReadingStats, error) {
	item := api.ReadingStats{Year: year, Calendar: make([]api.DailyReading, 0)}
	err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FILTER (WHERE status = 'reading')::int,
		       COUNT(*) FILTER (WHERE status = 'want_to_read')::int,
		       COUNT(*) FILTER (WHERE status = 'paused')::int,
		       COUNT(*) FILTER (WHERE status = 'finished')::int,
		       COUNT(*) FILTER (WHERE status = 'dnf')::int,
		       COUNT(*) FILTER (WHERE status = 'finished' AND EXTRACT(YEAR FROM finished_at AT TIME ZONE 'Asia/Seoul') = $2)::int
		FROM reading_runs WHERE user_id = $1::uuid`, userID, year).
		Scan(&item.Reading, &item.WantToRead, &item.Paused, &item.Finished, &item.DNF, &item.AnnualFinishedBooks)
	if err != nil {
		return api.ReadingStats{}, fmt.Errorf("count reading stats: %w", err)
	}
	if err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(CASE WHEN rr.progress_basis = 'pages' THEN GREATEST(pe.new_value - pe.previous_value, 0) ELSE 0 END), 0),
		       COALESCE(SUM(pe.duration_seconds), 0)::int
		FROM progress_entries pe JOIN reading_runs rr ON rr.id = pe.reading_run_id
		WHERE rr.user_id = $1::uuid
		  AND EXTRACT(YEAR FROM pe.recorded_at AT TIME ZONE 'Asia/Seoul') = $2`, userID, year).
		Scan(&item.PagesRead, &item.DurationSeconds); err != nil {
		return api.ReadingStats{}, fmt.Errorf("sum reading stats: %w", err)
	}
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(target_books, 0) FROM reading_goals WHERE user_id = $1::uuid AND year = $2`, userID, year).
		Scan(&item.AnnualGoalBooks)

	rows, err := s.pool.Query(ctx, `
		SELECT to_char(pe.recorded_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD'),
		       COALESCE(SUM(CASE WHEN rr.progress_basis = 'pages' THEN GREATEST(pe.new_value - pe.previous_value, 0) ELSE 0 END), 0),
		       COALESCE(SUM(pe.duration_seconds), 0)::int,
		       COUNT(*)::int
		FROM progress_entries pe JOIN reading_runs rr ON rr.id = pe.reading_run_id
		WHERE rr.user_id = $1::uuid
		  AND EXTRACT(YEAR FROM pe.recorded_at AT TIME ZONE 'Asia/Seoul') = $2
		GROUP BY 1 ORDER BY 1`, userID, year)
	if err != nil {
		return api.ReadingStats{}, fmt.Errorf("calendar reading stats: %w", err)
	}
	for rows.Next() {
		var day api.DailyReading
		if err := rows.Scan(&day.Date, &day.Pages, &day.DurationSeconds, &day.Entries); err != nil {
			rows.Close()
			return api.ReadingStats{}, fmt.Errorf("scan daily reading: %w", err)
		}
		item.Calendar = append(item.Calendar, day)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return api.ReadingStats{}, fmt.Errorf("iterate daily reading rows: %w", err)
	}
	item.CurrentStreakDays, item.LongestStreakDays = readingStreaks(item.Calendar)
	return item, nil
}

func readingStreaks(calendar []api.DailyReading) (current, longest int) {
	if len(calendar) == 0 {
		return 0, 0
	}
	dates := make([]time.Time, 0, len(calendar))
	for _, day := range calendar {
		parsed, err := time.Parse("2006-01-02", day.Date)
		if err == nil {
			dates = append(dates, parsed)
		}
	}
	sort.Slice(dates, func(i, j int) bool { return dates[i].Before(dates[j]) })
	run := 0
	for index, date := range dates {
		if index == 0 || date.Sub(dates[index-1]) == 24*time.Hour {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
	}
	seoul := time.FixedZone("Asia/Seoul", 9*60*60)
	today := time.Now().In(seoul)
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
	last := dates[len(dates)-1]
	if gap := int(today.Sub(last).Hours() / 24); gap == 0 || gap == 1 {
		current = 1
		for index := len(dates) - 1; index > 0; index-- {
			if dates[index].Sub(dates[index-1]) != 24*time.Hour {
				break
			}
			current++
		}
	}
	return current, longest
}

func (s *Store) GetNotificationPreferences(ctx context.Context, userID string) (api.NotificationPreferences, error) {
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO notification_preferences (user_id)
		VALUES ($1::uuid) ON CONFLICT DO NOTHING`, userID); err != nil {
		return api.NotificationPreferences{}, fmt.Errorf("ensure notification preferences: %w", err)
	}
	var item api.NotificationPreferences
	err := s.pool.QueryRow(ctx, `
		SELECT push_enabled, friend_requests, comments, milestones, daily_digest,
		       COALESCE(to_char(quiet_start, 'HH24:MI'), ''), COALESCE(to_char(quiet_end, 'HH24:MI'), '')
		FROM notification_preferences WHERE user_id = $1::uuid`, userID).
		Scan(&item.PushEnabled, &item.FriendRequests, &item.Comments, &item.Milestones,
			&item.DailyDigest, &item.QuietStart, &item.QuietEnd)
	if err != nil {
		return api.NotificationPreferences{}, fmt.Errorf("get notification preferences: %w", err)
	}
	return item, nil
}

func (s *Store) UpdateNotificationPreferences(ctx context.Context, userID string, item api.NotificationPreferences) (api.NotificationPreferences, error) {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO notification_preferences (
			user_id, push_enabled, friend_requests, comments, milestones, daily_digest, quiet_start, quiet_end, updated_at
		) VALUES ($1::uuid, $2, $3, $4, $5, $6, NULLIF($7, '')::time, NULLIF($8, '')::time, now())
		ON CONFLICT (user_id) DO UPDATE SET
			push_enabled = EXCLUDED.push_enabled,
			friend_requests = EXCLUDED.friend_requests,
			comments = EXCLUDED.comments,
			milestones = EXCLUDED.milestones,
			daily_digest = EXCLUDED.daily_digest,
			quiet_start = EXCLUDED.quiet_start,
			quiet_end = EXCLUDED.quiet_end,
			updated_at = now()`, userID, item.PushEnabled, item.FriendRequests, item.Comments,
		item.Milestones, item.DailyDigest, item.QuietStart, item.QuietEnd)
	if err != nil {
		return api.NotificationPreferences{}, fmt.Errorf("update notification preferences: %w", err)
	}
	return s.GetNotificationPreferences(ctx, userID)
}

func (s *Store) RegisterPushToken(ctx context.Context, userID, platform, token string) error {
	if err := s.EnsureUser(ctx, userID, ""); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO device_push_tokens (user_id, platform, token, enabled, updated_at)
		VALUES ($1::uuid, $2, $3, true, now())
		ON CONFLICT (token) DO UPDATE
		SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
		    enabled = true, updated_at = now()`, userID, platform, token)
	if err != nil {
		return fmt.Errorf("register push token: %w", err)
	}
	return nil
}

func (s *Store) DisablePushTokens(ctx context.Context, userID string) error {
	if _, err := s.pool.Exec(ctx, `
		UPDATE device_push_tokens SET enabled = false, updated_at = now()
		WHERE user_id = $1::uuid`, userID); err != nil {
		return fmt.Errorf("disable push tokens: %w", err)
	}
	return nil
}

func (s *Store) SetAnnualGoal(ctx context.Context, userID string, year, targetBooks int) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO reading_goals (user_id, year, target_books)
		VALUES ($1::uuid, $2, $3)
		ON CONFLICT (user_id, year) DO UPDATE SET target_books = EXCLUDED.target_books, updated_at = now()`,
		userID, year, targetBooks)
	if err != nil {
		return fmt.Errorf("set annual goal: %w", err)
	}
	return nil
}

func (s *Store) ExportUserData(ctx context.Context, userID string) (json.RawMessage, error) {
	var raw string
	err := s.pool.QueryRow(ctx, `
		SELECT jsonb_build_object(
			'exportedAt', now(),
			'profile', COALESCE((
				SELECT jsonb_build_object(
					'userId', p.user_id, 'nickname', p.nickname, 'bio', p.bio,
					'defaultVisibility', p.default_visibility, 'progressPrecision', p.progress_precision
				) FROM profiles p WHERE p.user_id = $1::uuid
			), '{}'::jsonb),
			'readingRuns', COALESCE((
				SELECT jsonb_agg(to_jsonb(rr) ORDER BY rr.created_at) FROM reading_runs rr WHERE rr.user_id = $1::uuid
			), '[]'::jsonb),
			'progressEntries', COALESCE((
				SELECT jsonb_agg(to_jsonb(pe) ORDER BY pe.recorded_at)
				FROM progress_entries pe JOIN reading_runs rr ON rr.id = pe.reading_run_id
				WHERE rr.user_id = $1::uuid
			), '[]'::jsonb),
			'comments', COALESCE((
				SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at) FROM anchored_comments c WHERE c.author_id = $1::uuid
			), '[]'::jsonb)
		)::text`, userID).Scan(&raw)
	if err != nil {
		return nil, fmt.Errorf("export user data: %w", err)
	}
	return json.RawMessage(raw), nil
}

func (s *Store) DeleteUser(ctx context.Context, userID string) error {
	result, err := s.pool.Exec(ctx, `DELETE FROM users WHERE id = $1::uuid`, userID)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	if result.RowsAffected() == 0 {
		return api.ErrNotFound
	}
	return nil
}

func (s *Store) RequestUserDeletion(ctx context.Context, userID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin request user deletion: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result, err := tx.Exec(ctx, `
		UPDATE users SET deletion_requested_at = COALESCE(deletion_requested_at, now())
		WHERE id = $1::uuid`, userID)
	if err != nil {
		return fmt.Errorf("mark user deletion requested: %w", err)
	}
	if result.RowsAffected() == 0 {
		return api.ErrNotFound
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO account_deletion_requests (user_id)
		VALUES ($1::uuid)
		ON CONFLICT (user_id) DO UPDATE
		SET status = 'pending', next_attempt_at = now(), updated_at = now(), last_error = ''
		WHERE account_deletion_requests.status <> 'completed'`, userID); err != nil {
		return fmt.Errorf("queue user deletion: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE device_push_tokens SET enabled = false, updated_at = now()
		WHERE user_id = $1::uuid`, userID); err != nil {
		return fmt.Errorf("disable deleting user push tokens: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM reading_presence WHERE user_id = $1::uuid`, userID); err != nil {
		return fmt.Errorf("clear deleting user presence: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE notification_deliveries nd
		SET status = 'failed', last_error = 'account_deletion_requested'
		FROM outbox_events oe
		WHERE nd.outbox_event_id = oe.id AND nd.status = 'pending'
		  AND (
		      nd.user_id = $1::uuid
		      OR $1::text IN (
		          COALESCE(oe.payload->>'actorId', ''),
		          COALESCE(oe.payload->>'authorId', ''),
		          COALESCE(oe.payload->>'userId', ''),
		          COALESCE(oe.payload->>'friendId', '')
		      )
		  )`, userID); err != nil {
		return fmt.Errorf("cancel deleting user notifications: %w", err)
	}
	return tx.Commit(ctx)
}

func (s *Store) MarkUserDeletionCompleted(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE account_deletion_requests
		SET status = 'completed', completed_at = now(), updated_at = now(), last_error = ''
		WHERE user_id = $1::uuid`, userID)
	if err != nil {
		return fmt.Errorf("mark user deletion completed: %w", err)
	}
	return nil
}

var _ api.AccountStore = (*Store)(nil)
var _ api.AccountDeletionStore = (*Store)(nil)
