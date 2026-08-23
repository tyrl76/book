package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

type Friend struct {
	UserID             string `json:"userId"`
	Nickname           string `json:"nickname"`
	AvatarURL          string `json:"avatarUrl,omitempty"`
	Bio                string `json:"bio"`
	CurrentTitle       string `json:"currentTitle,omitempty"`
	NormalizedProgress *int   `json:"normalizedProgress,omitempty"`
	ReadingNow         bool   `json:"readingNow"`
}

type FriendInvite struct {
	Token     string    `json:"token"`
	DeepLink  string    `json:"deepLink"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type FeedComment struct {
	ID               string    `json:"id"`
	AuthorID         string    `json:"authorId"`
	AuthorNickname   string    `json:"authorNickname"`
	ParentID         string    `json:"parentId,omitempty"`
	NormalizedAnchor int       `json:"normalizedAnchor"`
	RevealPolicy     string    `json:"revealPolicy"`
	Body             string    `json:"body,omitempty"`
	Locked           bool      `json:"locked"`
	CreatedAt        time.Time `json:"createdAt"`
}

type CreateCommentCommand struct {
	Body             string
	ParentID         string
	RevealPolicy     string
	NormalizedAnchor *int
}

type SocialStore interface {
	ListFriends(context.Context, string) ([]Friend, error)
	CreateFriendInvite(context.Context, string) (FriendInvite, error)
	AcceptFriendInvite(context.Context, string, string) (Friend, error)
	RemoveFriend(context.Context, string, string) error
	SetBlock(context.Context, string, string, bool) error
	SetReaction(context.Context, string, string, bool) error
	ListComments(context.Context, string, string) ([]FeedComment, error)
	CreateComment(context.Context, string, string, CreateCommentCommand) (FeedComment, error)
	CreateReport(context.Context, string, string, string, string, string) error
}

func (s *Server) socialStore(response http.ResponseWriter) (SocialStore, bool) {
	store, ok := s.store.(SocialStore)
	if !ok {
		writeError(response, http.StatusNotImplemented, "feature_unavailable", "소셜 기능 저장소가 설정되지 않았습니다")
	}
	return store, ok
}

func (s *Server) listFriends(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.socialStore(response)
	if !ok {
		return
	}
	items, err := store.ListFriends(request.Context(), userID)
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) createFriendInvite(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.socialStore(response)
	if !ok {
		return
	}
	invite, err := store.CreateFriendInvite(request.Context(), userID)
	if err != nil {
		s.internalError(response, err)
		return
	}
	invite.DeepLink = s.invitationURL("invite", invite.Token)
	writeJSON(response, http.StatusCreated, invite)
}

func (s *Server) acceptFriendInvite(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.socialStore(response)
	if !ok {
		return
	}
	token := request.PathValue("token")
	if !uuidPattern.MatchString(token) {
		writeError(response, http.StatusBadRequest, "invalid_invite", "초대 링크 형식이 올바르지 않습니다")
		return
	}
	friend, err := store.AcceptFriendInvite(request.Context(), userID, token)
	if err != nil {
		switch {
		case errors.Is(err, ErrNotFound):
			writeError(response, http.StatusNotFound, "invite_not_found", "만료되었거나 사용할 수 없는 초대입니다")
		case errors.Is(err, ErrConflict):
			writeError(response, http.StatusConflict, "invite_conflict", err.Error())
		default:
			s.internalError(response, err)
		}
		return
	}
	writeJSON(response, http.StatusOK, friend)
}

func (s *Server) removeFriend(response http.ResponseWriter, request *http.Request, userID string) {
	s.changeRelationship(response, request, userID, "remove")
}

func (s *Server) blockUser(response http.ResponseWriter, request *http.Request, userID string) {
	s.changeRelationship(response, request, userID, "block")
}

func (s *Server) unblockUser(response http.ResponseWriter, request *http.Request, userID string) {
	s.changeRelationship(response, request, userID, "unblock")
}

func (s *Server) changeRelationship(response http.ResponseWriter, request *http.Request, userID, action string) {
	store, ok := s.socialStore(response)
	if !ok {
		return
	}
	targetID := request.PathValue("userID")
	if !uuidPattern.MatchString(targetID) || targetID == userID {
		writeError(response, http.StatusBadRequest, "invalid_user", "대상 사용자를 확인해 주세요")
		return
	}
	var err error
	switch action {
	case "remove":
		err = store.RemoveFriend(request.Context(), userID, targetID)
	case "block":
		err = store.SetBlock(request.Context(), userID, targetID, true)
	case "unblock":
		err = store.SetBlock(request.Context(), userID, targetID, false)
	}
	if errors.Is(err, ErrNotFound) {
		writeError(response, http.StatusNotFound, "relationship_not_found", "관계를 찾을 수 없습니다")
		return
	}
	if err != nil {
		s.internalError(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (s *Server) addReaction(response http.ResponseWriter, request *http.Request, userID string) {
	s.changeReaction(response, request, userID, true)
}

func (s *Server) removeReaction(response http.ResponseWriter, request *http.Request, userID string) {
	s.changeReaction(response, request, userID, false)
}

func (s *Server) changeReaction(response http.ResponseWriter, request *http.Request, userID string, active bool) {
	store, ok := s.socialStore(response)
	if !ok {
		return
	}
	eventID := request.PathValue("feedEventID")
	if !uuidPattern.MatchString(eventID) {
		writeError(response, http.StatusBadRequest, "invalid_feed_event", "피드 항목을 확인해 주세요")
		return
	}
	if err := store.SetReaction(request.Context(), userID, eventID, active); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(response, http.StatusNotFound, "feed_event_not_found", "피드 항목을 찾을 수 없습니다")
		} else {
			s.internalError(response, err)
		}
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (s *Server) listComments(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.socialStore(response)
	if !ok {
		return
	}
	eventID := request.PathValue("feedEventID")
	if !uuidPattern.MatchString(eventID) {
		writeError(response, http.StatusBadRequest, "invalid_feed_event", "피드 항목을 확인해 주세요")
		return
	}
	items, err := store.ListComments(request.Context(), userID, eventID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(response, http.StatusNotFound, "feed_event_not_found", "피드 항목을 찾을 수 없습니다")
		} else {
			s.internalError(response, err)
		}
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": items})
}

type createCommentRequest struct {
	Body             string `json:"body"`
	ParentID         string `json:"parentId"`
	RevealPolicy     string `json:"revealPolicy"`
	NormalizedAnchor *int   `json:"normalizedAnchor"`
}

func (s *Server) createComment(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.socialStore(response)
	if !ok {
		return
	}
	eventID := request.PathValue("feedEventID")
	if !uuidPattern.MatchString(eventID) {
		writeError(response, http.StatusBadRequest, "invalid_feed_event", "피드 항목을 확인해 주세요")
		return
	}
	var payload createCommentRequest
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 16<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_json", "요청 본문을 확인해 주세요")
		return
	}
	payload.Body = strings.TrimSpace(payload.Body)
	if payload.RevealPolicy == "" {
		payload.RevealPolicy = "after_position"
	}
	if len([]rune(payload.Body)) < 1 || len([]rune(payload.Body)) > 1000 ||
		(payload.ParentID != "" && !uuidPattern.MatchString(payload.ParentID)) ||
		(payload.RevealPolicy != "always" && payload.RevealPolicy != "after_position" && payload.RevealPolicy != "finished") ||
		(payload.NormalizedAnchor != nil && (*payload.NormalizedAnchor < 0 || *payload.NormalizedAnchor > 10000)) {
		writeError(response, http.StatusBadRequest, "invalid_comment", "댓글 내용과 공개 시점을 확인해 주세요")
		return
	}
	item, err := store.CreateComment(request.Context(), userID, eventID, CreateCommentCommand{
		Body: payload.Body, ParentID: payload.ParentID, RevealPolicy: payload.RevealPolicy, NormalizedAnchor: payload.NormalizedAnchor,
	})
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(response, http.StatusNotFound, "feed_event_not_found", "피드 항목을 찾을 수 없습니다")
		} else {
			s.internalError(response, err)
		}
		return
	}
	writeJSON(response, http.StatusCreated, item)
}

type createReportRequest struct {
	TargetType string `json:"targetType"`
	TargetID   string `json:"targetId"`
	Reason     string `json:"reason"`
	Detail     string `json:"detail"`
}

func (s *Server) createReport(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.socialStore(response)
	if !ok {
		return
	}
	var payload createReportRequest
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 16<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_json", "요청 본문을 확인해 주세요")
		return
	}
	payload.Detail = strings.TrimSpace(payload.Detail)
	if (payload.TargetType != "user" && payload.TargetType != "feed_event" && payload.TargetType != "comment") ||
		!uuidPattern.MatchString(payload.TargetID) ||
		(payload.Reason != "spoiler" && payload.Reason != "harassment" && payload.Reason != "spam" && payload.Reason != "privacy" && payload.Reason != "other") ||
		len([]rune(payload.Detail)) > 1000 {
		writeError(response, http.StatusBadRequest, "invalid_report", "신고 내용을 확인해 주세요")
		return
	}
	if err := store.CreateReport(request.Context(), userID, payload.TargetType, payload.TargetID, payload.Reason, payload.Detail); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(response, http.StatusNotFound, "report_target_not_found", "신고 대상을 찾을 수 없습니다")
		} else {
			s.internalError(response, err)
		}
		return
	}
	response.WriteHeader(http.StatusNoContent)
}
