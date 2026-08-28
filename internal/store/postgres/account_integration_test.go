package postgres

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/datau/book/internal/api"
)

func TestRequestUserDeletionIntegration(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	store, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(store.Close)

	const userID = "55555555-5555-4555-8555-555555555555"
	_, _ = store.pool.Exec(ctx, `DELETE FROM account_deletion_requests WHERE user_id = $1::uuid`, userID)
	_, _ = store.pool.Exec(ctx, `DELETE FROM users WHERE id = $1::uuid`, userID)
	t.Cleanup(func() {
		_, _ = store.pool.Exec(ctx, `DELETE FROM account_deletion_requests WHERE user_id = $1::uuid`, userID)
		_, _ = store.pool.Exec(ctx, `DELETE FROM users WHERE id = $1::uuid`, userID)
	})

	if err := store.EnsureUser(ctx, userID, "삭제 검증 사용자"); err != nil {
		t.Fatal(err)
	}
	if err := store.RequestUserDeletion(ctx, userID); err != nil {
		t.Fatal(err)
	}
	access, err := store.GetUserAccess(ctx, userID)
	if err != nil {
		t.Fatal(err)
	}
	if access.Allowed || access.Code != "account_deletion_pending" {
		t.Fatalf("unexpected access after deletion request: %#v", access)
	}
}

func TestDeleteReadingRunIntegration(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	store, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(store.Close)

	const (
		ownerID   = "56565656-5656-4565-8565-565656565656"
		otherID   = "57575757-5757-4575-8575-575757575757"
		workID    = "58585858-5858-4585-8585-585858585858"
		editionID = "59595959-5959-4595-8595-595959595959"
		runID     = "60606060-6060-4606-8606-606060606060"
		entryID   = "61616161-6161-4616-8616-616161616161"
		feedID    = "62626262-6262-4626-8626-626262626262"
		outboxID  = "63636363-6363-4636-8636-636363636363"
	)
	_, _ = store.pool.Exec(ctx, `DELETE FROM works WHERE id = $1::uuid`, workID)
	_, _ = store.pool.Exec(ctx, `DELETE FROM users WHERE id IN ($1::uuid, $2::uuid)`, ownerID, otherID)
	t.Cleanup(func() {
		_, _ = store.pool.Exec(ctx, `DELETE FROM outbox_events WHERE id = $1::uuid`, outboxID)
		_, _ = store.pool.Exec(ctx, `DELETE FROM works WHERE id = $1::uuid`, workID)
		_, _ = store.pool.Exec(ctx, `DELETE FROM users WHERE id IN ($1::uuid, $2::uuid)`, ownerID, otherID)
	})

	if err := store.EnsureUser(ctx, ownerID, "책 삭제 검증 사용자"); err != nil {
		t.Fatal(err)
	}
	if err := store.EnsureUser(ctx, otherID, "다른 사용자"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.pool.Exec(ctx, `INSERT INTO works (id, title, author) VALUES ($1::uuid, '삭제할 책', '검증 저자')`, workID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.pool.Exec(ctx, `INSERT INTO editions (id, work_id, page_count) VALUES ($1::uuid, $2::uuid, 200)`, editionID, workID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.pool.Exec(ctx, `
		INSERT INTO reading_runs (id, user_id, edition_id, status, progress_basis, total_value)
		VALUES ($1::uuid, $2::uuid, $3::uuid, 'reading', 'pages', 200)`, runID, ownerID, editionID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.pool.Exec(ctx, `
		INSERT INTO progress_entries (
			id, reading_run_id, client_operation_id, previous_value, new_value,
			previous_normalized_progress, new_normalized_progress, source, recorded_at
		) VALUES ($1::uuid, $2::uuid, gen_random_uuid(), 0, 20, 0, 1000, 'manual', now())`, entryID, runID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.pool.Exec(ctx, `
		INSERT INTO feed_events (id, actor_id, reading_run_id, progress_entry_id, type, visibility, occurred_at)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'milestone_25', 'friends', now())`, feedID, ownerID, runID, entryID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.pool.Exec(ctx, `
		INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload)
		VALUES ($1::uuid, 'feed_event', $2::uuid, 'feed_event.created', '{}'::jsonb)`, outboxID, feedID); err != nil {
		t.Fatal(err)
	}

	if err := store.DeleteReadingRun(ctx, otherID, runID); !errors.Is(err, api.ErrNotFound) {
		t.Fatalf("delete as non-owner = %v, want not found", err)
	}
	if err := store.DeleteReadingRun(ctx, ownerID, runID); err != nil {
		t.Fatal(err)
	}

	var runCount, entryCount, feedCount, outboxCount int
	if err := store.pool.QueryRow(ctx, `SELECT COUNT(*) FROM reading_runs WHERE id = $1::uuid`, runID).Scan(&runCount); err != nil {
		t.Fatal(err)
	}
	if err := store.pool.QueryRow(ctx, `SELECT COUNT(*) FROM progress_entries WHERE id = $1::uuid`, entryID).Scan(&entryCount); err != nil {
		t.Fatal(err)
	}
	if err := store.pool.QueryRow(ctx, `SELECT COUNT(*) FROM feed_events WHERE id = $1::uuid`, feedID).Scan(&feedCount); err != nil {
		t.Fatal(err)
	}
	if err := store.pool.QueryRow(ctx, `SELECT COUNT(*) FROM outbox_events WHERE id = $1::uuid`, outboxID).Scan(&outboxCount); err != nil {
		t.Fatal(err)
	}
	if runCount != 0 || entryCount != 0 || feedCount != 0 || outboxCount != 0 {
		t.Fatalf("remaining rows: run=%d entry=%d feed=%d outbox=%d", runCount, entryCount, feedCount, outboxCount)
	}
}
