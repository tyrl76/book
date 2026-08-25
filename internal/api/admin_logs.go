package api

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type AdminLogEntry struct {
	ID            uint64    `json:"id"`
	OccurredAt    time.Time `json:"occurredAt"`
	Level         string    `json:"level"`
	Message       string    `json:"message"`
	Method        string    `json:"method,omitempty"`
	Path          string    `json:"path,omitempty"`
	Status        int       `json:"status,omitempty"`
	DurationMS    int64     `json:"durationMs,omitempty"`
	ResponseBytes int64     `json:"responseBytes,omitempty"`
	Detail        string    `json:"detail,omitempty"`
}

type AdminLogBuffer struct {
	mu          sync.RWMutex
	capacity    int
	nextID      uint64
	entries     []AdminLogEntry
	subscribers map[chan AdminLogEntry]struct{}
}

func NewAdminLogBuffer(capacity int) *AdminLogBuffer {
	if capacity < 1 {
		capacity = 1
	}
	return &AdminLogBuffer{capacity: capacity, entries: make([]AdminLogEntry, 0, capacity), subscribers: make(map[chan AdminLogEntry]struct{})}
}

func (buffer *AdminLogBuffer) Append(entry AdminLogEntry) AdminLogEntry {
	buffer.mu.Lock()
	buffer.nextID++
	entry.ID = buffer.nextID
	if entry.OccurredAt.IsZero() {
		entry.OccurredAt = time.Now().UTC()
	}
	entry.Level = normalizeLogLevel(entry.Level)
	entry.Detail = sanitizeLogDetail(entry.Detail)
	if len(buffer.entries) == buffer.capacity {
		copy(buffer.entries, buffer.entries[1:])
		buffer.entries[len(buffer.entries)-1] = entry
	} else {
		buffer.entries = append(buffer.entries, entry)
	}
	for subscriber := range buffer.subscribers {
		select {
		case subscriber <- entry:
		default:
		}
	}
	buffer.mu.Unlock()
	return entry
}

func (buffer *AdminLogBuffer) Snapshot(afterID uint64, limit int) []AdminLogEntry {
	buffer.mu.RLock()
	defer buffer.mu.RUnlock()
	if limit < 1 || limit > buffer.capacity {
		limit = buffer.capacity
	}
	items := make([]AdminLogEntry, 0, limit)
	for _, entry := range buffer.entries {
		if entry.ID > afterID {
			items = append(items, entry)
		}
	}
	if len(items) > limit {
		items = items[len(items)-limit:]
	}
	return items
}

func (buffer *AdminLogBuffer) Subscribe() (<-chan AdminLogEntry, func()) {
	updates := make(chan AdminLogEntry, 64)
	buffer.mu.Lock()
	buffer.subscribers[updates] = struct{}{}
	buffer.mu.Unlock()
	var once sync.Once
	return updates, func() {
		once.Do(func() {
			buffer.mu.Lock()
			delete(buffer.subscribers, updates)
			close(updates)
			buffer.mu.Unlock()
		})
	}
}

func normalizeLogLevel(level string) string {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug", "info", "warn", "error":
		return strings.ToLower(strings.TrimSpace(level))
	default:
		return "info"
	}
}

var sensitiveLogValue = regexp.MustCompile(`(?i)(authorization|password|passwd|token|secret|api[_-]?key|cookie)(\s*[=:]\s*)([^\s,;]+)`)

func sanitizeLogDetail(value string) string {
	value = sensitiveLogValue.ReplaceAllString(value, "$1$2[REDACTED]")
	if len(value) > 800 {
		value = value[:800] + "…"
	}
	return value
}

func (s *Server) listAdminLogs(response http.ResponseWriter, request *http.Request, _ string) {
	afterID, ok := parseAfterID(response, request)
	if !ok {
		return
	}
	limit := 200
	if raw := request.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 500 {
			writeError(response, http.StatusBadRequest, "invalid_limit", "limit은 1에서 500 사이여야 합니다")
			return
		}
		limit = parsed
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": s.adminLogs.Snapshot(afterID, limit)})
}

type adminLogStreamEvent struct {
	Type   string         `json:"type"`
	Entry  *AdminLogEntry `json:"entry,omitempty"`
	LastID uint64         `json:"lastId,omitempty"`
}

func (s *Server) streamAdminLogs(response http.ResponseWriter, request *http.Request, _ string) {
	afterID, ok := parseAfterID(response, request)
	if !ok {
		return
	}
	response.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	response.Header().Set("Cache-Control", "no-store")
	response.Header().Set("X-Content-Type-Options", "nosniff")
	response.Header().Set("X-Accel-Buffering", "no")
	controller := http.NewResponseController(response)
	if err := controller.Flush(); err != nil {
		writeError(response, http.StatusNotImplemented, "stream_unavailable", "이 환경에서는 실시간 로그를 사용할 수 없습니다")
		return
	}

	updates, cancel := s.adminLogs.Subscribe()
	defer cancel()
	encoder := json.NewEncoder(response)
	lastID := afterID
	writeEntry := func(entry AdminLogEntry) bool {
		if entry.ID <= lastID {
			return true
		}
		if err := encoder.Encode(adminLogStreamEvent{Type: "log", Entry: &entry}); err != nil {
			return false
		}
		lastID = entry.ID
		return controller.Flush() == nil
	}
	for _, entry := range s.adminLogs.Snapshot(afterID, 500) {
		if !writeEntry(entry) {
			return
		}
	}

	heartbeat := time.NewTicker(3 * time.Second)
	defer heartbeat.Stop()
	streamWindow := time.NewTimer(10 * time.Second)
	defer streamWindow.Stop()
	for {
		select {
		case <-request.Context().Done():
			return
		case <-streamWindow.C:
			return
		case entry, open := <-updates:
			if !open || !writeEntry(entry) {
				return
			}
		case <-heartbeat.C:
			if err := encoder.Encode(adminLogStreamEvent{Type: "heartbeat", LastID: lastID}); err != nil || controller.Flush() != nil {
				return
			}
		}
	}
}

func parseAfterID(response http.ResponseWriter, request *http.Request) (uint64, bool) {
	raw := strings.TrimSpace(request.URL.Query().Get("after"))
	if raw == "" {
		return 0, true
	}
	parsed, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_after", "after 로그 ID를 확인해 주세요")
		return 0, false
	}
	return parsed, true
}

type AdminStorageOverview struct {
	Users                int64 `json:"users"`
	ActiveSessions       int64 `json:"activeSessions"`
	ReadingRuns          int64 `json:"readingRuns"`
	ProgressEntries      int64 `json:"progressEntries"`
	OpenReports          int64 `json:"openReports"`
	PendingOutbox        int64 `json:"pendingOutbox"`
	PendingNotifications int64 `json:"pendingNotifications"`
	FailedNotifications  int64 `json:"failedNotifications"`
	DatabaseSizeBytes    int64 `json:"databaseSizeBytes"`
}

type AdminOverviewStore interface {
	GetAdminOverview(context.Context) (AdminStorageOverview, error)
}

func (s *Server) getAdminOverview(response http.ResponseWriter, request *http.Request, _ string) {
	store, ok := s.store.(AdminOverviewStore)
	if !ok {
		writeError(response, http.StatusNotImplemented, "feature_unavailable", "운영 현황 저장소가 설정되지 않았습니다")
		return
	}
	storage, err := store.GetAdminOverview(request.Context())
	if err != nil {
		s.internalError(response, err)
		return
	}
	goVersion, goroutines, memoryBytes := runtimeSnapshot()
	writeJSON(response, http.StatusOK, map[string]any{
		"status": "ok", "database": "connected", "generatedAt": time.Now().UTC(),
		"uptimeSeconds": int64(time.Since(s.startedAt).Seconds()), "goVersion": goVersion,
		"goroutines": goroutines, "memoryBytes": memoryBytes, "storage": storage,
	})
}
