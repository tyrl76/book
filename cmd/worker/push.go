package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type outboxEvent struct{ id, aggregateID, eventType, payload string }

type notificationTarget struct {
	tokenID, userID, token, quietStart, quietEnd string
}

type queuedNotification struct {
	target           notificationTarget
	title, body, url string
}

func enqueueNotificationDeliveries(ctx context.Context, tx pgx.Tx, event outboxEvent) error {
	switch event.eventType {
	case "feed_event.created":
		return enqueueFeedNotifications(ctx, tx, event)
	case "comment.created":
		return enqueueCommentNotifications(ctx, tx, event)
	case "friendship.accepted":
		return enqueueFriendshipNotifications(ctx, tx, event)
	default:
		return nil
	}
}

func enqueueFeedNotifications(ctx context.Context, tx pgx.Tx, event outboxEvent) error {
	rows, err := tx.Query(ctx, `
		SELECT dpt.id::text, dpt.user_id::text, dpt.token,
		       COALESCE(to_char(np.quiet_start, 'HH24:MI'), ''), COALESCE(to_char(np.quiet_end, 'HH24:MI'), ''),
		       actor.nickname, w.title, fe.type, fe.id::text
		FROM feed_events fe
		JOIN users actor_user ON actor_user.id = fe.actor_id AND actor_user.deletion_requested_at IS NULL
		JOIN profiles actor ON actor.user_id = fe.actor_id
		JOIN reading_runs rr ON rr.id = fe.reading_run_id
		JOIN editions ed ON ed.id = rr.edition_id
		JOIN works w ON w.id = ed.work_id
		JOIN device_push_tokens dpt ON dpt.user_id <> fe.actor_id AND dpt.enabled
		JOIN users target_user ON target_user.id = dpt.user_id AND target_user.deletion_requested_at IS NULL
		LEFT JOIN notification_preferences np ON np.user_id = dpt.user_id
		WHERE fe.id = $1::uuid
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_feed
		      WHERE hidden_feed.target_type = 'feed_event' AND hidden_feed.target_id = fe.id
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_actor
		      WHERE hidden_actor.target_type = 'user' AND hidden_actor.target_id = fe.actor_id
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_target
		      WHERE hidden_target.target_type = 'user' AND hidden_target.target_id = dpt.user_id
		  )
		  AND COALESCE(np.push_enabled, true) AND COALESCE(np.milestones, true)
		  AND NOT EXISTS (
		      SELECT 1 FROM blocks b
		      WHERE (b.blocker_id = dpt.user_id AND b.blocked_id = fe.actor_id)
		         OR (b.blocker_id = fe.actor_id AND b.blocked_id = dpt.user_id)
		  )
		  AND (
		      (fe.visibility IN ('friends', 'public') AND EXISTS (
		          SELECT 1 FROM friendships f WHERE f.status = 'accepted'
		            AND f.user_low = LEAST(dpt.user_id, fe.actor_id)
		            AND f.user_high = GREATEST(dpt.user_id, fe.actor_id)
		      ))
		      OR (fe.visibility = 'group' AND EXISTS (
		          SELECT 1 FROM group_members gm WHERE gm.group_id = fe.group_id AND gm.user_id = dpt.user_id
		      ))
		  )`, event.aggregateID)
	if err != nil {
		return fmt.Errorf("query feed notification targets: %w", err)
	}
	items := make([]queuedNotification, 0)
	for rows.Next() {
		var target notificationTarget
		var actor, bookTitle, eventType, eventID string
		if err := rows.Scan(&target.tokenID, &target.userID, &target.token, &target.quietStart, &target.quietEnd,
			&actor, &bookTitle, &eventType, &eventID); err != nil {
			return err
		}
		body := actor + "님이 『" + bookTitle + "』 독서를 시작했어요."
		if eventType != "started" {
			body = actor + "님이 『" + bookTitle + "』의 새 독서 지점에 도착했어요."
		}
		items = append(items, queuedNotification{target: target, title: "친구의 독서 소식", body: body, url: "/comments/" + eventID})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for _, item := range items {
		if err := insertDelivery(ctx, tx, event.id, item.target, item.title, item.body, item.url); err != nil {
			return err
		}
	}
	return nil
}

func enqueueCommentNotifications(ctx context.Context, tx pgx.Tx, event outboxEvent) error {
	rows, err := tx.Query(ctx, `
		SELECT dpt.id::text, dpt.user_id::text, dpt.token,
		       COALESCE(to_char(np.quiet_start, 'HH24:MI'), ''), COALESCE(to_char(np.quiet_end, 'HH24:MI'), ''),
		       author.nickname, w.title, fe.id::text
		FROM anchored_comments c
		JOIN users author_user ON author_user.id = c.author_id AND author_user.deletion_requested_at IS NULL
		JOIN profiles author ON author.user_id = c.author_id
		JOIN feed_events fe ON fe.id = c.feed_event_id
		JOIN users feed_actor_user ON feed_actor_user.id = fe.actor_id AND feed_actor_user.deletion_requested_at IS NULL
		JOIN reading_runs rr ON rr.id = fe.reading_run_id
		JOIN editions ed ON ed.id = rr.edition_id
		JOIN works w ON w.id = ed.work_id
		JOIN device_push_tokens dpt ON dpt.user_id = fe.actor_id AND dpt.enabled
		LEFT JOIN notification_preferences np ON np.user_id = dpt.user_id
		WHERE c.id = $1::uuid AND c.author_id <> fe.actor_id
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_comment
		      WHERE hidden_comment.target_type = 'comment' AND hidden_comment.target_id = c.id
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_author
		      WHERE hidden_author.target_type = 'user' AND hidden_author.target_id = c.author_id
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_feed
		      WHERE hidden_feed.target_type = 'feed_event' AND hidden_feed.target_id = fe.id
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_recipient
		      WHERE hidden_recipient.target_type = 'user' AND hidden_recipient.target_id = fe.actor_id
		  )
		  AND COALESCE(np.push_enabled, true) AND COALESCE(np.comments, true)`, event.aggregateID)
	if err != nil {
		return fmt.Errorf("query comment notification targets: %w", err)
	}
	items := make([]queuedNotification, 0)
	for rows.Next() {
		var target notificationTarget
		var author, bookTitle, feedEventID string
		if err := rows.Scan(&target.tokenID, &target.userID, &target.token, &target.quietStart, &target.quietEnd,
			&author, &bookTitle, &feedEventID); err != nil {
			return err
		}
		body := author + "님이 『" + bookTitle + "』 기록에 한마디를 남겼어요."
		items = append(items, queuedNotification{target: target, title: "새 독서 대화", body: body, url: "/comments/" + feedEventID})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for _, item := range items {
		if err := insertDelivery(ctx, tx, event.id, item.target, item.title, item.body, item.url); err != nil {
			return err
		}
	}
	return nil
}

func enqueueFriendshipNotifications(ctx context.Context, tx pgx.Tx, event outboxEvent) error {
	var payload struct {
		UserID   string `json:"userId"`
		FriendID string `json:"friendId"`
	}
	if err := json.Unmarshal([]byte(event.payload), &payload); err != nil {
		return fmt.Errorf("decode friendship payload: %w", err)
	}
	rows, err := tx.Query(ctx, `
		SELECT dpt.id::text, dpt.user_id::text, dpt.token,
		       COALESCE(to_char(np.quiet_start, 'HH24:MI'), ''), COALESCE(to_char(np.quiet_end, 'HH24:MI'), ''),
		       p.nickname
		FROM device_push_tokens dpt
		JOIN profiles p ON p.user_id = $1::uuid
		JOIN users sender_user ON sender_user.id = $1::uuid AND sender_user.deletion_requested_at IS NULL
		JOIN users target_user ON target_user.id = dpt.user_id AND target_user.deletion_requested_at IS NULL
		LEFT JOIN notification_preferences np ON np.user_id = dpt.user_id
		WHERE dpt.user_id = $2::uuid AND dpt.enabled
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_sender
		      WHERE hidden_sender.target_type = 'user' AND hidden_sender.target_id = $1::uuid
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM moderation_hidden_targets hidden_target
		      WHERE hidden_target.target_type = 'user' AND hidden_target.target_id = dpt.user_id
		  )
		  AND COALESCE(np.push_enabled, true) AND COALESCE(np.friend_requests, true)`, payload.UserID, payload.FriendID)
	if err != nil {
		return fmt.Errorf("query friendship notification targets: %w", err)
	}
	items := make([]queuedNotification, 0)
	for rows.Next() {
		var target notificationTarget
		var nickname string
		if err := rows.Scan(&target.tokenID, &target.userID, &target.token, &target.quietStart, &target.quietEnd, &nickname); err != nil {
			return err
		}
		items = append(items, queuedNotification{target: target, title: "친구 연결 완료", body: nickname + "님과 독서 친구가 되었어요.", url: "/friends"})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for _, item := range items {
		if err := insertDelivery(ctx, tx, event.id, item.target, item.title, item.body, item.url); err != nil {
			return err
		}
	}
	return nil
}

func insertDelivery(ctx context.Context, tx pgx.Tx, eventID string, target notificationTarget, title, body, url string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO notification_deliveries
		    (outbox_event_id, user_id, push_token_id, title, body, url, available_at)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7)
		ON CONFLICT (outbox_event_id, push_token_id) DO NOTHING`,
		eventID, target.userID, target.tokenID, title, body, url, afterQuietHours(time.Now(), target.quietStart, target.quietEnd))
	if err != nil {
		return fmt.Errorf("insert notification delivery: %w", err)
	}
	return nil
}

func afterQuietHours(now time.Time, start, end string) time.Time {
	if start == "" || end == "" || start == end {
		return now
	}
	location, err := time.LoadLocation("Asia/Seoul")
	if err != nil {
		location = time.FixedZone("Asia/Seoul", 9*60*60)
	}
	local := now.In(location)
	startClock, startErr := time.Parse("15:04", start)
	endClock, endErr := time.Parse("15:04", end)
	if startErr != nil || endErr != nil {
		return now
	}
	minute := local.Hour()*60 + local.Minute()
	startMinute := startClock.Hour()*60 + startClock.Minute()
	endMinute := endClock.Hour()*60 + endClock.Minute()
	quiet := (startMinute < endMinute && minute >= startMinute && minute < endMinute) ||
		(startMinute > endMinute && (minute >= startMinute || minute < endMinute))
	if !quiet {
		return now
	}
	endAt := time.Date(local.Year(), local.Month(), local.Day(), endClock.Hour(), endClock.Minute(), 0, 0, location)
	if startMinute > endMinute && minute >= startMinute {
		endAt = endAt.AddDate(0, 0, 1)
	}
	return endAt.UTC()
}

type pushDispatcher struct {
	endpoint string
	client   *http.Client
	logger   *slog.Logger
}

func newPushDispatcher(endpoint string, logger *slog.Logger) *pushDispatcher {
	return &pushDispatcher{endpoint: strings.TrimSpace(endpoint), client: &http.Client{Timeout: 10 * time.Second}, logger: logger}
}

type pendingDelivery struct {
	id, tokenID, token, title, body, url string
	attempts                             int
}

type expoTicket struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Details struct {
		Error string `json:"error"`
	} `json:"details"`
}

func (d *pushDispatcher) deliverBatch(ctx context.Context, pool *pgxpool.Pool) error {
	if d.endpoint == "" {
		return nil
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	_, _ = tx.Exec(ctx, `
		UPDATE notification_deliveries nd SET status = 'failed', last_error = 'push_token_disabled'
		FROM device_push_tokens dpt
		WHERE nd.push_token_id = dpt.id AND nd.status = 'pending' AND NOT dpt.enabled`)
	rows, err := tx.Query(ctx, `
		SELECT nd.id::text, nd.push_token_id::text, dpt.token, nd.title, nd.body, nd.url, nd.attempts
		FROM notification_deliveries nd
		JOIN device_push_tokens dpt ON dpt.id = nd.push_token_id AND dpt.enabled
		WHERE nd.status = 'pending' AND nd.available_at <= now()
		ORDER BY nd.created_at
		FOR UPDATE OF nd SKIP LOCKED
		LIMIT 50`)
	if err != nil {
		return err
	}
	items := make([]pendingDelivery, 0, 50)
	for rows.Next() {
		var item pendingDelivery
		if err := rows.Scan(&item.id, &item.tokenID, &item.token, &item.title, &item.body, &item.url, &item.attempts); err != nil {
			rows.Close()
			return err
		}
		items = append(items, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil || len(items) == 0 {
		if err != nil {
			return err
		}
		return tx.Commit(ctx)
	}

	messages := make([]map[string]any, 0, len(items))
	for _, item := range items {
		messages = append(messages, map[string]any{
			"to": item.token, "title": item.title, "body": item.body,
			"data": map[string]string{"url": item.url}, "channelId": "bookgyeol-social", "priority": "normal",
		})
	}
	body, _ := json.Marshal(messages)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	response, err := d.client.Do(req)
	if err != nil {
		return d.retryBatch(ctx, tx, items, err.Error())
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return d.retryBatch(ctx, tx, items, fmt.Sprintf("expo status %d: %s", response.StatusCode, string(responseBody)))
	}
	var result struct {
		Data []expoTicket `json:"data"`
	}
	if err := json.Unmarshal(responseBody, &result); err != nil || len(result.Data) != len(items) {
		return d.retryBatch(ctx, tx, items, "invalid Expo push response")
	}
	for index, ticket := range result.Data {
		item := items[index]
		if ticket.Status == "ok" {
			if _, err := tx.Exec(ctx, `UPDATE notification_deliveries SET status = 'sent', attempts = attempts + 1, delivered_at = now(), last_error = NULL WHERE id = $1::uuid`, item.id); err != nil {
				return err
			}
			continue
		}
		if ticket.Details.Error == "DeviceNotRegistered" {
			_, _ = tx.Exec(ctx, `UPDATE device_push_tokens SET enabled = false, updated_at = now() WHERE id = $1::uuid`, item.tokenID)
			_, err = tx.Exec(ctx, `UPDATE notification_deliveries SET status = 'failed', attempts = attempts + 1, last_error = $2 WHERE id = $1::uuid`, item.id, ticket.Message)
		} else {
			err = d.retryOne(ctx, tx, item, ticket.Message)
		}
		if err != nil {
			return err
		}
	}
	d.logger.Info("push batch delivered", "count", len(items))
	return tx.Commit(ctx)
}

func (d *pushDispatcher) retryBatch(ctx context.Context, tx pgx.Tx, items []pendingDelivery, message string) error {
	for _, item := range items {
		if err := d.retryOne(ctx, tx, item, message); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (d *pushDispatcher) retryOne(ctx context.Context, tx pgx.Tx, item pendingDelivery, message string) error {
	nextAttempts := item.attempts + 1
	status := "pending"
	if nextAttempts >= 5 {
		status = "failed"
	}
	delay := time.Duration(1<<min(nextAttempts, 6)) * 15 * time.Second
	_, err := tx.Exec(ctx, `
		UPDATE notification_deliveries
		SET status = $2, attempts = attempts + 1, available_at = $3, last_error = $4
		WHERE id = $1::uuid`, item.id, status, time.Now().Add(delay), truncate(message, 1000))
	return err
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}
