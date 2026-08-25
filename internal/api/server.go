package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/datau/book/internal/catalog"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
	ErrInvalid  = errors.New("invalid")
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)

type ReadingRun struct {
	ID                 string     `json:"id"`
	Title              string     `json:"title"`
	Author             string     `json:"author"`
	CoverURL           string     `json:"coverUrl,omitempty"`
	CoverColor         string     `json:"coverColor"`
	Status             string     `json:"status"`
	ProgressBasis      string     `json:"progressBasis"`
	CurrentValue       float64    `json:"currentValue"`
	TotalValue         float64    `json:"totalValue"`
	NormalizedProgress int        `json:"normalizedProgress"`
	Visibility         string     `json:"visibility"`
	ShareGroupID       string     `json:"shareGroupId,omitempty"`
	ProgressPrecision  string     `json:"progressPrecision"`
	AutoShare          bool       `json:"autoShare"`
	RunNumber          int        `json:"runNumber"`
	StartedAt          *time.Time `json:"startedAt,omitempty"`
	FinishedAt         *time.Time `json:"finishedAt,omitempty"`
	UpdatedAt          time.Time  `json:"updatedAt"`
}

type FeedEvent struct {
	ID                 string    `json:"id"`
	ActorID            string    `json:"actorId"`
	ActorNickname      string    `json:"actorNickname"`
	Title              string    `json:"title"`
	Author             string    `json:"author"`
	CoverURL           string    `json:"coverUrl,omitempty"`
	CoverColor         string    `json:"coverColor"`
	Type               string    `json:"type"`
	NormalizedProgress int       `json:"normalizedProgress"`
	Note               string    `json:"note,omitempty"`
	ReactionCount      int       `json:"reactionCount"`
	ReactedByViewer    bool      `json:"reactedByViewer"`
	CommentCount       int       `json:"commentCount"`
	GroupID            string    `json:"groupId,omitempty"`
	OccurredAt         time.Time `json:"occurredAt"`
}

type RecordProgressCommand struct {
	ClientOperationID string
	CurrentValue      float64
	RecordedAt        time.Time
	Note              string
	Correction        bool
	DurationSeconds   int
}

type RecordProgressResult struct {
	EntryID            string  `json:"entryId"`
	CurrentValue       float64 `json:"currentValue"`
	NormalizedProgress int     `json:"normalizedProgress"`
	Milestone          string  `json:"milestone,omitempty"`
	IdempotentReplay   bool    `json:"idempotentReplay"`
}

type CreateReadingRunCommand struct {
	Book          catalog.Book
	TotalValue    float64
	ProgressBasis string
	Status        string
}

type Store interface {
	Ping(context.Context) error
	EnsureUser(context.Context, string, string) error
	ListReadingRuns(context.Context, string) ([]ReadingRun, error)
	ListFeed(context.Context, string, int) ([]FeedEvent, error)
	CreateReadingRun(context.Context, string, CreateReadingRunCommand) (ReadingRun, error)
	RecordProgress(context.Context, string, string, RecordProgressCommand) (RecordProgressResult, error)
}

type TokenVerifier interface {
	Verify(context.Context, string) (string, error)
}

type AuthUserDeleter interface {
	DeleteUser(context.Context, string) error
}

type Options struct {
	AllowedOrigins   []string
	AllowDevAuth     bool
	LocalAuthEnabled bool
	DevUserID        string
	TokenVerifier    TokenVerifier
	Catalog          catalog.Provider
	AuthUserDeleter  AuthUserDeleter
	AdminAPIKey      string
	PublicAppURL     string
	Logger           *slog.Logger
	AdminLogBuffer   *AdminLogBuffer
}

type Server struct {
	store            Store
	allowedOrigins   map[string]struct{}
	allowDevAuth     bool
	localAuthEnabled bool
	devUserID        string
	tokenVerifier    TokenVerifier
	catalog          catalog.Provider
	authUserDeleter  AuthUserDeleter
	adminAPIKey      string
	publicAppURL     string
	logger           *slog.Logger
	adminLogs        *AdminLogBuffer
	rateLimiter      *requestRateLimiter
	startedAt        time.Time
}

func NewServer(store Store, options Options) http.Handler {
	logger := options.Logger
	if logger == nil {
		logger = slog.Default()
	}
	adminLogs := options.AdminLogBuffer
	if adminLogs == nil {
		adminLogs = NewAdminLogBuffer(1000)
	}

	server := &Server{
		store:            store,
		allowedOrigins:   make(map[string]struct{}, len(options.AllowedOrigins)),
		allowDevAuth:     options.AllowDevAuth,
		localAuthEnabled: options.LocalAuthEnabled,
		devUserID:        options.DevUserID,
		tokenVerifier:    options.TokenVerifier,
		catalog:          options.Catalog,
		authUserDeleter:  options.AuthUserDeleter,
		adminAPIKey:      strings.TrimSpace(options.AdminAPIKey),
		publicAppURL:     strings.TrimRight(strings.TrimSpace(options.PublicAppURL), "/"),
		logger:           logger,
		adminLogs:        adminLogs,
		rateLimiter:      newRequestRateLimiter(),
		startedAt:        time.Now(),
	}
	for _, origin := range options.AllowedOrigins {
		server.allowedOrigins[origin] = struct{}{}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", server.health)
	mux.HandleFunc("GET /v1/auth/status", server.localAuthStatus)
	mux.HandleFunc("POST /v1/auth/register", server.rateLimit("register", 5, time.Minute, server.registerLocalAccount))
	mux.HandleFunc("POST /v1/auth/login", server.rateLimit("login", 10, time.Minute, server.loginLocalAccount))
	mux.HandleFunc("POST /v1/auth/logout", server.authWithoutAccessCheck(server.logoutLocalAccount))
	mux.HandleFunc("GET /v1/reading-runs", server.auth(server.listReadingRuns))
	mux.HandleFunc("POST /v1/reading-runs", server.auth(server.createReadingRun))
	mux.HandleFunc("POST /v1/reading-runs/manual", server.auth(server.createManualReadingRun))
	mux.HandleFunc("GET /v1/feed", server.auth(server.listFeed))
	mux.HandleFunc("GET /v1/catalog/books", server.auth(server.searchBooks))
	mux.HandleFunc("GET /v1/catalog/books/{isbn}", server.auth(server.lookupBook))
	mux.HandleFunc("POST /v1/me/bootstrap", server.auth(server.bootstrapUser))
	mux.HandleFunc("POST /v1/reading-runs/{readingRunID}/progress", server.auth(server.recordProgress))
	mux.HandleFunc("GET /v1/friends", server.auth(server.listFriends))
	mux.HandleFunc("POST /v1/friend-invites", server.auth(server.createFriendInvite))
	mux.HandleFunc("POST /v1/friend-invites/{token}/accept", server.auth(server.acceptFriendInvite))
	mux.HandleFunc("DELETE /v1/friends/{userID}", server.auth(server.removeFriend))
	mux.HandleFunc("PUT /v1/feed-events/{feedEventID}/reaction", server.auth(server.addReaction))
	mux.HandleFunc("DELETE /v1/feed-events/{feedEventID}/reaction", server.auth(server.removeReaction))
	mux.HandleFunc("GET /v1/feed-events/{feedEventID}/comments", server.auth(server.listComments))
	mux.HandleFunc("POST /v1/feed-events/{feedEventID}/comments", server.auth(server.createComment))
	mux.HandleFunc("POST /v1/blocks/{userID}", server.auth(server.blockUser))
	mux.HandleFunc("DELETE /v1/blocks/{userID}", server.auth(server.unblockUser))
	mux.HandleFunc("POST /v1/reports", server.auth(server.createReport))
	mux.HandleFunc("GET /v1/me", server.auth(server.getMe))
	mux.HandleFunc("GET /v1/me/storage-status", server.auth(server.getStorageStatus))
	mux.HandleFunc("PATCH /v1/me", server.auth(server.updateMe))
	mux.HandleFunc("GET /v1/me/stats", server.auth(server.getReadingStats))
	mux.HandleFunc("GET /v1/me/notifications", server.auth(server.getNotificationPreferences))
	mux.HandleFunc("PUT /v1/me/notifications", server.auth(server.updateNotificationPreferences))
	mux.HandleFunc("POST /v1/me/push-tokens", server.auth(server.registerPushToken))
	mux.HandleFunc("DELETE /v1/me/push-tokens", server.auth(server.disablePushTokens))
	mux.HandleFunc("PUT /v1/me/annual-goal", server.auth(server.setAnnualGoal))
	mux.HandleFunc("GET /v1/me/export", server.auth(server.exportMe))
	mux.HandleFunc("DELETE /v1/me", server.authWithoutAccessCheck(server.deleteMe))
	mux.HandleFunc("PATCH /v1/reading-runs/{readingRunID}", server.auth(server.updateReadingRun))
	mux.HandleFunc("GET /v1/reading-runs/{readingRunID}/entries", server.auth(server.listProgressEntries))
	mux.HandleFunc("GET /v1/groups", server.auth(server.listGroups))
	mux.HandleFunc("POST /v1/groups", server.auth(server.createGroup))
	mux.HandleFunc("GET /v1/groups/{groupID}/members", server.auth(server.listGroupMembers))
	mux.HandleFunc("POST /v1/groups/{groupID}/invites", server.auth(server.createGroupInvite))
	mux.HandleFunc("POST /v1/group-invites/{token}/accept", server.auth(server.acceptGroupInvite))
	mux.HandleFunc("DELETE /v1/groups/{groupID}/membership", server.auth(server.leaveGroup))
	mux.HandleFunc("PUT /v1/me/reading-presence", server.auth(server.startReadingPresence))
	mux.HandleFunc("DELETE /v1/me/reading-presence", server.auth(server.stopReadingPresence))
	mux.HandleFunc("GET /v1/me/weekly-report", server.auth(server.getWeeklyReport))
	mux.HandleFunc("GET /admin", server.adminConsole)
	mux.HandleFunc("GET /v1/admin/overview", server.rateLimit("admin", 120, time.Minute, server.adminAuth(server.getAdminOverview)))
	mux.HandleFunc("GET /v1/admin/logs", server.rateLimit("admin", 120, time.Minute, server.adminAuth(server.listAdminLogs)))
	mux.HandleFunc("GET /v1/admin/logs/stream", server.rateLimit("admin", 120, time.Minute, server.adminAuth(server.streamAdminLogs)))
	mux.HandleFunc("GET /v1/admin/reports", server.rateLimit("admin", 120, time.Minute, server.adminAuth(server.listAdminReports)))
	mux.HandleFunc("PATCH /v1/admin/reports/{reportID}", server.rateLimit("admin", 120, time.Minute, server.adminAuth(server.resolveAdminReport)))
	mux.HandleFunc("POST /v1/admin/hidden-targets/{targetType}/{targetID}/restore", server.rateLimit("admin", 120, time.Minute, server.adminAuth(server.restoreAdminTarget)))
	mux.HandleFunc("GET /v1/admin/moderation/actions", server.rateLimit("admin", 120, time.Minute, server.adminAuth(server.listAdminActions)))

	return server.cors(server.recoverPanic(server.logRequests(mux)))
}

func (s *Server) health(response http.ResponseWriter, request *http.Request) {
	if err := s.store.Ping(request.Context()); err != nil {
		s.logger.Error("database health check failed", "error", err)
		writeError(response, http.StatusServiceUnavailable, "database_unavailable", "데이터베이스에 연결할 수 없습니다")
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) listReadingRuns(response http.ResponseWriter, request *http.Request, userID string) {
	items, err := s.store.ListReadingRuns(request.Context(), userID)
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) listFeed(response http.ResponseWriter, request *http.Request, userID string) {
	limit := 30
	if raw := request.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 50 {
			writeError(response, http.StatusBadRequest, "invalid_limit", "limit은 1에서 50 사이여야 합니다")
			return
		}
		limit = parsed
	}

	items, err := s.store.ListFeed(request.Context(), userID, limit)
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": items})
}

type recordProgressRequest struct {
	ClientOperationID string  `json:"clientOperationId"`
	CurrentValue      float64 `json:"currentValue"`
	RecordedAt        string  `json:"recordedAt"`
	Note              string  `json:"note"`
	Correction        bool    `json:"correction"`
	DurationSeconds   int     `json:"durationSeconds"`
}

func (s *Server) recordProgress(response http.ResponseWriter, request *http.Request, userID string) {
	runID := request.PathValue("readingRunID")
	if !uuidPattern.MatchString(runID) {
		writeError(response, http.StatusBadRequest, "invalid_reading_run_id", "독서 회차 ID 형식이 올바르지 않습니다")
		return
	}

	var payload recordProgressRequest
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 32<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_json", "요청 본문을 확인해 주세요")
		return
	}
	if !uuidPattern.MatchString(payload.ClientOperationID) || payload.CurrentValue < 0 || len([]rune(payload.Note)) > 280 || payload.DurationSeconds < 0 || payload.DurationSeconds > 86400 {
		writeError(response, http.StatusBadRequest, "invalid_progress", "작업 ID, 진척값 또는 메모를 확인해 주세요")
		return
	}
	recordedAt, err := time.Parse(time.RFC3339Nano, payload.RecordedAt)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_recorded_at", "recordedAt은 RFC3339 형식이어야 합니다")
		return
	}

	result, err := s.store.RecordProgress(request.Context(), userID, runID, RecordProgressCommand{
		ClientOperationID: payload.ClientOperationID,
		CurrentValue:      payload.CurrentValue,
		RecordedAt:        recordedAt,
		Note:              strings.TrimSpace(payload.Note),
		Correction:        payload.Correction,
		DurationSeconds:   payload.DurationSeconds,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrNotFound):
			writeError(response, http.StatusNotFound, "reading_run_not_found", "독서 회차를 찾을 수 없습니다")
		case errors.Is(err, ErrConflict):
			writeError(response, http.StatusConflict, "progress_conflict", err.Error())
		case errors.Is(err, ErrInvalid):
			writeError(response, http.StatusUnprocessableEntity, "invalid_progress", err.Error())
		default:
			s.internalError(response, err)
		}
		return
	}

	status := http.StatusCreated
	if result.IdempotentReplay {
		status = http.StatusOK
	}
	writeJSON(response, status, result)
}

type authedHandler func(http.ResponseWriter, *http.Request, string)

func (s *Server) auth(next authedHandler) http.HandlerFunc {
	return s.authWithAccessCheck(next, true)
}

func (s *Server) authWithoutAccessCheck(next authedHandler) http.HandlerFunc {
	return s.authWithAccessCheck(next, false)
}

func (s *Server) authWithAccessCheck(next authedHandler, checkAccess bool) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		authorization := strings.TrimSpace(request.Header.Get("Authorization"))
		if authorization != "" {
			parts := strings.Fields(authorization)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || s.tokenVerifier == nil {
				writeError(response, http.StatusUnauthorized, "invalid_access_token", "액세스 토큰을 확인해 주세요")
				return
			}
			userID, err := s.tokenVerifier.Verify(request.Context(), parts[1])
			if err != nil {
				writeError(response, http.StatusUnauthorized, "invalid_access_token", "로그인이 만료되었거나 유효하지 않습니다")
				return
			}
			s.serveAuthenticated(response, request, userID, checkAccess, next)
			return
		}

		if !s.allowDevAuth {
			writeError(response, http.StatusUnauthorized, "missing_access_token", "로그인이 필요합니다")
			return
		}
		userID := strings.TrimSpace(request.Header.Get("X-User-ID"))
		if userID == "" {
			userID = s.devUserID
		}
		if !uuidPattern.MatchString(userID) {
			writeError(response, http.StatusUnauthorized, "invalid_user", "개발 사용자 ID가 올바르지 않습니다")
			return
		}
		s.serveAuthenticated(response, request, userID, checkAccess, next)
	}
}

func (s *Server) serveAuthenticated(response http.ResponseWriter, request *http.Request, userID string, checkAccess bool, next authedHandler) {
	if checkAccess {
		if store, ok := s.store.(UserAccessStore); ok {
			access, err := store.GetUserAccess(request.Context(), userID)
			if err != nil {
				s.internalError(response, err)
				return
			}
			if !access.Allowed {
				writeError(response, http.StatusForbidden, access.Code, access.Message)
				return
			}
		}
	}
	next(response, request, userID)
}

type adminHandler func(http.ResponseWriter, *http.Request, string)

func (s *Server) adminAuth(next adminHandler) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		provided := strings.TrimSpace(request.Header.Get("X-Admin-Key"))
		if s.adminAPIKey == "" {
			writeError(response, http.StatusServiceUnavailable, "admin_unavailable", "운영자 API가 설정되지 않았습니다")
			return
		}
		if len(provided) != len(s.adminAPIKey) || subtle.ConstantTimeCompare([]byte(provided), []byte(s.adminAPIKey)) != 1 {
			writeError(response, http.StatusUnauthorized, "invalid_admin_key", "운영자 인증을 확인해 주세요")
			return
		}
		operatorID := strings.TrimSpace(request.Header.Get("X-Admin-ID"))
		if operatorID == "" {
			operatorID = "operator"
		}
		if len(operatorID) > 100 {
			writeError(response, http.StatusBadRequest, "invalid_admin_id", "운영자 식별자를 확인해 주세요")
			return
		}
		next(response, request, operatorID)
	}
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		origin := request.Header.Get("Origin")
		if _, ok := s.allowedOrigins[origin]; ok {
			response.Header().Set("Access-Control-Allow-Origin", origin)
			response.Header().Set("Vary", "Origin")
			response.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID, X-Admin-Key, X-Admin-ID")
			response.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		}
		if request.Method == http.MethodOptions {
			response.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(response, request)
	})
}

func (s *Server) recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				s.logger.Error("request panic", "panic", recovered)
				s.adminLogs.Append(AdminLogEntry{Level: "error", Message: "request panic", Method: request.Method, Path: request.URL.Path})
				writeError(response, http.StatusInternalServerError, "internal_error", "서버 오류가 발생했습니다")
			}
		}()
		next.ServeHTTP(response, request)
	})
}

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		startedAt := time.Now()
		capture := &responseCapture{ResponseWriter: response}
		next.ServeHTTP(capture, request)
		duration := time.Since(startedAt)
		status := capture.status
		if status == 0 {
			status = http.StatusOK
		}
		s.logger.Info("http request", "method", request.Method, "path", request.URL.Path, "status", status, "bytes", capture.bytes, "duration", duration)
		if request.URL.Path != "/v1/admin/logs/stream" {
			level := "info"
			if status >= http.StatusInternalServerError {
				level = "error"
			} else if status >= http.StatusBadRequest {
				level = "warn"
			}
			s.adminLogs.Append(AdminLogEntry{
				Level: level, Message: "http request", Method: request.Method, Path: request.URL.Path,
				Status: status, DurationMS: duration.Milliseconds(), ResponseBytes: capture.bytes,
			})
		}
	})
}

func (s *Server) internalError(response http.ResponseWriter, err error) {
	s.logger.Error("request failed", "error", err)
	s.adminLogs.Append(AdminLogEntry{Level: "error", Message: "request failed", Detail: sanitizeLogDetail(err.Error())})
	writeError(response, http.StatusInternalServerError, "internal_error", "서버 오류가 발생했습니다")
}

type responseCapture struct {
	http.ResponseWriter
	status int
	bytes  int64
}

func (capture *responseCapture) WriteHeader(status int) {
	if capture.status != 0 {
		return
	}
	capture.status = status
	capture.ResponseWriter.WriteHeader(status)
}

func (capture *responseCapture) Write(body []byte) (int, error) {
	if capture.status == 0 {
		capture.WriteHeader(http.StatusOK)
	}
	written, err := capture.ResponseWriter.Write(body)
	capture.bytes += int64(written)
	return written, err
}

func (capture *responseCapture) Unwrap() http.ResponseWriter { return capture.ResponseWriter }

func (capture *responseCapture) Flush() {
	if capture.status == 0 {
		capture.WriteHeader(http.StatusOK)
	}
	_ = http.NewResponseController(capture.ResponseWriter).Flush()
}

func runtimeSnapshot() (string, int, uint64) {
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)
	return runtime.Version(), runtime.NumGoroutine(), memory.Alloc
}

func (s *Server) invitationURL(route, token string) string {
	if s.publicAppURL != "" {
		return s.publicAppURL + "/" + route + "/" + token
	}
	return "bookgyeol://" + route + "/" + token
}

func writeError(response http.ResponseWriter, status int, code, message string) {
	writeJSON(response, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.WriteHeader(status)
	if err := json.NewEncoder(response).Encode(value); err != nil {
		slog.Error("encode response", "error", fmt.Errorf("encode JSON: %w", err))
	}
}
