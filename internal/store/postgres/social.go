package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/datau/book/internal/api"
	"github.com/jackc/pgx/v5"
)

func (s *Store) ListFriends(ctx context.Context, userID string) ([]api.Friend, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT p.user_id::text, p.nickname, COALESCE(p.avatar_url, ''), p.bio,
		       COALESCE(current_read.title, ''), COALESCE(current_read.normalized_progress, -1),
		       EXISTS(SELECT 1 FROM reading_presence rp WHERE rp.user_id = p.user_id AND rp.expires_at > now())
		FROM friendships f
		JOIN profiles p ON p.user_id = CASE WHEN f.user_low = $1::uuid THEN f.user_high ELSE f.user_low END
		JOIN users friend_user ON friend_user.id = p.user_id AND friend_user.deletion_requested_at IS NULL
		LEFT JOIN LATERAL (
			SELECT w.title, rr.normalized_progress
			FROM reading_runs rr
			JOIN editions e ON e.id = rr.edition_id
			JOIN works w ON w.id = e.work_id
			WHERE rr.user_id = p.user_id AND rr.status = 'reading'
			ORDER BY rr.updated_at DESC
			LIMIT 1
		) current_read ON true
		WHERE f.status = 'accepted'
		  AND (f.user_low = $1::uuid OR f.user_high = $1::uuid)
		  AND NOT EXISTS (
			SELECT 1 FROM moderation_hidden_targets hidden_friend
			WHERE hidden_friend.target_type = 'user' AND hidden_friend.target_id = p.user_id
		  )
		  AND NOT EXISTS (
			SELECT 1 FROM blocks b
			WHERE (b.blocker_id = $1::uuid AND b.blocked_id = p.user_id)
			   OR (b.blocker_id = p.user_id AND b.blocked_id = $1::uuid)
		  )
		ORDER BY p.nickname`, userID)
	if err != nil {
		return nil, fmt.Errorf("list friends: %w", err)
	}
	defer rows.Close()

	items := make([]api.Friend, 0)
	for rows.Next() {
		var item api.Friend
		var progress int
		if err := rows.Scan(&item.UserID, &item.Nickname, &item.AvatarURL, &item.Bio, &item.CurrentTitle, &progress, &item.ReadingNow); err != nil {
			return nil, fmt.Errorf("scan friend: %w", err)
		}
		if progress >= 0 {
			item.NormalizedProgress = &progress
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate friends: %w", err)
	}
	return items, nil
}

func (s *Store) CreateFriendInvite(ctx context.Context, userID string) (api.FriendInvite, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return api.FriendInvite{}, fmt.Errorf("begin friend invite: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := ensureUser(ctx, tx, userID, ""); err != nil {
		return api.FriendInvite{}, err
	}
	var item api.FriendInvite
	if err := tx.QueryRow(ctx, `
		INSERT INTO friend_invites (inviter_id)
		VALUES ($1::uuid)
		RETURNING token::text, expires_at`, userID).Scan(&item.Token, &item.ExpiresAt); err != nil {
		return api.FriendInvite{}, fmt.Errorf("insert friend invite: %w", err)
	}
	item.DeepLink = "bookgyeol://invite/" + item.Token
	if err := tx.Commit(ctx); err != nil {
		return api.FriendInvite{}, fmt.Errorf("commit friend invite: %w", err)
	}
	return item, nil
}

func (s *Store) AcceptFriendInvite(ctx context.Context, userID, token string) (api.Friend, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return api.Friend{}, fmt.Errorf("begin accept invite: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := ensureUser(ctx, tx, userID, ""); err != nil {
		return api.Friend{}, err
	}

	var inviterID string
	err = tx.QueryRow(ctx, `
		SELECT inviter_id::text
		FROM friend_invites
		WHERE token = $1::uuid AND accepted_at IS NULL AND expires_at > now()
		FOR UPDATE`, token).Scan(&inviterID)
	if errors.Is(err, pgx.ErrNoRows) {
		return api.Friend{}, api.ErrNotFound
	}
	if err != nil {
		return api.Friend{}, fmt.Errorf("lock friend invite: %w", err)
	}
	if inviterID == userID {
		return api.Friend{}, fmt.Errorf("%w: 자신의 초대는 수락할 수 없습니다", api.ErrConflict)
	}

	var blocked bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM blocks
			WHERE (blocker_id = $1::uuid AND blocked_id = $2::uuid)
			   OR (blocker_id = $2::uuid AND blocked_id = $1::uuid)
		)`, userID, inviterID).Scan(&blocked); err != nil {
		return api.Friend{}, fmt.Errorf("check invite block: %w", err)
	}
	if blocked {
		return api.Friend{}, fmt.Errorf("%w: 차단된 관계에서는 초대를 수락할 수 없습니다", api.ErrConflict)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO friendships (requester_id, addressee_id, user_low, user_high, status, accepted_at)
		VALUES ($1::uuid, $2::uuid, LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), 'accepted', now())
		ON CONFLICT (user_low, user_high) DO UPDATE
		SET requester_id = EXCLUDED.requester_id,
		    addressee_id = EXCLUDED.addressee_id,
		    status = 'accepted',
		    accepted_at = now()`, inviterID, userID); err != nil {
		return api.Friend{}, fmt.Errorf("upsert friendship: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE friend_invites SET accepted_by = $2::uuid, accepted_at = now()
		WHERE token = $1::uuid`, token, userID); err != nil {
		return api.Friend{}, fmt.Errorf("complete friend invite: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
		SELECT 'friendship', id, 'friendship.accepted',
		       jsonb_build_object('userId', $1::text, 'friendId', $2::text)
		FROM friendships WHERE user_low = LEAST($1::uuid, $2::uuid) AND user_high = GREATEST($1::uuid, $2::uuid)`, userID, inviterID); err != nil {
		return api.Friend{}, fmt.Errorf("queue friendship event: %w", err)
	}

	var friend api.Friend
	if err := tx.QueryRow(ctx, `
		SELECT p.user_id::text, p.nickname, COALESCE(p.avatar_url, ''), p.bio
		FROM profiles p WHERE p.user_id = $1::uuid`, inviterID).
		Scan(&friend.UserID, &friend.Nickname, &friend.AvatarURL, &friend.Bio); err != nil {
		return api.Friend{}, fmt.Errorf("load accepted friend: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return api.Friend{}, fmt.Errorf("commit accept invite: %w", err)
	}
	return friend, nil
}

func (s *Store) RemoveFriend(ctx context.Context, userID, friendID string) error {
	result, err := s.pool.Exec(ctx, `
		UPDATE friendships SET status = 'removed'
		WHERE user_low = LEAST($1::uuid, $2::uuid)
		  AND user_high = GREATEST($1::uuid, $2::uuid)
		  AND status = 'accepted'`, userID, friendID)
	if err != nil {
		return fmt.Errorf("remove friendship: %w", err)
	}
	if result.RowsAffected() == 0 {
		return api.ErrNotFound
	}
	return nil
}

func (s *Store) SetBlock(ctx context.Context, userID, targetID string, active bool) error {
	if active {
		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin block user: %w", err)
		}
		defer func() { _ = tx.Rollback(ctx) }()
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1::uuid)`, targetID).Scan(&exists); err != nil {
			return fmt.Errorf("check blocked user: %w", err)
		}
		if !exists {
			return api.ErrNotFound
		}
		if _, err := tx.Exec(ctx, `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`, userID, targetID); err != nil {
			return fmt.Errorf("insert block: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE friendships SET status = 'removed'
			WHERE user_low = LEAST($1::uuid, $2::uuid) AND user_high = GREATEST($1::uuid, $2::uuid)`, userID, targetID); err != nil {
			return fmt.Errorf("remove blocked friendship: %w", err)
		}
		return tx.Commit(ctx)
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM blocks WHERE blocker_id = $1::uuid AND blocked_id = $2::uuid`, userID, targetID); err != nil {
		return fmt.Errorf("remove block: %w", err)
	}
	return nil
}

func (s *Store) canViewFeed(ctx context.Context, userID, eventID string) (bool, error) {
	var visible bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM feed_events fe
			JOIN users actor_user ON actor_user.id = fe.actor_id AND actor_user.deletion_requested_at IS NULL
			WHERE fe.id = $2::uuid AND fe.superseded_at IS NULL
			  AND NOT EXISTS (
				SELECT 1 FROM moderation_hidden_targets hidden_feed
				WHERE hidden_feed.target_type = 'feed_event' AND hidden_feed.target_id = fe.id
			  )
			  AND NOT EXISTS (
				SELECT 1 FROM moderation_hidden_targets hidden_actor
				WHERE hidden_actor.target_type = 'user' AND hidden_actor.target_id = fe.actor_id
			  )
			  AND NOT EXISTS (
				SELECT 1 FROM blocks b
				WHERE (b.blocker_id = $1::uuid AND b.blocked_id = fe.actor_id)
				   OR (b.blocker_id = fe.actor_id AND b.blocked_id = $1::uuid)
			  )
			  AND (
				fe.actor_id = $1::uuid
				OR (fe.visibility = 'friends' AND EXISTS (
					SELECT 1 FROM friendships f
					WHERE f.status = 'accepted'
					  AND f.user_low = LEAST($1::uuid, fe.actor_id)
					  AND f.user_high = GREATEST($1::uuid, fe.actor_id)
				))
				OR (fe.visibility = 'group' AND EXISTS (
					SELECT 1 FROM group_members gm
					WHERE gm.group_id = fe.group_id AND gm.user_id = $1::uuid
				))
				OR fe.visibility = 'public'
			  )
		)`, userID, eventID).Scan(&visible)
	return visible, err
}

func (s *Store) SetReaction(ctx context.Context, userID, eventID string, active bool) error {
	visible, err := s.canViewFeed(ctx, userID, eventID)
	if err != nil {
		return fmt.Errorf("check reaction visibility: %w", err)
	}
	if !visible {
		return api.ErrNotFound
	}
	if active {
		_, err = s.pool.Exec(ctx, `
			INSERT INTO reactions (feed_event_id, user_id, kind)
			VALUES ($1::uuid, $2::uuid, 'cheer') ON CONFLICT DO NOTHING`, eventID, userID)
	} else {
		_, err = s.pool.Exec(ctx, `DELETE FROM reactions WHERE feed_event_id = $1::uuid AND user_id = $2::uuid`, eventID, userID)
	}
	if err != nil {
		return fmt.Errorf("set reaction: %w", err)
	}
	return nil
}

func (s *Store) ListComments(ctx context.Context, userID, eventID string) ([]api.FeedComment, error) {
	visible, err := s.canViewFeed(ctx, userID, eventID)
	if err != nil {
		return nil, fmt.Errorf("check comments visibility: %w", err)
	}
	if !visible {
		return nil, api.ErrNotFound
	}

	var workID string
	if err := s.pool.QueryRow(ctx, `
		SELECT e.work_id::text
		FROM feed_events fe
		JOIN reading_runs rr ON rr.id = fe.reading_run_id
		JOIN editions e ON e.id = rr.edition_id
		WHERE fe.id = $1::uuid`, eventID).Scan(&workID); err != nil {
		return nil, fmt.Errorf("load comment work: %w", err)
	}
	var viewerProgress int
	if err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(rr.normalized_progress), 0)
		FROM reading_runs rr JOIN editions e ON e.id = rr.edition_id
		WHERE rr.user_id = $1::uuid AND e.work_id = $2::uuid`, userID, workID).Scan(&viewerProgress); err != nil {
		return nil, fmt.Errorf("load viewer progress: %w", err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT c.id::text, c.author_id::text, p.nickname, COALESCE(c.parent_id::text, ''),
		       c.normalized_anchor, c.reveal_policy, c.body, c.created_at
		FROM anchored_comments c
		JOIN profiles p ON p.user_id = c.author_id
		JOIN users comment_author ON comment_author.id = c.author_id AND comment_author.deletion_requested_at IS NULL
		WHERE c.feed_event_id = $1::uuid AND c.deleted_at IS NULL
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_comment
		      WHERE hidden_comment.target_type = 'comment' AND hidden_comment.target_id = c.id
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_author
		      WHERE hidden_author.target_type = 'user' AND hidden_author.target_id = c.author_id
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM blocks b
		      WHERE (b.blocker_id = $2::uuid AND b.blocked_id = c.author_id)
		         OR (b.blocker_id = c.author_id AND b.blocked_id = $2::uuid)
		  )
		ORDER BY c.created_at, c.id`, eventID, userID)
	if err != nil {
		return nil, fmt.Errorf("list comments: %w", err)
	}
	defer rows.Close()
	items := make([]api.FeedComment, 0)
	for rows.Next() {
		var item api.FeedComment
		if err := rows.Scan(&item.ID, &item.AuthorID, &item.AuthorNickname, &item.ParentID,
			&item.NormalizedAnchor, &item.RevealPolicy, &item.Body, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan comment: %w", err)
		}
		item.Locked = item.AuthorID != userID && item.RevealPolicy != "always" &&
			((item.RevealPolicy == "after_position" && viewerProgress < item.NormalizedAnchor) ||
				(item.RevealPolicy == "finished" && viewerProgress < 10000))
		if item.Locked {
			item.Body = ""
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate comments: %w", err)
	}
	return items, nil
}

func (s *Store) CreateComment(ctx context.Context, userID, eventID string, command api.CreateCommentCommand) (api.FeedComment, error) {
	visible, err := s.canViewFeed(ctx, userID, eventID)
	if err != nil {
		return api.FeedComment{}, fmt.Errorf("check create comment visibility: %w", err)
	}
	if !visible {
		return api.FeedComment{}, api.ErrNotFound
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return api.FeedComment{}, fmt.Errorf("begin create comment: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var eventProgress int
	if err := tx.QueryRow(ctx, `
		SELECT pe.new_normalized_progress
		FROM feed_events fe JOIN progress_entries pe ON pe.id = fe.progress_entry_id
		WHERE fe.id = $1::uuid`, eventID).Scan(&eventProgress); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return api.FeedComment{}, api.ErrNotFound
		}
		return api.FeedComment{}, fmt.Errorf("load event anchor: %w", err)
	}
	anchor := eventProgress
	if command.NormalizedAnchor != nil {
		anchor = *command.NormalizedAnchor
	}
	if command.ParentID != "" {
		var parentExists bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM anchored_comments c
				WHERE c.id = $1::uuid AND c.feed_event_id = $2::uuid AND c.deleted_at IS NULL
				  AND NOT EXISTS (
				      SELECT 1 FROM moderation_hidden_targets hidden_comment
				      WHERE hidden_comment.target_type = 'comment' AND hidden_comment.target_id = c.id
				  )
				  AND NOT EXISTS (
				      SELECT 1 FROM moderation_hidden_targets hidden_author
				      WHERE hidden_author.target_type = 'user' AND hidden_author.target_id = c.author_id
				  )
			)`,
			command.ParentID, eventID).Scan(&parentExists); err != nil {
			return api.FeedComment{}, fmt.Errorf("check parent comment: %w", err)
		}
		if !parentExists {
			return api.FeedComment{}, api.ErrNotFound
		}
	}

	item := api.FeedComment{
		AuthorID: userID, ParentID: command.ParentID, NormalizedAnchor: anchor,
		RevealPolicy: command.RevealPolicy, Body: command.Body, Locked: false, CreatedAt: time.Now().UTC(),
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO anchored_comments (feed_event_id, author_id, parent_id, normalized_anchor, reveal_policy, body, created_at)
		VALUES ($1::uuid, $2::uuid, NULLIF($3, '')::uuid, $4, $5, $6, $7)
		RETURNING id::text`, eventID, userID, command.ParentID, anchor, command.RevealPolicy, command.Body, item.CreatedAt).
		Scan(&item.ID); err != nil {
		return api.FeedComment{}, fmt.Errorf("insert comment: %w", err)
	}
	if err := tx.QueryRow(ctx, `SELECT nickname FROM profiles WHERE user_id = $1::uuid`, userID).Scan(&item.AuthorNickname); err != nil {
		return api.FeedComment{}, fmt.Errorf("load comment author: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
		VALUES ('comment', $1::uuid, 'comment.created', jsonb_build_object('commentId', $1::text, 'feedEventId', $2::text, 'authorId', $3::text))`,
		item.ID, eventID, userID); err != nil {
		return api.FeedComment{}, fmt.Errorf("queue comment event: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return api.FeedComment{}, fmt.Errorf("commit create comment: %w", err)
	}
	return item, nil
}

func (s *Store) CreateReport(ctx context.Context, reporterID, targetType, targetID, reason, detail string) error {
	var targetExists bool
	var err error
	switch targetType {
	case "user":
		err = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1::uuid)`, targetID).Scan(&targetExists)
	case "feed_event":
		err = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM feed_events WHERE id = $1::uuid AND superseded_at IS NULL)`, targetID).Scan(&targetExists)
	case "comment":
		err = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM anchored_comments WHERE id = $1::uuid AND deleted_at IS NULL)`, targetID).Scan(&targetExists)
	default:
		return fmt.Errorf("%w: 지원하지 않는 신고 대상입니다", api.ErrInvalid)
	}
	if err != nil {
		return fmt.Errorf("check report target: %w", err)
	}
	if !targetExists {
		return api.ErrNotFound
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO reports (reporter_id, target_type, target_id, reason, detail)
		VALUES ($1::uuid, $2, $3::uuid, $4, $5)`, reporterID, targetType, targetID, reason, detail)
	if err != nil {
		return fmt.Errorf("insert report: %w", err)
	}
	return nil
}

var _ api.SocialStore = (*Store)(nil)
