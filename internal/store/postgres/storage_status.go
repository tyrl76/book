package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/datau/book/internal/api"
)

func (s *Store) GetStorageStatus(ctx context.Context, userID string) (api.StorageStatus, error) {
	status := api.StorageStatus{Database: "PostgreSQL", Connected: true, CheckedAt: time.Now().UTC()}
	err := s.pool.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*)::int FROM reading_runs WHERE user_id = $1::uuid),
			(SELECT COUNT(*)::int FROM progress_entries pe JOIN reading_runs rr ON rr.id = pe.reading_run_id WHERE rr.user_id = $1::uuid),
			(SELECT COUNT(*)::int FROM feed_events WHERE actor_id = $1::uuid),
			(SELECT COUNT(*)::int FROM anchored_comments WHERE author_id = $1::uuid AND deleted_at IS NULL),
			COALESCE((
				SELECT MAX(saved_at) FROM (
					SELECT created_at AS saved_at FROM users WHERE id = $1::uuid
					UNION ALL SELECT updated_at FROM profiles WHERE user_id = $1::uuid
					UNION ALL SELECT updated_at FROM reading_runs WHERE user_id = $1::uuid
					UNION ALL SELECT pe.created_at FROM progress_entries pe JOIN reading_runs rr ON rr.id = pe.reading_run_id WHERE rr.user_id = $1::uuid
					UNION ALL SELECT created_at FROM anchored_comments WHERE author_id = $1::uuid
				) saved
			), now())`, userID).
		Scan(&status.ReadingRuns, &status.ProgressEntries, &status.FeedEvents, &status.Comments, &status.LastSavedAt)
	if err != nil {
		return api.StorageStatus{}, fmt.Errorf("get storage status: %w", err)
	}
	return status, nil
}

var _ api.StorageStatusStore = (*Store)(nil)
