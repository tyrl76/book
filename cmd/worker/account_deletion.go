package main

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type authUserDeleter interface {
	DeleteUser(context.Context, string) error
}

func processAccountDeletionBatch(ctx context.Context, pool *pgxpool.Pool, deleter authUserDeleter, logger *slog.Logger) error {
	if deleter == nil {
		return nil
	}
	rows, err := pool.Query(ctx, `
		WITH picked AS (
			SELECT user_id FROM account_deletion_requests
			WHERE (status = 'pending' AND next_attempt_at <= now())
			   OR (status = 'processing' AND updated_at < now() - interval '10 minutes')
			ORDER BY requested_at
			FOR UPDATE SKIP LOCKED
			LIMIT 10
		)
		UPDATE account_deletion_requests requests
		SET status = 'processing', updated_at = now()
		FROM picked
		WHERE requests.user_id = picked.user_id
		RETURNING requests.user_id::text`)
	if err != nil {
		return fmt.Errorf("lease account deletions: %w", err)
	}
	userIDs := make([]string, 0, 10)
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			rows.Close()
			return fmt.Errorf("scan account deletion: %w", err)
		}
		userIDs = append(userIDs, userID)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate account deletions: %w", err)
	}

	for _, userID := range userIDs {
		if err := deleter.DeleteUser(ctx, userID); err != nil {
			message := strings.TrimSpace(err.Error())
			if len(message) > 1000 {
				message = message[:1000]
			}
			if _, updateErr := pool.Exec(ctx, `
				UPDATE account_deletion_requests
				SET status = 'pending', attempts = attempts + 1, last_error = $2,
				    next_attempt_at = now() + make_interval(secs => LEAST(3600, (30 * power(2, LEAST(attempts, 7)))::int)),
				    updated_at = now()
				WHERE user_id = $1::uuid`, userID, message); updateErr != nil {
				return fmt.Errorf("reschedule account deletion: %w", updateErr)
			}
			logger.Warn("account auth deletion failed", "userID", userID, "error", err)
			continue
		}

		tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
		if err != nil {
			return fmt.Errorf("begin complete account deletion: %w", err)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM users WHERE id = $1::uuid`, userID); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("delete local user: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE account_deletion_requests
			SET status = 'completed', completed_at = now(), updated_at = now(), last_error = ''
			WHERE user_id = $1::uuid`, userID); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("complete account deletion request: %w", err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit account deletion: %w", err)
		}
		logger.Info("account deletion completed", "userID", userID)
	}
	return nil
}
