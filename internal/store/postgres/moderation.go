package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/datau/book/internal/api"
	"github.com/jackc/pgx/v5"
)

func (s *Store) GetUserAccess(ctx context.Context, userID string) (api.UserAccess, error) {
	var deletionRequestedAt *time.Time
	var sanctionKind, deletionStatus string
	err := s.pool.QueryRow(ctx, `
		SELECT u.deletion_requested_at, COALESCE(active.kind, ''), COALESCE(deletion.status, '')
		FROM (SELECT $1::uuid AS id) requested
		LEFT JOIN users u ON u.id = requested.id
		LEFT JOIN account_deletion_requests deletion ON deletion.user_id = requested.id
		LEFT JOIN LATERAL (
			SELECT kind FROM user_sanctions
			WHERE user_id = u.id AND revoked_at IS NULL
			  AND kind IN ('suspension', 'ban')
			  AND (kind = 'ban' OR expires_at > now())
			ORDER BY CASE kind WHEN 'ban' THEN 0 ELSE 1 END, created_at DESC
			LIMIT 1
		) active ON true`, userID).Scan(&deletionRequestedAt, &sanctionKind, &deletionStatus)
	if err != nil {
		return api.UserAccess{}, fmt.Errorf("get user access: %w", err)
	}
	if deletionStatus == "completed" {
		return api.UserAccess{Allowed: false, Code: "account_deleted", Message: "삭제된 계정입니다"}, nil
	}
	if deletionRequestedAt != nil || deletionStatus != "" {
		return api.UserAccess{Allowed: false, Code: "account_deletion_pending", Message: "계정 삭제를 처리하고 있습니다"}, nil
	}
	if sanctionKind == "ban" {
		return api.UserAccess{Allowed: false, Code: "account_banned", Message: "운영 정책에 따라 계정 이용이 제한되었습니다"}, nil
	}
	if sanctionKind == "suspension" {
		return api.UserAccess{Allowed: false, Code: "account_suspended", Message: "계정 이용이 일시적으로 정지되었습니다"}, nil
	}
	return api.UserAccess{Allowed: true}, nil
}

func (s *Store) ListReports(ctx context.Context, status string, limit int) ([]api.AdminReport, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT r.id::text, r.reporter_id::text, p.nickname, r.target_type, r.target_id::text,
		       r.reason, r.detail, r.status, r.resolution, r.created_at,
		       r.reviewed_at, COALESCE(r.reviewed_by, '')
		FROM reports r
		JOIN profiles p ON p.user_id = r.reporter_id
		WHERE ($1 = 'all' OR r.status = $1)
		ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,
		         r.created_at
		LIMIT $2`, status, limit)
	if err != nil {
		return nil, fmt.Errorf("list moderation reports: %w", err)
	}
	defer rows.Close()
	items := make([]api.AdminReport, 0)
	for rows.Next() {
		var item api.AdminReport
		if err := rows.Scan(&item.ID, &item.ReporterID, &item.ReporterNickname, &item.TargetType,
			&item.TargetID, &item.Reason, &item.Detail, &item.Status, &item.Resolution,
			&item.CreatedAt, &item.ReviewedAt, &item.ReviewedBy); err != nil {
			return nil, fmt.Errorf("scan moderation report: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) ResolveReport(ctx context.Context, reportID string, command api.ResolveReportCommand) (api.ModerationAction, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return api.ModerationAction{}, fmt.Errorf("begin moderation action: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var targetType, targetID, reportStatus string
	err = tx.QueryRow(ctx, `
		SELECT target_type, target_id::text, status
		FROM reports WHERE id = $1::uuid FOR UPDATE`, reportID).
		Scan(&targetType, &targetID, &reportStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return api.ModerationAction{}, api.ErrNotFound
	}
	if err != nil {
		return api.ModerationAction{}, fmt.Errorf("lock moderation report: %w", err)
	}
	if reportStatus == "resolved" || reportStatus == "dismissed" {
		return api.ModerationAction{}, fmt.Errorf("%w: 이미 처리된 신고입니다", api.ErrConflict)
	}

	subjectUserID, err := moderationSubjectUser(ctx, tx, targetType, targetID)
	if err != nil {
		if command.Action == "dismiss" && errors.Is(err, api.ErrInvalid) {
			subjectUserID = ""
		} else {
			return api.ModerationAction{}, err
		}
	}

	status := "resolved"
	if command.Action == "dismiss" {
		status = "dismissed"
	}
	if command.Action == "hide" {
		if _, err := tx.Exec(ctx, `
			INSERT INTO moderation_hidden_targets (target_type, target_id, reason, hidden_by)
			VALUES ($1, $2::uuid, $3, $4)
			ON CONFLICT (target_type, target_id) DO UPDATE
			SET reason = EXCLUDED.reason, hidden_by = EXCLUDED.hidden_by, hidden_at = now()`,
			targetType, targetID, command.Reason, command.OperatorID); err != nil {
			return api.ModerationAction{}, fmt.Errorf("hide moderation target: %w", err)
		}
		if err := cancelModeratedNotifications(ctx, tx, targetType, targetID); err != nil {
			return api.ModerationAction{}, fmt.Errorf("cancel moderated notifications: %w", err)
		}
	}

	if command.Action == "warn" || command.Action == "suspend" || command.Action == "ban" {
		kind := map[string]string{"warn": "warning", "suspend": "suspension", "ban": "ban"}[command.Action]
		var expiresAt *time.Time
		if command.Action == "suspend" {
			value := time.Now().UTC().Add(time.Duration(command.DurationHours) * time.Hour)
			expiresAt = &value
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO user_sanctions (user_id, kind, reason, expires_at, created_by)
			VALUES ($1::uuid, $2, $3, $4, $5)`, subjectUserID, kind, command.Reason, expiresAt, command.OperatorID); err != nil {
			return api.ModerationAction{}, fmt.Errorf("insert user sanction: %w", err)
		}
		if command.Action == "suspend" || command.Action == "ban" {
			if _, err := tx.Exec(ctx, `
				INSERT INTO moderation_hidden_targets (target_type, target_id, reason, hidden_by)
				VALUES ('user', $1::uuid, $2, $3)
				ON CONFLICT (target_type, target_id) DO UPDATE
				SET reason = EXCLUDED.reason, hidden_by = EXCLUDED.hidden_by, hidden_at = now()`,
				subjectUserID, command.Reason, command.OperatorID); err != nil {
				return api.ModerationAction{}, fmt.Errorf("hide sanctioned user: %w", err)
			}
			if _, err := tx.Exec(ctx, `UPDATE device_push_tokens SET enabled = false, updated_at = now() WHERE user_id = $1::uuid`, subjectUserID); err != nil {
				return api.ModerationAction{}, fmt.Errorf("disable sanctioned push tokens: %w", err)
			}
			if _, err := tx.Exec(ctx, `DELETE FROM reading_presence WHERE user_id = $1::uuid`, subjectUserID); err != nil {
				return api.ModerationAction{}, fmt.Errorf("clear sanctioned presence: %w", err)
			}
			if err := cancelModeratedNotifications(ctx, tx, "user", subjectUserID); err != nil {
				return api.ModerationAction{}, fmt.Errorf("cancel sanctioned user notifications: %w", err)
			}
		}
	}

	if _, err := tx.Exec(ctx, `
		UPDATE reports
		SET status = $2, resolution = $3, reviewed_at = now(), reviewed_by = $4
		WHERE id = $1::uuid`, reportID, status, command.Action+": "+command.Reason, command.OperatorID); err != nil {
		return api.ModerationAction{}, fmt.Errorf("complete moderation report: %w", err)
	}

	item := api.ModerationAction{
		ReportID: reportID, OperatorID: command.OperatorID, Action: command.Action,
		TargetType: targetType, TargetID: targetID, SubjectUserID: subjectUserID, Reason: command.Reason,
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO moderation_actions (report_id, operator_id, action, target_type, target_id, subject_user_id, reason)
		VALUES ($1::uuid, $2, $3, $4, $5::uuid, NULLIF($6, '')::uuid, $7)
		RETURNING id::text, created_at`, reportID, command.OperatorID, command.Action, targetType, targetID, subjectUserID, command.Reason).
		Scan(&item.ID, &item.CreatedAt); err != nil {
		return api.ModerationAction{}, fmt.Errorf("insert moderation audit action: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return api.ModerationAction{}, fmt.Errorf("commit moderation action: %w", err)
	}
	return item, nil
}

func cancelModeratedNotifications(ctx context.Context, tx pgx.Tx, targetType, targetID string) error {
	_, err := tx.Exec(ctx, `
		UPDATE notification_deliveries nd
		SET status = 'failed', last_error = 'content_moderated'
		FROM outbox_events oe
		WHERE nd.outbox_event_id = oe.id AND nd.status = 'pending'
		  AND (
		      ($1 = 'feed_event' AND oe.aggregate_type = 'feed_event' AND oe.aggregate_id = $2::uuid)
		      OR ($1 = 'comment' AND oe.aggregate_type = 'comment' AND oe.aggregate_id = $2::uuid)
		      OR ($1 = 'user' AND $2::text IN (
		          COALESCE(oe.payload->>'actorId', ''),
		          COALESCE(oe.payload->>'authorId', ''),
		          COALESCE(oe.payload->>'userId', ''),
		          COALESCE(oe.payload->>'friendId', '')
		      ))
		  )`, targetType, targetID)
	return err
}

func moderationSubjectUser(ctx context.Context, tx pgx.Tx, targetType, targetID string) (string, error) {
	var userID string
	var err error
	switch targetType {
	case "user":
		err = tx.QueryRow(ctx, `SELECT id::text FROM users WHERE id = $1::uuid`, targetID).Scan(&userID)
	case "feed_event":
		err = tx.QueryRow(ctx, `SELECT actor_id::text FROM feed_events WHERE id = $1::uuid`, targetID).Scan(&userID)
	case "comment":
		err = tx.QueryRow(ctx, `SELECT author_id::text FROM anchored_comments WHERE id = $1::uuid`, targetID).Scan(&userID)
	default:
		return "", fmt.Errorf("%w: 지원하지 않는 신고 대상입니다", api.ErrInvalid)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("%w: 신고 대상이 존재하지 않습니다", api.ErrInvalid)
	}
	if err != nil {
		return "", fmt.Errorf("load moderation subject: %w", err)
	}
	return userID, nil
}

func (s *Store) RestoreHiddenTarget(ctx context.Context, targetType, targetID, reason, operatorID string) (api.ModerationAction, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return api.ModerationAction{}, fmt.Errorf("begin restore moderation target: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result, err := tx.Exec(ctx, `DELETE FROM moderation_hidden_targets WHERE target_type = $1 AND target_id = $2::uuid`, targetType, targetID)
	if err != nil {
		return api.ModerationAction{}, fmt.Errorf("restore hidden target: %w", err)
	}
	if result.RowsAffected() == 0 {
		return api.ModerationAction{}, api.ErrNotFound
	}
	subjectUserID, err := moderationSubjectUser(ctx, tx, targetType, targetID)
	if err != nil && !errors.Is(err, api.ErrInvalid) {
		return api.ModerationAction{}, err
	}
	item := api.ModerationAction{
		OperatorID: operatorID, Action: "restore", TargetType: targetType,
		TargetID: targetID, SubjectUserID: subjectUserID, Reason: reason,
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO moderation_actions (operator_id, action, target_type, target_id, subject_user_id, reason)
		VALUES ($1, 'restore', $2, $3::uuid, NULLIF($4, '')::uuid, $5)
		RETURNING id::text, created_at`, operatorID, targetType, targetID, subjectUserID, reason).
		Scan(&item.ID, &item.CreatedAt); err != nil {
		return api.ModerationAction{}, fmt.Errorf("insert restore audit action: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return api.ModerationAction{}, fmt.Errorf("commit restore moderation target: %w", err)
	}
	return item, nil
}

func (s *Store) ListModerationActions(ctx context.Context, limit int) ([]api.ModerationAction, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, COALESCE(report_id::text, ''), operator_id, action, target_type,
		       target_id::text, COALESCE(subject_user_id::text, ''), reason, created_at
		FROM moderation_actions ORDER BY created_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("list moderation actions: %w", err)
	}
	defer rows.Close()
	items := make([]api.ModerationAction, 0)
	for rows.Next() {
		var item api.ModerationAction
		if err := rows.Scan(&item.ID, &item.ReportID, &item.OperatorID, &item.Action,
			&item.TargetType, &item.TargetID, &item.SubjectUserID, &item.Reason, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan moderation action: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

var _ api.UserAccessStore = (*Store)(nil)
var _ api.ModerationStore = (*Store)(nil)
