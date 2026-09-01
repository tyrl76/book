package postgres

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"time"

	"github.com/datau/book/internal/api"
	"github.com/jackc/pgx/v5"
)

const localRegistrationLock int64 = 4_910_117_293_337

func (s *Store) LocalRegistrationOpen(ctx context.Context) (bool, error) {
	var open bool
	if err := s.pool.QueryRow(ctx, `SELECT NOT EXISTS (SELECT 1 FROM local_credentials)`).Scan(&open); err != nil {
		return false, fmt.Errorf("check local registration: %w", err)
	}
	return open, nil
}

func (s *Store) CreateLocalAccount(ctx context.Context, email, nickname, passwordHash string, tokenHash []byte, expiresAt time.Time) (api.LocalAuthUser, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return api.LocalAuthUser{}, fmt.Errorf("begin local registration: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, localRegistrationLock); err != nil {
		return api.LocalAuthUser{}, fmt.Errorf("lock local registration: %w", err)
	}
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM local_credentials)`).Scan(&exists); err != nil {
		return api.LocalAuthUser{}, fmt.Errorf("check existing local account: %w", err)
	}
	if exists {
		return api.LocalAuthUser{}, api.ErrConflict
	}

	var user api.LocalAuthUser
	user.Email = email
	user.Nickname = nickname
	if err := tx.QueryRow(ctx, `INSERT INTO users DEFAULT VALUES RETURNING id::text`).Scan(&user.ID); err != nil {
		return api.LocalAuthUser{}, fmt.Errorf("create local user: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO profiles (user_id, nickname) VALUES ($1::uuid, $2)`, user.ID, nickname); err != nil {
		return api.LocalAuthUser{}, fmt.Errorf("create local profile: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO local_credentials (user_id, email, password_hash) VALUES ($1::uuid, $2, $3)`, user.ID, email, passwordHash); err != nil {
		return api.LocalAuthUser{}, fmt.Errorf("create local credential: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1::uuid, $2, $3)`, user.ID, tokenHash, expiresAt); err != nil {
		return api.LocalAuthUser{}, fmt.Errorf("create registration session: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return api.LocalAuthUser{}, fmt.Errorf("commit local registration: %w", err)
	}
	return user, nil
}

func (s *Store) ListAdminLocalAccounts(ctx context.Context) ([]api.AdminLocalAccount, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT u.id::text, lc.email, p.nickname,
		       COUNT(session.id) FILTER (WHERE session.revoked_at IS NULL AND session.expires_at > now())::int,
		       lc.created_at
		FROM local_credentials lc
		JOIN users u ON u.id = lc.user_id
		JOIN profiles p ON p.user_id = u.id
		LEFT JOIN user_sessions session ON session.user_id = u.id
		WHERE u.deleted_at IS NULL AND u.deletion_requested_at IS NULL
		GROUP BY u.id, lc.email, p.nickname, lc.created_at
		ORDER BY lc.created_at`)
	if err != nil {
		return nil, fmt.Errorf("list admin local accounts: %w", err)
	}
	defer rows.Close()
	items := make([]api.AdminLocalAccount, 0)
	for rows.Next() {
		var item api.AdminLocalAccount
		if err := rows.Scan(&item.ID, &item.Email, &item.Nickname, &item.ActiveSessions, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan admin local account: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate admin local accounts: %w", err)
	}
	return items, nil
}

func (s *Store) CreateAdminLocalAccount(ctx context.Context, email, nickname, passwordHash string) (api.AdminLocalAccount, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return api.AdminLocalAccount{}, fmt.Errorf("begin admin local account creation: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, localRegistrationLock); err != nil {
		return api.AdminLocalAccount{}, fmt.Errorf("lock admin local account creation: %w", err)
	}
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM local_credentials WHERE lower(email) = lower($1))`, email).Scan(&exists); err != nil {
		return api.AdminLocalAccount{}, fmt.Errorf("check admin local account email: %w", err)
	}
	if exists {
		return api.AdminLocalAccount{}, api.ErrConflict
	}

	item := api.AdminLocalAccount{Email: email, Nickname: nickname}
	if err := tx.QueryRow(ctx, `INSERT INTO users DEFAULT VALUES RETURNING id::text`).Scan(&item.ID); err != nil {
		return api.AdminLocalAccount{}, fmt.Errorf("create admin local user: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO profiles (user_id, nickname) VALUES ($1::uuid, $2)`, item.ID, nickname); err != nil {
		return api.AdminLocalAccount{}, fmt.Errorf("create admin local profile: %w", err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO local_credentials (user_id, email, password_hash)
		VALUES ($1::uuid, $2, $3)
		RETURNING created_at`, item.ID, email, passwordHash).Scan(&item.CreatedAt); err != nil {
		return api.AdminLocalAccount{}, fmt.Errorf("create admin local credential: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return api.AdminLocalAccount{}, fmt.Errorf("commit admin local account creation: %w", err)
	}
	return item, nil
}

func (s *Store) GetLocalCredential(ctx context.Context, email string) (api.LocalCredential, error) {
	var credential api.LocalCredential
	err := s.pool.QueryRow(ctx, `
		SELECT u.id::text, lc.email, p.nickname, lc.password_hash
		FROM local_credentials lc
		JOIN users u ON u.id = lc.user_id AND u.deletion_requested_at IS NULL
		JOIN profiles p ON p.user_id = u.id
		WHERE lower(lc.email) = lower($1)`, email).
		Scan(&credential.User.ID, &credential.User.Email, &credential.User.Nickname, &credential.PasswordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return api.LocalCredential{}, api.ErrNotFound
	}
	if err != nil {
		return api.LocalCredential{}, fmt.Errorf("get local credential: %w", err)
	}
	return credential, nil
}

func (s *Store) CreateLocalSession(ctx context.Context, userID string, tokenHash []byte, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx, `
		WITH expired AS (
			DELETE FROM user_sessions WHERE expires_at <= now() OR revoked_at IS NOT NULL
		)
		INSERT INTO user_sessions (user_id, token_hash, expires_at)
		VALUES ($1::uuid, $2, $3)`, userID, tokenHash, expiresAt)
	if err != nil {
		return fmt.Errorf("create local session: %w", err)
	}
	return nil
}

func (s *Store) RevokeLocalSession(ctx context.Context, tokenHash []byte) error {
	if _, err := s.pool.Exec(ctx, `UPDATE user_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1`, tokenHash); err != nil {
		return fmt.Errorf("revoke local session: %w", err)
	}
	return nil
}

func (s *Store) Verify(ctx context.Context, token string) (string, error) {
	digest := sha256.Sum256([]byte(token))
	var userID string
	err := s.pool.QueryRow(ctx, `
		UPDATE user_sessions session
		SET last_used_at = CASE WHEN last_used_at < now() - interval '5 minutes' THEN now() ELSE last_used_at END
		FROM users
		WHERE session.token_hash = $1
		  AND session.user_id = users.id
		  AND session.revoked_at IS NULL
		  AND session.expires_at > now()
		  AND users.deletion_requested_at IS NULL
		RETURNING session.user_id::text`, digest[:]).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", api.ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("verify local session: %w", err)
	}
	return userID, nil
}

var _ api.LocalAuthStore = (*Store)(nil)
var _ api.TokenVerifier = (*Store)(nil)
var _ api.AdminLocalAccountStore = (*Store)(nil)
