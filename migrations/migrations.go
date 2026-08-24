package migrations

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

const advisoryLockID int64 = 714_386_626_153_879_841

var migrationName = regexp.MustCompile(`^(\d{6})_[a-z0-9_]+\.sql$`)

// files contains the immutable SQL migration history shipped with every server image.
//
//go:embed *.sql
var files embed.FS

type Migration struct {
	Version  string
	Name     string
	SQL      string
	Checksum string
}

type Result struct {
	Applied []string
	Skipped []string
}

func List() ([]Migration, error) {
	entries, err := fs.ReadDir(files, ".")
	if err != nil {
		return nil, fmt.Errorf("read embedded migrations: %w", err)
	}

	migrations := make([]Migration, 0, len(entries))
	versions := make(map[string]string, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}
		matches := migrationName.FindStringSubmatch(entry.Name())
		if matches == nil {
			return nil, fmt.Errorf("invalid migration filename %q", entry.Name())
		}
		if existing, ok := versions[matches[1]]; ok {
			return nil, fmt.Errorf("duplicate migration version %s in %q and %q", matches[1], existing, entry.Name())
		}

		body, err := files.ReadFile(entry.Name())
		if err != nil {
			return nil, fmt.Errorf("read migration %q: %w", entry.Name(), err)
		}
		if strings.TrimSpace(string(body)) == "" {
			return nil, fmt.Errorf("migration %q is empty", entry.Name())
		}
		digest := sha256.Sum256(body)
		migrations = append(migrations, Migration{
			Version:  matches[1],
			Name:     entry.Name(),
			SQL:      string(body),
			Checksum: hex.EncodeToString(digest[:]),
		})
		versions[matches[1]] = entry.Name()
	}
	sort.Slice(migrations, func(i, j int) bool { return migrations[i].Version < migrations[j].Version })
	return migrations, nil
}

func Apply(ctx context.Context, conn *pgx.Conn) (Result, error) {
	migrationList, err := List()
	if err != nil {
		return Result{}, err
	}

	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, advisoryLockID); err != nil {
		return Result{}, fmt.Errorf("acquire migration lock: %w", err)
	}
	defer func() {
		_, _ = conn.Exec(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock($1)`, advisoryLockID)
	}()

	if _, err := conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version text PRIMARY KEY,
			name text NOT NULL,
			checksum text NOT NULL,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`); err != nil {
		return Result{}, fmt.Errorf("ensure schema_migrations: %w", err)
	}

	rows, err := conn.Query(ctx, `SELECT version, checksum FROM schema_migrations ORDER BY version`)
	if err != nil {
		return Result{}, fmt.Errorf("read migration history: %w", err)
	}
	applied := make(map[string]string, len(migrationList))
	for rows.Next() {
		var version, checksum string
		if err := rows.Scan(&version, &checksum); err != nil {
			rows.Close()
			return Result{}, fmt.Errorf("scan migration history: %w", err)
		}
		applied[version] = checksum
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return Result{}, fmt.Errorf("iterate migration history: %w", err)
	}

	result := Result{}
	for _, migration := range migrationList {
		if checksum, ok := applied[migration.Version]; ok {
			if checksum != migration.Checksum {
				return result, fmt.Errorf("migration %s checksum changed after it was applied", migration.Name)
			}
			result.Skipped = append(result.Skipped, migration.Name)
			continue
		}

		tx, err := conn.Begin(ctx)
		if err != nil {
			return result, fmt.Errorf("begin migration %s: %w", migration.Name, err)
		}
		if _, err := tx.Exec(ctx, migration.SQL); err != nil {
			_ = tx.Rollback(ctx)
			return result, fmt.Errorf("apply migration %s: %w", migration.Name, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)`,
			migration.Version, migration.Name, migration.Checksum,
		); err != nil {
			_ = tx.Rollback(ctx)
			return result, fmt.Errorf("record migration %s: %w", migration.Name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return result, fmt.Errorf("commit migration %s: %w", migration.Name, err)
		}
		result.Applied = append(result.Applied, migration.Name)
	}
	return result, nil
}
