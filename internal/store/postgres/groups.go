package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/datau/book/internal/api"
	"github.com/jackc/pgx/v5"
)

func (s *Store) ListGroups(ctx context.Context, userID string) ([]api.ReadingGroup, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT g.id::text, g.name, gm.role,
		       (SELECT COUNT(*)::int FROM group_members members WHERE members.group_id = g.id),
		       g.created_at
		FROM group_members gm JOIN reading_groups g ON g.id = gm.group_id
		WHERE gm.user_id = $1::uuid ORDER BY g.updated_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list groups: %w", err)
	}
	defer rows.Close()
	items := make([]api.ReadingGroup, 0)
	for rows.Next() {
		var item api.ReadingGroup
		if err := rows.Scan(&item.ID, &item.Name, &item.Role, &item.MemberCount, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan group: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) CreateGroup(ctx context.Context, userID, name string) (api.ReadingGroup, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return api.ReadingGroup{}, fmt.Errorf("begin create group: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := ensureUser(ctx, tx, userID, ""); err != nil {
		return api.ReadingGroup{}, err
	}
	var count int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*)::int FROM group_members WHERE user_id = $1::uuid`, userID).Scan(&count); err != nil {
		return api.ReadingGroup{}, fmt.Errorf("count user groups: %w", err)
	}
	if count >= 20 {
		return api.ReadingGroup{}, fmt.Errorf("%w: 그룹은 최대 20개까지 참여할 수 있습니다", api.ErrConflict)
	}
	item := api.ReadingGroup{Name: name, Role: "owner", MemberCount: 1}
	if err := tx.QueryRow(ctx, `INSERT INTO reading_groups (owner_id, name) VALUES ($1::uuid, $2) RETURNING id::text, created_at`, userID, name).
		Scan(&item.ID, &item.CreatedAt); err != nil {
		return api.ReadingGroup{}, fmt.Errorf("insert group: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO group_members (group_id, user_id, role) VALUES ($1::uuid, $2::uuid, 'owner')`, item.ID, userID); err != nil {
		return api.ReadingGroup{}, fmt.Errorf("insert group owner: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return api.ReadingGroup{}, fmt.Errorf("commit create group: %w", err)
	}
	return item, nil
}

func (s *Store) ListGroupMembers(ctx context.Context, userID, groupID string) ([]api.GroupMember, error) {
	var member bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM group_members WHERE group_id = $1::uuid AND user_id = $2::uuid)`, groupID, userID).Scan(&member); err != nil {
		return nil, fmt.Errorf("check group membership: %w", err)
	}
	if !member {
		return nil, api.ErrNotFound
	}
	rows, err := s.pool.Query(ctx, `
		SELECT p.user_id::text, p.nickname, gm.role,
		       COALESCE(current_read.title, ''), COALESCE(current_read.normalized_progress, -1),
		       EXISTS(SELECT 1 FROM reading_presence rp WHERE rp.user_id = p.user_id AND rp.expires_at > now())
		FROM group_members gm
		JOIN profiles p ON p.user_id = gm.user_id
		JOIN users member_user ON member_user.id = gm.user_id AND member_user.deletion_requested_at IS NULL
		LEFT JOIN LATERAL (
			SELECT w.title, rr.normalized_progress FROM reading_runs rr
			JOIN editions e ON e.id = rr.edition_id JOIN works w ON w.id = e.work_id
			WHERE rr.user_id = p.user_id AND rr.status = 'reading'
			ORDER BY rr.updated_at DESC LIMIT 1
		) current_read ON true
		WHERE gm.group_id = $1::uuid
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_member
		      WHERE hidden_member.target_type = 'user' AND hidden_member.target_id = p.user_id
		  )
		ORDER BY CASE gm.role WHEN 'owner' THEN 0 ELSE 1 END, p.nickname`, groupID)
	if err != nil {
		return nil, fmt.Errorf("list group members: %w", err)
	}
	defer rows.Close()
	items := make([]api.GroupMember, 0)
	for rows.Next() {
		var item api.GroupMember
		var progress int
		if err := rows.Scan(&item.UserID, &item.Nickname, &item.Role, &item.CurrentTitle, &progress, &item.ReadingNow); err != nil {
			return nil, fmt.Errorf("scan group member: %w", err)
		}
		if progress >= 0 {
			item.NormalizedProgress = &progress
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) CreateGroupInvite(ctx context.Context, userID, groupID string) (api.FriendInvite, error) {
	var member bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM group_members WHERE group_id = $1::uuid AND user_id = $2::uuid)`, groupID, userID).Scan(&member); err != nil {
		return api.FriendInvite{}, fmt.Errorf("check group invite membership: %w", err)
	}
	if !member {
		return api.FriendInvite{}, api.ErrNotFound
	}
	var item api.FriendInvite
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO group_invites (group_id, inviter_id) VALUES ($1::uuid, $2::uuid)
		RETURNING token::text, expires_at`, groupID, userID).Scan(&item.Token, &item.ExpiresAt); err != nil {
		return api.FriendInvite{}, fmt.Errorf("insert group invite: %w", err)
	}
	item.DeepLink = "bookgyeol://group-invite/" + item.Token
	return item, nil
}

func (s *Store) AcceptGroupInvite(ctx context.Context, userID, token string) (api.ReadingGroup, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return api.ReadingGroup{}, fmt.Errorf("begin accept group invite: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := ensureUser(ctx, tx, userID, ""); err != nil {
		return api.ReadingGroup{}, err
	}
	var item api.ReadingGroup
	err = tx.QueryRow(ctx, `
		SELECT g.id::text, g.name, g.created_at,
		       (SELECT COUNT(*)::int FROM group_members WHERE group_id = g.id)
		FROM group_invites gi JOIN reading_groups g ON g.id = gi.group_id
		WHERE gi.token = $1::uuid AND gi.accepted_at IS NULL AND gi.expires_at > now()
		FOR UPDATE OF gi`, token).Scan(&item.ID, &item.Name, &item.CreatedAt, &item.MemberCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return api.ReadingGroup{}, api.ErrNotFound
	}
	if err != nil {
		return api.ReadingGroup{}, fmt.Errorf("lock group invite: %w", err)
	}
	if item.MemberCount >= 20 {
		return api.ReadingGroup{}, fmt.Errorf("%w: 그룹 정원은 20명입니다", api.ErrConflict)
	}
	var userGroupCount int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*)::int FROM group_members WHERE user_id = $1::uuid`, userID).Scan(&userGroupCount); err != nil {
		return api.ReadingGroup{}, fmt.Errorf("count accepted groups: %w", err)
	}
	if userGroupCount >= 20 {
		return api.ReadingGroup{}, fmt.Errorf("%w: 그룹은 최대 20개까지 참여할 수 있습니다", api.ErrConflict)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO group_members (group_id, user_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`, item.ID, userID); err != nil {
		return api.ReadingGroup{}, fmt.Errorf("insert accepted group member: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE group_invites SET accepted_by = $2::uuid, accepted_at = now() WHERE token = $1::uuid`, token, userID); err != nil {
		return api.ReadingGroup{}, fmt.Errorf("complete group invite: %w", err)
	}
	item.Role = "member"
	item.MemberCount++
	if err := tx.Commit(ctx); err != nil {
		return api.ReadingGroup{}, fmt.Errorf("commit group invite: %w", err)
	}
	return item, nil
}

func (s *Store) LeaveGroup(ctx context.Context, userID, groupID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin leave group: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var role string
	err = tx.QueryRow(ctx, `SELECT role FROM group_members WHERE group_id = $1::uuid AND user_id = $2::uuid FOR UPDATE`, groupID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return api.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("load leaving membership: %w", err)
	}
	if role == "owner" {
		var count int
		if err := tx.QueryRow(ctx, `SELECT COUNT(*)::int FROM group_members WHERE group_id = $1::uuid`, groupID).Scan(&count); err != nil {
			return err
		}
		if count > 1 {
			return fmt.Errorf("%w: 소유자는 멤버가 있는 그룹을 나갈 수 없습니다", api.ErrConflict)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM reading_groups WHERE id = $1::uuid`, groupID); err != nil {
			return fmt.Errorf("delete empty group: %w", err)
		}
	} else if _, err := tx.Exec(ctx, `DELETE FROM group_members WHERE group_id = $1::uuid AND user_id = $2::uuid`, groupID, userID); err != nil {
		return fmt.Errorf("leave group: %w", err)
	}
	return tx.Commit(ctx)
}

func (s *Store) SetReadingPresence(ctx context.Context, userID, runID string, active bool) error {
	if !active {
		_, err := s.pool.Exec(ctx, `DELETE FROM reading_presence WHERE user_id = $1::uuid`, userID)
		if err != nil {
			return fmt.Errorf("stop reading presence: %w", err)
		}
		return nil
	}
	result, err := s.pool.Exec(ctx, `
		INSERT INTO reading_presence (user_id, reading_run_id, started_at, expires_at)
		SELECT $1::uuid, id, now(), now() + interval '2 hours'
		FROM reading_runs WHERE id = $2::uuid AND user_id = $1::uuid AND status = 'reading'
		ON CONFLICT (user_id) DO UPDATE SET reading_run_id = EXCLUDED.reading_run_id, started_at = now(), expires_at = now() + interval '2 hours'`, userID, runID)
	if err != nil {
		return fmt.Errorf("start reading presence: %w", err)
	}
	if result.RowsAffected() == 0 {
		return api.ErrNotFound
	}
	return nil
}

func (s *Store) GetWeeklyReport(ctx context.Context, userID string) (api.WeeklyReport, error) {
	var item api.WeeklyReport
	err := s.pool.QueryRow(ctx, `
		WITH bounds AS (
			SELECT date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') AS week_start,
			       date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') + interval '6 days' AS week_end
		), friends AS (
			SELECT CASE WHEN f.user_low = $1::uuid THEN f.user_high ELSE f.user_low END AS friend_id
			FROM friendships f WHERE f.status = 'accepted' AND (f.user_low = $1::uuid OR f.user_high = $1::uuid)
		), my_days AS (
			SELECT DISTINCT (pe.recorded_at AT TIME ZONE 'Asia/Seoul')::date AS day
			FROM progress_entries pe JOIN reading_runs rr ON rr.id = pe.reading_run_id, bounds b
			WHERE rr.user_id = $1::uuid AND pe.recorded_at >= b.week_start AT TIME ZONE 'Asia/Seoul'
		), friend_activity AS (
			SELECT DISTINCT rr.user_id, (pe.recorded_at AT TIME ZONE 'Asia/Seoul')::date AS day
			FROM progress_entries pe JOIN reading_runs rr ON rr.id = pe.reading_run_id JOIN friends f ON f.friend_id = rr.user_id, bounds b
			WHERE pe.recorded_at >= b.week_start AT TIME ZONE 'Asia/Seoul'
		)
		SELECT to_char(b.week_start, 'YYYY-MM-DD'), to_char(b.week_end, 'YYYY-MM-DD'),
		       (SELECT COUNT(DISTINCT md.day)::int FROM my_days md JOIN friend_activity fa ON fa.day = md.day),
		       (SELECT COUNT(DISTINCT user_id)::int FROM friend_activity),
		       (SELECT COUNT(*)::int FROM feed_events fe JOIN friends f ON f.friend_id = fe.actor_id WHERE fe.occurred_at >= b.week_start AT TIME ZONE 'Asia/Seoul' AND fe.superseded_at IS NULL),
		       (SELECT COUNT(*)::int FROM reactions r WHERE r.user_id = $1::uuid AND r.created_at >= b.week_start AT TIME ZONE 'Asia/Seoul'),
		       (SELECT COUNT(*)::int FROM reactions r JOIN feed_events fe ON fe.id = r.feed_event_id WHERE fe.actor_id = $1::uuid AND r.created_at >= b.week_start AT TIME ZONE 'Asia/Seoul'),
		       (SELECT COALESCE(SUM(pe.duration_seconds), 0)::int FROM progress_entries pe JOIN reading_runs rr ON rr.id = pe.reading_run_id WHERE rr.user_id = $1::uuid AND pe.recorded_at >= b.week_start AT TIME ZONE 'Asia/Seoul'),
		       (SELECT COUNT(*)::int FROM reading_runs rr WHERE rr.user_id = $1::uuid AND rr.finished_at >= b.week_start AT TIME ZONE 'Asia/Seoul')
		FROM bounds b`, userID).Scan(&item.WeekStart, &item.WeekEnd, &item.ConnectedReadingDays,
		&item.ActiveFriends, &item.FriendUpdates, &item.ReactionsSent, &item.ReactionsReceived,
		&item.MyDurationSeconds, &item.MyFinishedBooks)
	if err != nil {
		return api.WeeklyReport{}, fmt.Errorf("get weekly report: %w", err)
	}
	return item, nil
}

var _ api.GroupStore = (*Store)(nil)
