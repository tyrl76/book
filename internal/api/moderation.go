package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type UserAccess struct {
	Allowed bool
	Code    string
	Message string
}

type UserAccessStore interface {
	GetUserAccess(context.Context, string) (UserAccess, error)
}

type AdminReport struct {
	ID               string     `json:"id"`
	ReporterID       string     `json:"reporterId"`
	ReporterNickname string     `json:"reporterNickname"`
	TargetType       string     `json:"targetType"`
	TargetID         string     `json:"targetId"`
	Reason           string     `json:"reason"`
	Detail           string     `json:"detail"`
	Status           string     `json:"status"`
	Resolution       string     `json:"resolution"`
	CreatedAt        time.Time  `json:"createdAt"`
	ReviewedAt       *time.Time `json:"reviewedAt,omitempty"`
	ReviewedBy       string     `json:"reviewedBy,omitempty"`
}

type ModerationAction struct {
	ID            string    `json:"id"`
	ReportID      string    `json:"reportId,omitempty"`
	OperatorID    string    `json:"operatorId"`
	Action        string    `json:"action"`
	TargetType    string    `json:"targetType"`
	TargetID      string    `json:"targetId"`
	SubjectUserID string    `json:"subjectUserId,omitempty"`
	Reason        string    `json:"reason"`
	CreatedAt     time.Time `json:"createdAt"`
}

type ResolveReportCommand struct {
	Action        string
	Reason        string
	DurationHours int
	OperatorID    string
}

type ModerationStore interface {
	ListReports(context.Context, string, int) ([]AdminReport, error)
	ResolveReport(context.Context, string, ResolveReportCommand) (ModerationAction, error)
	RestoreHiddenTarget(context.Context, string, string, string, string) (ModerationAction, error)
	ListModerationActions(context.Context, int) ([]ModerationAction, error)
}

func (s *Server) moderationStore(response http.ResponseWriter) (ModerationStore, bool) {
	store, ok := s.store.(ModerationStore)
	if !ok {
		writeError(response, http.StatusNotImplemented, "feature_unavailable", "운영 기능 저장소가 설정되지 않았습니다")
	}
	return store, ok
}

func (s *Server) listAdminReports(response http.ResponseWriter, request *http.Request, _ string) {
	store, ok := s.moderationStore(response)
	if !ok {
		return
	}
	status := strings.TrimSpace(request.URL.Query().Get("status"))
	if status == "" {
		status = "open"
	}
	if status != "all" && status != "open" && status != "reviewing" && status != "resolved" && status != "dismissed" {
		writeError(response, http.StatusBadRequest, "invalid_status", "신고 상태를 확인해 주세요")
		return
	}
	limit, ok := parseAdminLimit(response, request)
	if !ok {
		return
	}
	items, err := store.ListReports(request.Context(), status, limit)
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) resolveAdminReport(response http.ResponseWriter, request *http.Request, operatorID string) {
	store, ok := s.moderationStore(response)
	if !ok {
		return
	}
	reportID := request.PathValue("reportID")
	if !uuidPattern.MatchString(reportID) {
		writeError(response, http.StatusBadRequest, "invalid_report", "신고 ID를 확인해 주세요")
		return
	}
	var payload struct {
		Action        string `json:"action"`
		Reason        string `json:"reason"`
		DurationHours int    `json:"durationHours"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 16<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_json", "요청 본문을 확인해 주세요")
		return
	}
	payload.Action = strings.TrimSpace(payload.Action)
	payload.Reason = strings.TrimSpace(payload.Reason)
	validAction := payload.Action == "dismiss" || payload.Action == "hide" || payload.Action == "warn" || payload.Action == "suspend" || payload.Action == "ban"
	if !validAction || len([]rune(payload.Reason)) < 1 || len([]rune(payload.Reason)) > 1000 ||
		(payload.Action == "suspend" && (payload.DurationHours < 1 || payload.DurationHours > 24*365)) ||
		(payload.Action != "suspend" && payload.DurationHours != 0) {
		writeError(response, http.StatusBadRequest, "invalid_moderation_action", "조치 종류, 사유와 기간을 확인해 주세요")
		return
	}
	item, err := store.ResolveReport(request.Context(), reportID, ResolveReportCommand{
		Action: payload.Action, Reason: payload.Reason, DurationHours: payload.DurationHours, OperatorID: operatorID,
	})
	if errors.Is(err, ErrNotFound) {
		writeError(response, http.StatusNotFound, "report_not_found", "신고를 찾을 수 없습니다")
		return
	}
	if errors.Is(err, ErrConflict) {
		writeError(response, http.StatusConflict, "report_already_reviewed", err.Error())
		return
	}
	if errors.Is(err, ErrInvalid) {
		writeError(response, http.StatusUnprocessableEntity, "invalid_moderation_target", err.Error())
		return
	}
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, item)
}

func (s *Server) restoreAdminTarget(response http.ResponseWriter, request *http.Request, operatorID string) {
	store, ok := s.moderationStore(response)
	if !ok {
		return
	}
	targetType := request.PathValue("targetType")
	targetID := request.PathValue("targetID")
	if !validModerationTarget(targetType) || !uuidPattern.MatchString(targetID) {
		writeError(response, http.StatusBadRequest, "invalid_moderation_target", "복원 대상을 확인해 주세요")
		return
	}
	var payload struct {
		Reason string `json:"reason"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 8<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_json", "요청 본문을 확인해 주세요")
		return
	}
	payload.Reason = strings.TrimSpace(payload.Reason)
	if len([]rune(payload.Reason)) < 1 || len([]rune(payload.Reason)) > 1000 {
		writeError(response, http.StatusBadRequest, "invalid_reason", "복원 사유를 확인해 주세요")
		return
	}
	item, err := store.RestoreHiddenTarget(request.Context(), targetType, targetID, payload.Reason, operatorID)
	if errors.Is(err, ErrNotFound) {
		writeError(response, http.StatusNotFound, "hidden_target_not_found", "숨김 대상을 찾을 수 없습니다")
		return
	}
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, item)
}

func (s *Server) listAdminActions(response http.ResponseWriter, request *http.Request, _ string) {
	store, ok := s.moderationStore(response)
	if !ok {
		return
	}
	limit, ok := parseAdminLimit(response, request)
	if !ok {
		return
	}
	items, err := store.ListModerationActions(request.Context(), limit)
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": items})
}

func parseAdminLimit(response http.ResponseWriter, request *http.Request) (int, bool) {
	limit := 50
	if raw := request.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			writeError(response, http.StatusBadRequest, "invalid_limit", "limit은 1에서 100 사이여야 합니다")
			return 0, false
		}
		limit = parsed
	}
	return limit, true
}

func validModerationTarget(value string) bool {
	return value == "user" || value == "feed_event" || value == "comment"
}
