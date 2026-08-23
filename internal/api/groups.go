package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

type ReadingGroup struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Role        string    `json:"role"`
	MemberCount int       `json:"memberCount"`
	CreatedAt   time.Time `json:"createdAt"`
}

type GroupMember struct {
	UserID             string `json:"userId"`
	Nickname           string `json:"nickname"`
	Role               string `json:"role"`
	CurrentTitle       string `json:"currentTitle,omitempty"`
	NormalizedProgress *int   `json:"normalizedProgress,omitempty"`
	ReadingNow         bool   `json:"readingNow"`
}

type WeeklyReport struct {
	WeekStart            string `json:"weekStart"`
	WeekEnd              string `json:"weekEnd"`
	ConnectedReadingDays int    `json:"connectedReadingDays"`
	ActiveFriends        int    `json:"activeFriends"`
	FriendUpdates        int    `json:"friendUpdates"`
	ReactionsSent        int    `json:"reactionsSent"`
	ReactionsReceived    int    `json:"reactionsReceived"`
	MyDurationSeconds    int    `json:"myDurationSeconds"`
	MyFinishedBooks      int    `json:"myFinishedBooks"`
}

type GroupStore interface {
	ListGroups(context.Context, string) ([]ReadingGroup, error)
	CreateGroup(context.Context, string, string) (ReadingGroup, error)
	ListGroupMembers(context.Context, string, string) ([]GroupMember, error)
	CreateGroupInvite(context.Context, string, string) (FriendInvite, error)
	AcceptGroupInvite(context.Context, string, string) (ReadingGroup, error)
	LeaveGroup(context.Context, string, string) error
	SetReadingPresence(context.Context, string, string, bool) error
	GetWeeklyReport(context.Context, string) (WeeklyReport, error)
}

func (s *Server) groupStore(response http.ResponseWriter) (GroupStore, bool) {
	store, ok := s.store.(GroupStore)
	if !ok {
		writeError(response, http.StatusNotImplemented, "feature_unavailable", "그룹 기능 저장소가 설정되지 않았습니다")
	}
	return store, ok
}

func (s *Server) listGroups(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.groupStore(response)
	if !ok {
		return
	}
	items, err := store.ListGroups(request.Context(), userID)
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) createGroup(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.groupStore(response)
	if !ok {
		return
	}
	var payload struct {
		Name string `json:"name"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 8<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_json", "요청 본문을 확인해 주세요")
		return
	}
	payload.Name = strings.TrimSpace(payload.Name)
	if len([]rune(payload.Name)) < 1 || len([]rune(payload.Name)) > 60 {
		writeError(response, http.StatusBadRequest, "invalid_group", "그룹 이름은 1자 이상 60자 이하여야 합니다")
		return
	}
	item, err := store.CreateGroup(request.Context(), userID, payload.Name)
	if errors.Is(err, ErrConflict) {
		writeError(response, http.StatusConflict, "group_limit", err.Error())
		return
	}
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusCreated, item)
}

func (s *Server) listGroupMembers(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.groupStore(response)
	if !ok {
		return
	}
	groupID := request.PathValue("groupID")
	if !uuidPattern.MatchString(groupID) {
		writeError(response, http.StatusBadRequest, "invalid_group", "그룹을 확인해 주세요")
		return
	}
	items, err := store.ListGroupMembers(request.Context(), userID, groupID)
	if errors.Is(err, ErrNotFound) {
		writeError(response, http.StatusNotFound, "group_not_found", "그룹을 찾을 수 없습니다")
		return
	}
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) createGroupInvite(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.groupStore(response)
	if !ok {
		return
	}
	groupID := request.PathValue("groupID")
	if !uuidPattern.MatchString(groupID) {
		writeError(response, http.StatusBadRequest, "invalid_group", "그룹을 확인해 주세요")
		return
	}
	item, err := store.CreateGroupInvite(request.Context(), userID, groupID)
	if errors.Is(err, ErrNotFound) {
		writeError(response, http.StatusNotFound, "group_not_found", "그룹을 찾을 수 없습니다")
		return
	}
	if err != nil {
		s.internalError(response, err)
		return
	}
	item.DeepLink = s.invitationURL("group-invite", item.Token)
	writeJSON(response, http.StatusCreated, item)
}

func (s *Server) acceptGroupInvite(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.groupStore(response)
	if !ok {
		return
	}
	token := request.PathValue("token")
	if !uuidPattern.MatchString(token) {
		writeError(response, http.StatusBadRequest, "invalid_invite", "초대 링크를 확인해 주세요")
		return
	}
	item, err := store.AcceptGroupInvite(request.Context(), userID, token)
	if errors.Is(err, ErrNotFound) {
		writeError(response, http.StatusNotFound, "invite_not_found", "만료되었거나 사용할 수 없는 초대입니다")
		return
	}
	if errors.Is(err, ErrConflict) {
		writeError(response, http.StatusConflict, "group_conflict", err.Error())
		return
	}
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, item)
}

func (s *Server) leaveGroup(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.groupStore(response)
	if !ok {
		return
	}
	groupID := request.PathValue("groupID")
	if !uuidPattern.MatchString(groupID) {
		writeError(response, http.StatusBadRequest, "invalid_group", "그룹을 확인해 주세요")
		return
	}
	err := store.LeaveGroup(request.Context(), userID, groupID)
	if errors.Is(err, ErrNotFound) {
		writeError(response, http.StatusNotFound, "group_not_found", "그룹을 찾을 수 없습니다")
		return
	}
	if errors.Is(err, ErrConflict) {
		writeError(response, http.StatusConflict, "group_owner", err.Error())
		return
	}
	if err != nil {
		s.internalError(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (s *Server) startReadingPresence(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.groupStore(response)
	if !ok {
		return
	}
	var payload struct {
		ReadingRunID string `json:"readingRunId"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 8<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil || !uuidPattern.MatchString(payload.ReadingRunID) {
		writeError(response, http.StatusBadRequest, "invalid_reading_presence", "읽는 책을 확인해 주세요")
		return
	}
	if err := store.SetReadingPresence(request.Context(), userID, payload.ReadingRunID, true); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(response, http.StatusNotFound, "reading_run_not_found", "읽는 책을 찾을 수 없습니다")
		} else {
			s.internalError(response, err)
		}
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (s *Server) stopReadingPresence(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.groupStore(response)
	if !ok {
		return
	}
	if err := store.SetReadingPresence(request.Context(), userID, "", false); err != nil {
		s.internalError(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (s *Server) getWeeklyReport(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.groupStore(response)
	if !ok {
		return
	}
	item, err := store.GetWeeklyReport(request.Context(), userID)
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, item)
}
