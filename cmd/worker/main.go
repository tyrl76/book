package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	bookauth "github.com/datau/book/internal/auth"
	"github.com/datau/book/internal/config"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	settings, err := config.Load()
	if err != nil {
		logger.Error("load config", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	pool, err := pgxpool.New(ctx, settings.DatabaseURL)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	dispatcher := newPushDispatcher(settings.ExpoPushURL, logger)
	var authDeleter authUserDeleter
	if settings.SupabaseURL != "" && settings.SupabaseServiceRoleKey != "" {
		authDeleter = bookauth.NewAdminClient(settings.SupabaseURL, settings.SupabaseServiceRoleKey)
	}

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	logger.Info("outbox worker started")

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := processAccountDeletionBatch(ctx, pool, authDeleter, logger); err != nil {
				logger.Error("process account deletion batch", "error", err)
			}
			if err := processBatch(ctx, pool, logger); err != nil {
				logger.Error("process outbox batch", "error", err)
			}
			if err := dispatcher.deliverBatch(ctx, pool); err != nil {
				logger.Error("deliver push batch", "error", err)
			}
		}
	}
}

func processBatch(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	rows, err := tx.Query(ctx, `
		SELECT id::text, aggregate_id::text, event_type, payload::text
		FROM outbox_events
		WHERE processed_at IS NULL AND available_at <= now()
		ORDER BY created_at
		FOR UPDATE SKIP LOCKED
		LIMIT 20`)
	if err != nil {
		return err
	}

	events := make([]outboxEvent, 0, 20)
	for rows.Next() {
		var item outboxEvent
		if err := rows.Scan(&item.id, &item.aggregateID, &item.eventType, &item.payload); err != nil {
			rows.Close()
			return err
		}
		events = append(events, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, item := range events {
		if err := enqueueNotificationDeliveries(ctx, tx, item); err != nil {
			return err
		}
		logger.Info("outbox event expanded", "id", item.id, "type", item.eventType)
		if _, err := tx.Exec(ctx, `UPDATE outbox_events SET processed_at = now(), attempts = attempts + 1 WHERE id = $1::uuid`, item.id); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
