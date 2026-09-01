package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/datau/book/internal/api"
	"github.com/datau/book/internal/reading"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func Open(ctx context.Context, databaseURL string) (*Store, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database URL: %w", err)
	}
	config.MaxConns = 10
	config.MinConns = 1
	config.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

func (s *Store) ListReadingRuns(ctx context.Context, userID string) ([]api.ReadingRun, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT rr.id::text, COALESCE(e.isbn13, ''), w.title, w.author, COALESCE(e.cover_url, ''), w.cover_color,
		       rr.status, rr.progress_basis, rr.current_value, rr.total_value,
		       rr.normalized_progress, rr.visibility, COALESCE(rr.share_group_id::text, ''), rr.progress_precision, rr.auto_share,
		       rr.run_number, rr.started_at, rr.finished_at, rr.updated_at
		FROM reading_runs rr
		JOIN editions e ON e.id = rr.edition_id
		JOIN works w ON w.id = e.work_id
		WHERE rr.user_id = $1::uuid
		ORDER BY rr.updated_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list reading runs: %w", err)
	}
	defer rows.Close()

	items := make([]api.ReadingRun, 0)
	for rows.Next() {
		var item api.ReadingRun
		if err := rows.Scan(&item.ID, &item.ISBN, &item.Title, &item.Author, &item.CoverURL, &item.CoverColor,
			&item.Status, &item.ProgressBasis, &item.CurrentValue, &item.TotalValue,
			&item.NormalizedProgress, &item.Visibility, &item.ShareGroupID, &item.ProgressPrecision, &item.AutoShare,
			&item.RunNumber, &item.StartedAt, &item.FinishedAt, &item.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan reading run: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate reading runs: %w", err)
	}
	return items, nil
}

func (s *Store) ListFeed(ctx context.Context, userID string, limit int) ([]api.FeedEvent, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT fe.id::text, fe.actor_id::text, p.nickname, w.title, w.author,
		       COALESCE(e.cover_url, ''), w.cover_color, fe.type,
		       pe.new_normalized_progress, COALESCE(fe.note, ''),
		       (SELECT COUNT(*)::int FROM reactions r
		        WHERE r.feed_event_id = fe.id
		          AND NOT EXISTS (
		              SELECT 1 FROM moderation_hidden_targets hidden_reactor
		              WHERE hidden_reactor.target_type = 'user' AND hidden_reactor.target_id = r.user_id
		          )),
		       EXISTS(SELECT 1 FROM reactions r WHERE r.feed_event_id = fe.id AND r.user_id = $1::uuid),
		       (SELECT COUNT(*)::int FROM anchored_comments c
		        WHERE c.feed_event_id = fe.id AND c.deleted_at IS NULL
		          AND NOT EXISTS (
		              SELECT 1 FROM moderation_hidden_targets hidden_comment
		              WHERE hidden_comment.target_type = 'comment' AND hidden_comment.target_id = c.id
		          )
		          AND NOT EXISTS (
		              SELECT 1 FROM moderation_hidden_targets hidden_author
		              WHERE hidden_author.target_type = 'user' AND hidden_author.target_id = c.author_id
		          )
		          AND EXISTS (
		              SELECT 1 FROM users comment_author
		              WHERE comment_author.id = c.author_id AND comment_author.deletion_requested_at IS NULL
		          )),
		       COALESCE(fe.group_id::text, ''),
		       fe.occurred_at
		FROM feed_events fe
		JOIN users actor_user ON actor_user.id = fe.actor_id AND actor_user.deletion_requested_at IS NULL
		JOIN profiles p ON p.user_id = fe.actor_id
		JOIN reading_runs rr ON rr.id = fe.reading_run_id
		JOIN editions e ON e.id = rr.edition_id
		JOIN works w ON w.id = e.work_id
		JOIN progress_entries pe ON pe.id = fe.progress_entry_id
		WHERE fe.superseded_at IS NULL
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_feed
		      WHERE hidden_feed.target_type = 'feed_event' AND hidden_feed.target_id = fe.id
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_actor
		      WHERE hidden_actor.target_type = 'user' AND hidden_actor.target_id = fe.actor_id
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM blocks b
		      WHERE (b.blocker_id = $1::uuid AND b.blocked_id = fe.actor_id)
		         OR (b.blocker_id = fe.actor_id AND b.blocked_id = $1::uuid)
		  )
		  AND (
		      fe.actor_id = $1::uuid
		      OR (fe.visibility = 'friends' AND EXISTS (
		          SELECT 1 FROM friendships f
		          WHERE f.status = 'accepted'
		            AND f.user_low = LEAST($1::uuid, fe.actor_id)
		            AND f.user_high = GREATEST($1::uuid, fe.actor_id)
		      ))
		      OR (fe.visibility = 'group' AND EXISTS (
		          SELECT 1 FROM group_members gm
		          WHERE gm.group_id = fe.group_id AND gm.user_id = $1::uuid
		      ))
		      OR fe.visibility = 'public'
		  )
		ORDER BY fe.occurred_at DESC, fe.id DESC
		LIMIT $2`, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("list feed: %w", err)
	}
	defer rows.Close()

	items := make([]api.FeedEvent, 0)
	for rows.Next() {
		var item api.FeedEvent
		if err := rows.Scan(&item.ID, &item.ActorID, &item.ActorNickname, &item.Title, &item.Author,
			&item.CoverURL, &item.CoverColor, &item.Type, &item.NormalizedProgress, &item.Note,
			&item.ReactionCount, &item.ReactedByViewer, &item.CommentCount, &item.GroupID, &item.OccurredAt); err != nil {
			return nil, fmt.Errorf("scan feed event: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate feed events: %w", err)
	}
	return items, nil
}

func (s *Store) RecordProgress(ctx context.Context, userID, runID string, command api.RecordProgressCommand) (api.RecordProgressResult, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return api.RecordProgressResult{}, fmt.Errorf("begin record progress: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var currentValue, totalValue float64
	var previousNormalized int
	var autoShare bool
	var visibility, currentStatus, shareGroupID string
	err = tx.QueryRow(ctx, `
		SELECT current_value, total_value, normalized_progress, auto_share, visibility, status,
		       COALESCE(share_group_id::text, '')
		FROM reading_runs
		WHERE id = $1::uuid AND user_id = $2::uuid
		FOR UPDATE`, runID, userID).Scan(&currentValue, &totalValue, &previousNormalized, &autoShare, &visibility, &currentStatus, &shareGroupID)
	if errors.Is(err, pgx.ErrNoRows) {
		return api.RecordProgressResult{}, api.ErrNotFound
	}
	if err != nil {
		return api.RecordProgressResult{}, fmt.Errorf("lock reading run: %w", err)
	}

	var existing api.RecordProgressResult
	err = tx.QueryRow(ctx, `
		SELECT id::text, new_value, new_normalized_progress
		FROM progress_entries
		WHERE reading_run_id = $1::uuid AND client_operation_id = $2::uuid`, runID, command.ClientOperationID).
		Scan(&existing.EntryID, &existing.CurrentValue, &existing.NormalizedProgress)
	if err == nil {
		existing.IdempotentReplay = true
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return api.RecordProgressResult{}, fmt.Errorf("check idempotency key: %w", err)
	}

	if command.CurrentValue > totalValue {
		return api.RecordProgressResult{}, fmt.Errorf("%w: 진척값은 전체 분량을 넘을 수 없습니다", api.ErrInvalid)
	}
	if command.CurrentValue < currentValue && !command.Correction {
		return api.RecordProgressResult{}, fmt.Errorf("%w: 진척을 낮추려면 correction=true가 필요합니다", api.ErrConflict)
	}

	normalized := reading.Normalize(command.CurrentValue, totalValue)
	result := api.RecordProgressResult{CurrentValue: command.CurrentValue, NormalizedProgress: normalized}
	err = tx.QueryRow(ctx, `
		INSERT INTO progress_entries (
			reading_run_id, client_operation_id, previous_value, new_value,
			previous_normalized_progress, new_normalized_progress, source, recorded_at, note, is_correction, duration_seconds
		) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'manual', $7, NULLIF($8, ''), $9, $10)
		RETURNING id::text`, runID, command.ClientOperationID, currentValue, command.CurrentValue,
		previousNormalized, normalized, command.RecordedAt, command.Note, command.Correction, command.DurationSeconds).Scan(&result.EntryID)
	if err != nil {
		return api.RecordProgressResult{}, fmt.Errorf("insert progress entry: %w", err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE reading_runs
		SET current_value = $2,
		    normalized_progress = $3,
		    status = CASE
		        WHEN $3 = 10000 THEN 'finished'
		        WHEN $3 < 10000 AND ($5 OR $6 IN ('paused', 'finished')) THEN 'reading'
		        ELSE status
		    END,
		    finished_at = CASE
		        WHEN $3 = 10000 THEN COALESCE(finished_at, $4)
		        WHEN $5 AND $6 = 'finished' THEN NULL
		        ELSE finished_at
		    END,
		    updated_at = now()
		WHERE id = $1::uuid`, runID, command.CurrentValue, normalized, command.RecordedAt, command.Correction, currentStatus)
	if err != nil {
		return api.RecordProgressResult{}, fmt.Errorf("update reading run: %w", err)
	}

	if command.Correction {
		_, err = tx.Exec(ctx, `
			WITH superseded AS (
				UPDATE feed_events
				SET superseded_at = now()
				WHERE reading_run_id = $1::uuid
				  AND superseded_at IS NULL
				  AND CASE type
				      WHEN 'finished' THEN 10000
				      WHEN 'milestone_75' THEN 7500
				      WHEN 'milestone_50' THEN 5000
				      WHEN 'milestone_25' THEN 2500
				      ELSE 0
				  END > $2
				RETURNING id
			)
			UPDATE outbox_events
			SET processed_at = now(), last_error = 'superseded_by_progress_correction'
			WHERE aggregate_type = 'feed_event'
			  AND aggregate_id IN (SELECT id FROM superseded)
			  AND processed_at IS NULL`, runID, normalized)
		if err != nil {
			return api.RecordProgressResult{}, fmt.Errorf("supersede corrected feed events: %w", err)
		}
	}

	milestone := reading.CrossedMilestone(previousNormalized, normalized)
	if autoShare && milestone != "" {
		var feedEventID string
		err = tx.QueryRow(ctx, `
			INSERT INTO feed_events (actor_id, reading_run_id, progress_entry_id, type, visibility, note, occurred_at, group_id)
			VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, NULLIF($6, ''), $7, NULLIF($8, '')::uuid)
			ON CONFLICT (reading_run_id, type) WHERE superseded_at IS NULL DO NOTHING
			RETURNING id::text`, userID, runID, result.EntryID, milestone, visibility, command.Note, command.RecordedAt, shareGroupID).
			Scan(&feedEventID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return api.RecordProgressResult{}, fmt.Errorf("insert feed event: %w", err)
		}
		if err == nil {
			_, err = tx.Exec(ctx, `
				INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
				VALUES ('feed_event', $1::uuid, 'feed_event.created', jsonb_build_object('feedEventId', $1::text, 'actorId', $2::text))`,
				feedEventID, userID)
			if err != nil {
				return api.RecordProgressResult{}, fmt.Errorf("insert outbox event: %w", err)
			}
			result.Milestone = milestone
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return api.RecordProgressResult{}, fmt.Errorf("commit record progress: %w", err)
	}
	return result, nil
}
