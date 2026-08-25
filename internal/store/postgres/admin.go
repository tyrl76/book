package postgres

import (
	"context"
	"fmt"

	"github.com/datau/book/internal/api"
)

func (s *Store) GetAdminOverview(ctx context.Context) (api.AdminStorageOverview, error) {
	var overview api.AdminStorageOverview
	err := s.pool.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*) FROM users WHERE deleted_at IS NULL),
			(SELECT COUNT(*) FROM user_sessions WHERE revoked_at IS NULL AND expires_at > now()),
			(SELECT COUNT(*) FROM reading_runs),
			(SELECT COUNT(*) FROM progress_entries),
			(SELECT COUNT(*) FROM reports WHERE status IN ('open', 'reviewing')),
			(SELECT COUNT(*) FROM outbox_events WHERE processed_at IS NULL),
			(SELECT COUNT(*) FROM notification_deliveries WHERE status = 'pending'),
			(SELECT COUNT(*) FROM notification_deliveries WHERE status = 'failed'),
			pg_database_size(current_database())`).Scan(
		&overview.Users,
		&overview.ActiveSessions,
		&overview.ReadingRuns,
		&overview.ProgressEntries,
		&overview.OpenReports,
		&overview.PendingOutbox,
		&overview.PendingNotifications,
		&overview.FailedNotifications,
		&overview.DatabaseSizeBytes,
	)
	if err != nil {
		return api.AdminStorageOverview{}, fmt.Errorf("get admin overview: %w", err)
	}
	return overview, nil
}
