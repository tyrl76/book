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

type Profile struct {
	UserID            string `json:"userId"`
	Nickname          string `json:"nickname"`
	AvatarURL         string `json:"avatarUrl,omitempty"`
	Bio               string `json:"bio"`
	DefaultVisibility string `json:"defaultVisibility"`
	ProgressPrecision string `json:"progressPrecision"`
	FriendCount       int    `json:"friendCount"`
}

type UpdateProfileCommand struct {
	Nickname          *string
	Bio               *string
	DefaultVisibility *string
	ProgressPrecision *string
}

type ProgressEntry struct {
	ID                 string    `json:"id"`
	PreviousValue      float64   `json:"previousValue"`
	NewValue           float64   `json:"newValue"`
	NormalizedProgress int       `json:"normalizedProgress"`
	Source             string    `json:"source"`
	Note               string    `json:"note,omitempty"`
	DurationSeconds    int       `json:"durationSeconds"`
	Correction         bool      `json:"correction"`
	RecordedAt         time.Time `json:"recordedAt"`
}

type DailyReading struct {
	Date            string  `json:"date"`
	Pages           float64 `json:"pages"`
	DurationSeconds int     `json:"durationSeconds"`
	Entries         int     `json:"entries"`
}

type ReadingStats struct {
	Year                int            `json:"year"`
	Reading             int            `json:"reading"`
	WantToRead          int            `json:"wantToRead"`
	Paused              int            `json:"paused"`
	Finished            int            `json:"finished"`
	DNF                 int            `json:"dnf"`
	PagesRead           float64        `json:"pagesRead"`
	DurationSeconds     int            `json:"durationSeconds"`
	CurrentStreakDays   int            `json:"currentStreakDays"`
	LongestStreakDays   int            `json:"longestStreakDays"`
	AnnualGoalBooks     int            `json:"annualGoalBooks"`
	AnnualFinishedBooks int            `json:"annualFinishedBooks"`
	Calendar            []DailyReading `json:"calendar"`
}

type NotificationPreferences struct {
	PushEnabled    bool   `json:"pushEnabled"`
	FriendRequests bool   `json:"friendRequests"`
	Comments       bool   `json:"comments"`
	Milestones     bool   `json:"milestones"`
	DailyDigest    bool   `json:"dailyDigest"`
	QuietStart     string `json:"quietStart,omitempty"`
	QuietEnd       string `json:"quietEnd,omitempty"`
}

type UpdateReadingRunCommand struct {
	Status            *string
	Visibility        *string
	ShareGroupID      *string
	ProgressPrecision *string
	AutoShare         *bool
}

type AccountStore interface {
	GetProfile(context.Context, string) (Profile, error)
	UpdateProfile(context.Context, string, UpdateProfileCommand) (Profile, error)
	UpdateReadingRun(context.Context, string, string, UpdateReadingRunCommand) (ReadingRun, error)
	DeleteReadingRun(context.Context, string, string) error
	ListProgressEntries(context.Context, string, string) ([]ProgressEntry, error)
	GetReadingStats(context.Context, string, int) (ReadingStats, error)
	GetNotificationPreferences(context.Context, string) (NotificationPreferences, error)
	UpdateNotificationPreferences(context.Context, string, NotificationPreferences) (NotificationPreferences, error)
	RegisterPushToken(context.Context, string, string, string) error
	DisablePushTokens(context.Context, string) error
	SetAnnualGoal(context.Context, string, int, int) error
	ExportUserData(context.Context, string) (json.RawMessage, error)
	DeleteUser(context.Context, string) error
}

type AccountDeletionStore interface {
	RequestUserDeletion(context.Context, string) error
	MarkUserDeletionCompleted(context.Context, string) error
}

func (s *Server) accountStore(response http.ResponseWriter) (AccountStore, bool) {
	store, ok := s.store.(AccountStore)
	if !ok {
		writeError(response, http.StatusNotImplemented, "feature_unavailable", "계정 기능 저장소가 설정되지 않았습니다")
	}
	return store, ok
}

func (s *Server) getMe(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.accountStore(response)
	if !ok {
		return
	}
	item, err := store.GetProfile(request.Context(), userID)
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, item)
}

type updateProfileRequest struct {
	Nickname          *string `json:"nickname"`
	Bio               *string `json:"bio"`
	DefaultVisibility *string `json:"defaultVisibility"`
	ProgressPrecision *string `json:"progressPrecision"`
}

func (s *Server) updateMe(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.accountStore(response)
	if !ok {
		return
	}
	var payload updateProfileRequest
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 16<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_json", "요청 본문을 확인해 주세요")
		return
	}
	if payload.Nickname != nil {
		trimmed := strings.TrimSpace(*payload.Nickname)
		payload.Nickname = &trimmed
	}
	if payload.Bio != nil {
		trimmed := strings.TrimSpace(*payload.Bio)
		payload.Bio = &trimmed
	}
	if (payload.Nickname != nil && (len([]rune(*payload.Nickname)) < 1 || len([]rune(*payload.Nickname)) > 40)) ||
		(payload.Bio != nil && len([]rune(*payload.Bio)) > 160) ||
		(payload.DefaultVisibility != nil && !validVisibility(*payload.DefaultVisibility)) ||
		(payload.ProgressPrecision != nil && !validPrecision(*payload.ProgressPrecision)) {
		writeError(response, http.StatusBadRequest, "invalid_profile", "프로필과 공개 범위를 확인해 주세요")
		return
	}
	item, err := store.UpdateProfile(request.Context(), userID, UpdateProfileCommand{
		Nickname: payload.Nickname, Bio: payload.Bio,
		DefaultVisibility: payload.DefaultVisibility, ProgressPrecision: payload.ProgressPrecision,
	})
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, item)
}

type updateReadingRunRequest struct {
	Status            *string `json:"status"`
	Visibility        *string `json:"visibility"`
	ShareGroupID      *string `json:"shareGroupId"`
	ProgressPrecision *string `json:"progressPrecision"`
	AutoShare         *bool   `json:"autoShare"`
}

func (s *Server) updateReadingRun(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.accountStore(response)
	if !ok {
		return
	}
	runID := request.PathValue("readingRunID")
	if !uuidPattern.MatchString(runID) {
		writeError(response, http.StatusBadRequest, "invalid_reading_run_id", "독서 회차를 확인해 주세요")
		return
	}
	var payload updateReadingRunRequest
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 16<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_json", "요청 본문을 확인해 주세요")
		return
	}
	if (payload.Status != nil && !validReadingStatus(*payload.Status)) ||
		(payload.Visibility != nil && !validVisibility(*payload.Visibility)) ||
		(payload.ProgressPrecision != nil && !validPrecision(*payload.ProgressPrecision)) ||
		(payload.ShareGroupID != nil && *payload.ShareGroupID != "" && !uuidPattern.MatchString(*payload.ShareGroupID)) ||
		(payload.Visibility != nil && *payload.Visibility == "group" && (payload.ShareGroupID == nil || *payload.ShareGroupID == "")) {
		writeError(response, http.StatusBadRequest, "invalid_reading_run", "독서 상태와 공개 범위를 확인해 주세요")
		return
	}
	item, err := store.UpdateReadingRun(request.Context(), userID, runID, UpdateReadingRunCommand{
		Status: payload.Status, Visibility: payload.Visibility,
		ShareGroupID: payload.ShareGroupID, ProgressPrecision: payload.ProgressPrecision, AutoShare: payload.AutoShare,
	})
	if errors.Is(err, ErrNotFound) {
		writeError(response, http.StatusNotFound, "reading_run_not_found", "독서 회차를 찾을 수 없습니다")
		return
	}
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, item)
}

func (s *Server) deleteReadingRun(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.accountStore(response)
	if !ok {
		return
	}
	runID := request.PathValue("readingRunID")
	if !uuidPattern.MatchString(runID) {
		writeError(response, http.StatusBadRequest, "invalid_reading_run_id", "독서 회차를 확인해 주세요")
		return
	}
	if err := store.DeleteReadingRun(request.Context(), userID, runID); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(response, http.StatusNotFound, "reading_run_not_found", "독서 회차를 찾을 수 없습니다")
			return
		}
		s.internalError(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (s *Server) listProgressEntries(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.accountStore(response)
	if !ok {
		return
	}
	runID := request.PathValue("readingRunID")
	if !uuidPattern.MatchString(runID) {
		writeError(response, http.StatusBadRequest, "invalid_reading_run_id", "독서 회차를 확인해 주세요")
		return
	}
	items, err := store.ListProgressEntries(request.Context(), userID, runID)
	if errors.Is(err, ErrNotFound) {
		writeError(response, http.StatusNotFound, "reading_run_not_found", "독서 회차를 찾을 수 없습니다")
		return
	}
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) getReadingStats(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.accountStore(response)
	if !ok {
		return
	}
	year := time.Now().In(time.FixedZone("Asia/Seoul", 9*60*60)).Year()
	if raw := request.URL.Query().Get("year"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 2000 || parsed > 2200 {
			writeError(response, http.StatusBadRequest, "invalid_year", "연도를 확인해 주세요")
			return
		}
		year = parsed
	}
	item, err := store.GetReadingStats(request.Context(), userID, year)
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, item)
}

func (s *Server) getNotificationPreferences(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.accountStore(response)
	if !ok {
		return
	}
	item, err := store.GetNotificationPreferences(request.Context(), userID)
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, item)
}

func (s *Server) updateNotificationPreferences(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.accountStore(response)
	if !ok {
		return
	}
	var payload NotificationPreferences
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 8<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil || !validClock(payload.QuietStart) || !validClock(payload.QuietEnd) {
		writeError(response, http.StatusBadRequest, "invalid_notification_preferences", "알림 설정을 확인해 주세요")
		return
	}
	item, err := store.UpdateNotificationPreferences(request.Context(), userID, payload)
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, item)
}

type pushTokenRequest struct {
	Platform string `json:"platform"`
	Token    string `json:"token"`
}

func (s *Server) registerPushToken(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.accountStore(response)
	if !ok {
		return
	}
	var payload pushTokenRequest
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 8<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil ||
		(payload.Platform != "ios" && payload.Platform != "android" && payload.Platform != "web") ||
		len(strings.TrimSpace(payload.Token)) < 10 || len(payload.Token) > 4096 {
		writeError(response, http.StatusBadRequest, "invalid_push_token", "푸시 토큰을 확인해 주세요")
		return
	}
	if err := store.RegisterPushToken(request.Context(), userID, payload.Platform, strings.TrimSpace(payload.Token)); err != nil {
		s.internalError(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (s *Server) disablePushTokens(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.accountStore(response)
	if !ok {
		return
	}
	if err := store.DisablePushTokens(request.Context(), userID); err != nil {
		s.internalError(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

type annualGoalRequest struct {
	Year        int `json:"year"`
	TargetBooks int `json:"targetBooks"`
}

func (s *Server) setAnnualGoal(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.accountStore(response)
	if !ok {
		return
	}
	var payload annualGoalRequest
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 8<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil || payload.Year < 2000 || payload.Year > 2200 || payload.TargetBooks < 1 || payload.TargetBooks > 1000 {
		writeError(response, http.StatusBadRequest, "invalid_goal", "연간 목표를 확인해 주세요")
		return
	}
	if err := store.SetAnnualGoal(request.Context(), userID, payload.Year, payload.TargetBooks); err != nil {
		s.internalError(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (s *Server) exportMe(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.accountStore(response)
	if !ok {
		return
	}
	payload, err := store.ExportUserData(request.Context(), userID)
	if err != nil {
		s.internalError(response, err)
		return
	}
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.Header().Set("Content-Disposition", `attachment; filename="bookgyeol-export.json"`)
	response.WriteHeader(http.StatusOK)
	_, _ = response.Write(payload)
}

func (s *Server) deleteMe(response http.ResponseWriter, request *http.Request, userID string) {
	store, ok := s.accountStore(response)
	if !ok {
		return
	}
	deletionStore, supportsQueue := s.store.(AccountDeletionStore)
	if s.authUserDeleter != nil && supportsQueue {
		if err := deletionStore.RequestUserDeletion(request.Context(), userID); err != nil {
			s.internalError(response, err)
			return
		}
		if err := s.authUserDeleter.DeleteUser(request.Context(), userID); err != nil {
			s.logger.Warn("Supabase account deletion queued for retry", "userID", userID, "error", err)
			writeJSON(response, http.StatusAccepted, map[string]string{"status": "pending"})
			return
		}
	}
	if err := store.DeleteUser(request.Context(), userID); err != nil {
		if s.authUserDeleter != nil && supportsQueue {
			if errors.Is(err, ErrNotFound) {
				if markErr := deletionStore.MarkUserDeletionCompleted(request.Context(), userID); markErr != nil {
					s.logger.Error("mark missing account deletion completed", "userID", userID, "error", markErr)
				}
				response.WriteHeader(http.StatusNoContent)
				return
			}
			s.logger.Warn("local account deletion queued for retry", "userID", userID, "error", err)
			writeJSON(response, http.StatusAccepted, map[string]string{"status": "pending"})
			return
		}
		s.internalError(response, err)
		return
	}
	if s.authUserDeleter != nil && supportsQueue {
		if err := deletionStore.MarkUserDeletionCompleted(request.Context(), userID); err != nil {
			s.logger.Error("mark account deletion completed", "userID", userID, "error", err)
		}
	}
	response.WriteHeader(http.StatusNoContent)
}

func validVisibility(value string) bool {
	return value == "private" || value == "friends" || value == "group" || value == "public"
}

func validPrecision(value string) bool {
	return value == "hidden" || value == "milestone" || value == "exact"
}

func validReadingStatus(value string) bool {
	return value == "want_to_read" || value == "reading" || value == "paused" || value == "finished" || value == "dnf"
}

func validClock(value string) bool {
	if value == "" {
		return true
	}
	_, err := time.Parse("15:04", value)
	return err == nil
}
