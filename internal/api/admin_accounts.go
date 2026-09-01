package api

import (
	"context"
	"errors"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type AdminLocalAccount struct {
	ID             string    `json:"id"`
	Email          string    `json:"email"`
	Nickname       string    `json:"nickname"`
	ActiveSessions int       `json:"activeSessions"`
	CreatedAt      time.Time `json:"createdAt"`
}

type AdminLocalAccountStore interface {
	ListAdminLocalAccounts(context.Context) ([]AdminLocalAccount, error)
	CreateAdminLocalAccount(context.Context, string, string, string) (AdminLocalAccount, error)
}

func (s *Server) listAdminLocalAccounts(response http.ResponseWriter, request *http.Request, _ string) {
	store, ok := s.store.(AdminLocalAccountStore)
	if !ok {
		writeError(response, http.StatusNotImplemented, "feature_unavailable", "로컬 계정 관리 저장소가 설정되지 않았습니다")
		return
	}
	items, err := store.ListAdminLocalAccounts(request.Context())
	if err != nil {
		s.internalError(response, err)
		return
	}
	if items == nil {
		items = []AdminLocalAccount{}
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) createAdminLocalAccount(response http.ResponseWriter, request *http.Request, operatorID string) {
	if !s.localAuthEnabled {
		writeError(response, http.StatusServiceUnavailable, "local_auth_disabled", "개인 계정 로그인이 설정되지 않았습니다")
		return
	}
	store, ok := s.store.(AdminLocalAccountStore)
	if !ok {
		writeError(response, http.StatusNotImplemented, "feature_unavailable", "로컬 계정 관리 저장소가 설정되지 않았습니다")
		return
	}
	payload, ok := decodeLocalAuthRequest(response, request, true)
	if !ok {
		return
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(payload.Password), bcrypt.DefaultCost)
	if err != nil {
		s.internalError(response, err)
		return
	}
	item, err := store.CreateAdminLocalAccount(request.Context(), payload.Email, payload.Nickname, string(passwordHash))
	if err != nil {
		if errors.Is(err, ErrConflict) {
			writeError(response, http.StatusConflict, "email_exists", "이미 등록된 이메일입니다")
			return
		}
		s.internalError(response, err)
		return
	}
	s.logger.Info("admin local account created", "operatorID", operatorID, "userID", item.ID)
	writeJSON(response, http.StatusCreated, item)
}
