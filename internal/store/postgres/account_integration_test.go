package postgres

import (
	"context"
	"os"
	"testing"
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
