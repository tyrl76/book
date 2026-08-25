package api

import (
	"context"
	"net/http"
	"time"
)

type StorageStatus struct {
	Database        string    `json:"database"`
	Connected       bool      `json:"connected"`
	ReadingRuns     int       `json:"readingRuns"`
	ProgressEntries int       `json:"progressEntries"`
	FeedEvents      int       `json:"feedEvents"`
	Comments        int       `json:"comments"`
	LastSavedAt     time.Time `json:"lastSavedAt"`
	CheckedAt       time.Time `json:"checkedAt"`
}

type StorageStatusStore interface {
	GetStorageStatus(context.Context, string) (StorageStatus, error)
}

func (s *Server) getStorageStatus(response http.ResponseWriter, request *http.Request, userID string) {
	response.Header().Set("Cache-Control", "no-store")
	store, ok := s.store.(StorageStatusStore)
	if !ok {
		writeError(response, http.StatusNotImplemented, "feature_unavailable", "저장 상태 확인 기능이 설정되지 않았습니다")
		return
	}
	status, err := store.GetStorageStatus(request.Context(), userID)
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, status)
}
