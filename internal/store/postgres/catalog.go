package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/datau/book/internal/api"
	"github.com/datau/book/internal/catalog"
	"github.com/jackc/pgx/v5"
)

func (s *Store) EnsureUser(ctx context.Context, userID, nickname string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin ensure user: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := ensureUser(ctx, tx, userID, nickname); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit ensure user: %w", err)
	}
	return nil
}

func ensureUser(ctx context.Context, tx pgx.Tx, userID, nickname string) error {
	if strings.TrimSpace(nickname) == "" {
		compact := strings.ReplaceAll(userID, "-", "")
		if len(compact) > 6 {
			compact = compact[:6]
		}
		nickname = "독서가 " + compact
	}
	if _, err := tx.Exec(ctx, `INSERT INTO users (id) VALUES ($1::uuid) ON CONFLICT (id) DO NOTHING`, userID); err != nil {
		return fmt.Errorf("insert user: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO profiles (user_id, nickname)
		VALUES ($1::uuid, $2)
		ON CONFLICT (user_id) DO NOTHING`, userID, nickname); err != nil {
		return fmt.Errorf("insert profile: %w", err)
	}
	return nil
}

func (s *Store) Search(ctx context.Context, query string, limit int) ([]catalog.Book, error) {
	result, err := s.SearchPage(ctx, query, 1, limit)
	return result.Items, err
}

func (s *Store) SearchPage(ctx context.Context, query string, page, limit int) (catalog.SearchResult, error) {
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit
	rows, err := s.pool.Query(ctx, `
		SELECT e.isbn13, w.title, w.author, COALESCE(e.publisher, ''),
		       COALESCE(e.cover_url, ''), COALESCE(e.page_count, 0)
		FROM editions e
		JOIN works w ON w.id = e.work_id
		WHERE e.isbn13 IS NOT NULL
		  AND (w.title ILIKE '%' || $1 || '%' OR w.author ILIKE '%' || $1 || '%' OR e.isbn13 = $1)
		ORDER BY CASE WHEN e.isbn13 = $1 THEN 0 ELSE 1 END, w.title
		LIMIT $2 OFFSET $3`, query, limit+1, offset)
	if err != nil {
		return catalog.SearchResult{}, fmt.Errorf("search local catalog: %w", err)
	}
	defer rows.Close()
	items := make([]catalog.Book, 0)
	for rows.Next() {
		var item catalog.Book
		if err := rows.Scan(&item.ISBN, &item.Title, &item.Author, &item.Publisher, &item.CoverURL, &item.PageCount); err != nil {
			return catalog.SearchResult{}, fmt.Errorf("scan local catalog: %w", err)
		}
		item.Source = "local"
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return catalog.SearchResult{}, fmt.Errorf("iterate local catalog: %w", err)
	}
	hasNextPage := len(items) > limit
	if hasNextPage {
		items = items[:limit]
	}
	return catalog.SearchResult{Items: items, HasNextPage: hasNextPage}, nil
}

func (s *Store) Suggest(ctx context.Context, query string, limit int) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT w.title
		FROM editions e
		JOIN works w ON w.id = e.work_id
		WHERE e.isbn13 IS NOT NULL
		  AND (w.title ILIKE '%' || $1 || '%' OR w.author ILIKE '%' || $1 || '%' OR e.isbn13 = $1)
		GROUP BY w.title
		ORDER BY MIN(CASE WHEN e.isbn13 = $1 THEN 0 ELSE 1 END), w.title
		LIMIT $2`, query, limit)
	if err != nil {
		return nil, fmt.Errorf("suggest local catalog: %w", err)
	}
	defer rows.Close()
	items := make([]string, 0, limit)
	for rows.Next() {
		var title string
		if err := rows.Scan(&title); err != nil {
			return nil, fmt.Errorf("scan local catalog suggestion: %w", err)
		}
		items = append(items, title)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate local catalog suggestions: %w", err)
	}
	return items, nil
}

func (s *Store) LookupISBN(ctx context.Context, isbn string) (catalog.Book, error) {
	var item catalog.Book
	err := s.pool.QueryRow(ctx, `
		SELECT e.isbn13, w.title, w.author, COALESCE(e.publisher, ''),
		       COALESCE(e.cover_url, ''), COALESCE(e.page_count, 0)
		FROM editions e
		JOIN works w ON w.id = e.work_id
		WHERE e.isbn13 = $1`, isbn).
		Scan(&item.ISBN, &item.Title, &item.Author, &item.Publisher, &item.CoverURL, &item.PageCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return catalog.Book{}, catalog.ErrNotFound
	}
	if err != nil {
		return catalog.Book{}, fmt.Errorf("lookup local catalog: %w", err)
	}
	item.Source = "local"
	return item, nil
}

func (s *Store) CreateReadingRun(ctx context.Context, userID string, command api.CreateReadingRunCommand) (api.ReadingRun, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return api.ReadingRun{}, fmt.Errorf("begin create reading run: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := ensureUser(ctx, tx, userID, ""); err != nil {
		return api.ReadingRun{}, err
	}
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, command.Book.ISBN); err != nil {
		return api.ReadingRun{}, fmt.Errorf("lock ISBN: %w", err)
	}

	var editionID string
	var existingPageCount int
	err = tx.QueryRow(ctx, `SELECT id::text, COALESCE(page_count, 0) FROM editions WHERE isbn13 = $1`, command.Book.ISBN).
		Scan(&editionID, &existingPageCount)
	if errors.Is(err, pgx.ErrNoRows) {
		var workID string
		if err := tx.QueryRow(ctx, `
			INSERT INTO works (title, author, cover_color)
			VALUES ($1, $2, $3)
			RETURNING id::text`, command.Book.Title, command.Book.Author, coverColor(command.Book.ISBN)).Scan(&workID); err != nil {
			return api.ReadingRun{}, fmt.Errorf("insert work: %w", err)
		}
		pageCount := command.Book.PageCount
		if command.TotalValue > 0 {
			pageCount = int(command.TotalValue)
		}
		if err := tx.QueryRow(ctx, `
			INSERT INTO editions (work_id, isbn13, publisher, page_count, cover_url)
			VALUES ($1::uuid, $2, NULLIF($3, ''), NULLIF($4, 0), NULLIF($5, ''))
			RETURNING id::text`, workID, command.Book.ISBN, command.Book.Publisher, pageCount, command.Book.CoverURL).Scan(&editionID); err != nil {
			return api.ReadingRun{}, fmt.Errorf("insert edition: %w", err)
		}
		existingPageCount = pageCount
	} else if err != nil {
		return api.ReadingRun{}, fmt.Errorf("lookup edition: %w", err)
	} else if command.TotalValue > 0 && existingPageCount == 0 {
		existingPageCount = int(command.TotalValue)
		if _, err := tx.Exec(ctx, `UPDATE editions SET page_count = $2 WHERE id = $1::uuid`, editionID, existingPageCount); err != nil {
			return api.ReadingRun{}, fmt.Errorf("update edition page count: %w", err)
		}
	}

	var activeID string
	err = tx.QueryRow(ctx, `
		SELECT id::text FROM reading_runs
		WHERE user_id = $1::uuid AND edition_id = $2::uuid AND status IN ('want_to_read', 'reading', 'paused')
		LIMIT 1`, userID, editionID).Scan(&activeID)
	if err == nil {
		return api.ReadingRun{}, api.ErrConflict
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return api.ReadingRun{}, fmt.Errorf("check active reading run: %w", err)
	}

	totalValue := command.TotalValue
	basis := command.ProgressBasis
	if basis == "" {
		basis = "pages"
	}
	if basis == "percent" {
		totalValue = 100
	} else if basis == "pages" && totalValue <= 0 && existingPageCount > 0 {
		totalValue = float64(existingPageCount)
	}
	if totalValue <= 0 {
		totalValue = 100
		basis = "percent"
	}
	status := command.Status
	if status == "" {
		status = "reading"
	}
	var runNumber int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(run_number), 0) + 1 FROM reading_runs WHERE user_id = $1::uuid AND edition_id = $2::uuid`, userID, editionID).Scan(&runNumber); err != nil {
		return api.ReadingRun{}, fmt.Errorf("next reading run number: %w", err)
	}

	now := time.Now().UTC()
	var startedAt *time.Time
	if status == "reading" {
		startedAt = &now
	}
	currentValue := float64(0)
	normalizedProgress := 0
	entrySource := "manual"
	if status == "finished" {
		currentValue = totalValue
		normalizedProgress = 10000
		entrySource = "import"
	}
	var defaultVisibility, defaultPrecision string
	if err := tx.QueryRow(ctx, `SELECT default_visibility, progress_precision FROM profiles WHERE user_id = $1::uuid`, userID).
		Scan(&defaultVisibility, &defaultPrecision); err != nil {
		return api.ReadingRun{}, fmt.Errorf("load reading defaults: %w", err)
	}
	result := api.ReadingRun{
		ISBN: command.Book.ISBN, Title: command.Book.Title, Author: command.Book.Author, CoverURL: command.Book.CoverURL,
		CoverColor: coverColor(command.Book.ISBN), Status: status, ProgressBasis: basis,
		CurrentValue: currentValue, TotalValue: totalValue, NormalizedProgress: normalizedProgress,
		Visibility: defaultVisibility, ProgressPrecision: defaultPrecision, AutoShare: true,
		RunNumber: runNumber, StartedAt: startedAt, UpdatedAt: now,
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO reading_runs (
			user_id, edition_id, status, progress_basis, current_value, total_value,
			normalized_progress, visibility, progress_precision, auto_share, run_number, started_at, updated_at
		) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12)
		RETURNING id::text`, userID, editionID, status, basis, currentValue, totalValue, normalizedProgress,
		defaultVisibility, defaultPrecision, runNumber, startedAt, now).Scan(&result.ID); err != nil {
		return api.ReadingRun{}, fmt.Errorf("insert reading run: %w", err)
	}

	var entryID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO progress_entries (
			reading_run_id, client_operation_id, previous_value, new_value,
			previous_normalized_progress, new_normalized_progress, source, recorded_at
		) VALUES ($1::uuid, gen_random_uuid(), $2, $2, $3, $3, $4, $5)
		RETURNING id::text`, result.ID, currentValue, normalizedProgress, entrySource, now).Scan(&entryID); err != nil {
		return api.ReadingRun{}, fmt.Errorf("insert starting progress: %w", err)
	}
	if status == "reading" && defaultVisibility != "private" {
		var feedID string
		if err := tx.QueryRow(ctx, `
			INSERT INTO feed_events (actor_id, reading_run_id, progress_entry_id, type, visibility, occurred_at)
			VALUES ($1::uuid, $2::uuid, $3::uuid, 'started', $4, $5)
			RETURNING id::text`, userID, result.ID, entryID, defaultVisibility, now).Scan(&feedID); err != nil {
			return api.ReadingRun{}, fmt.Errorf("insert started feed event: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
			VALUES ('feed_event', $1::uuid, 'feed_event.created', jsonb_build_object('feedEventId', $1::text, 'actorId', $2::text))`, feedID, userID); err != nil {
			return api.ReadingRun{}, fmt.Errorf("insert started outbox event: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return api.ReadingRun{}, fmt.Errorf("commit create reading run: %w", err)
	}
	return result, nil
}

func coverColor(isbn string) string {
	palette := []string{"#B65D48", "#406B62", "#304D75", "#8A6B3F", "#6B5876"}
	sum := 0
	for _, character := range isbn {
		sum += int(character)
	}
	return palette[sum%len(palette)]
}

func (s *Store) CreateManualReadingRun(ctx context.Context, userID string, command api.CreateManualReadingRunCommand) (api.ReadingRun, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return api.ReadingRun{}, fmt.Errorf("begin manual reading run: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := ensureUser(ctx, tx, userID, ""); err != nil {
		return api.ReadingRun{}, err
	}

	color := coverColor(command.Title + command.Author)
	var workID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO works (title, author, cover_color) VALUES ($1, $2, $3)
		RETURNING id::text`, command.Title, command.Author, color).Scan(&workID); err != nil {
		return api.ReadingRun{}, fmt.Errorf("insert manual work: %w", err)
	}
	var editionID string
	pageCount := 0
	audioSeconds := 0
	if command.ProgressBasis == "pages" {
		pageCount = int(command.TotalValue)
	}
	if command.ProgressBasis == "audio_seconds" {
		audioSeconds = int(command.TotalValue)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO editions (work_id, page_count, audio_seconds)
		VALUES ($1::uuid, NULLIF($2, 0), NULLIF($3, 0)) RETURNING id::text`, workID, pageCount, audioSeconds).Scan(&editionID); err != nil {
		return api.ReadingRun{}, fmt.Errorf("insert manual edition: %w", err)
	}
	var defaultVisibility, defaultPrecision string
	if err := tx.QueryRow(ctx, `SELECT default_visibility, progress_precision FROM profiles WHERE user_id = $1::uuid`, userID).
		Scan(&defaultVisibility, &defaultPrecision); err != nil {
		return api.ReadingRun{}, fmt.Errorf("load manual reading defaults: %w", err)
	}
	now := time.Now().UTC()
	var startedAt *time.Time
	if command.Status == "reading" {
		startedAt = &now
	}
	currentValue := float64(0)
	normalizedProgress := 0
	entrySource := "manual"
	if command.Status == "finished" {
		currentValue = command.TotalValue
		normalizedProgress = 10000
		entrySource = "import"
	}
	result := api.ReadingRun{
		Title: command.Title, Author: command.Author, CoverColor: color, Status: command.Status,
		ProgressBasis: command.ProgressBasis, CurrentValue: currentValue, TotalValue: command.TotalValue,
		NormalizedProgress: normalizedProgress,
		Visibility:         defaultVisibility, ProgressPrecision: defaultPrecision, AutoShare: true,
		RunNumber: 1, StartedAt: startedAt, UpdatedAt: now,
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO reading_runs (
			user_id, edition_id, status, progress_basis, current_value, total_value, normalized_progress, visibility,
			progress_precision, auto_share, run_number, started_at, updated_at
		) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, true, 1, $10, $11)
		RETURNING id::text`, userID, editionID, command.Status, command.ProgressBasis, currentValue,
		command.TotalValue, normalizedProgress, defaultVisibility, defaultPrecision, startedAt, now).Scan(&result.ID); err != nil {
		return api.ReadingRun{}, fmt.Errorf("insert manual reading run: %w", err)
	}
	var entryID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO progress_entries (
			reading_run_id, client_operation_id, previous_value, new_value,
			previous_normalized_progress, new_normalized_progress, source, recorded_at
		) VALUES ($1::uuid, gen_random_uuid(), $2, $2, $3, $3, $4, $5)
		RETURNING id::text`, result.ID, currentValue, normalizedProgress, entrySource, now).Scan(&entryID); err != nil {
		return api.ReadingRun{}, fmt.Errorf("insert manual starting progress: %w", err)
	}
	if command.Status == "reading" && defaultVisibility != "private" {
		var feedID string
		if err := tx.QueryRow(ctx, `
			INSERT INTO feed_events (actor_id, reading_run_id, progress_entry_id, type, visibility, occurred_at)
			VALUES ($1::uuid, $2::uuid, $3::uuid, 'started', $4, $5) RETURNING id::text`,
			userID, result.ID, entryID, defaultVisibility, now).Scan(&feedID); err != nil {
			return api.ReadingRun{}, fmt.Errorf("insert manual feed event: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
			VALUES ('feed_event', $1::uuid, 'feed_event.created', jsonb_build_object('feedEventId', $1::text, 'actorId', $2::text))`, feedID, userID); err != nil {
			return api.ReadingRun{}, fmt.Errorf("queue manual feed event: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return api.ReadingRun{}, fmt.Errorf("commit manual reading run: %w", err)
	}
	return result, nil
}

var _ catalog.Provider = (*Store)(nil)
var _ api.ManualReadingStore = (*Store)(nil)
