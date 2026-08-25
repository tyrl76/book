package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

const localSessionDuration = 30 * 24 * time.Hour

var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

type LocalAuthUser struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Nickname string `json:"nickname"`
}

type LocalCredential struct {
	User         LocalAuthUser
	PasswordHash string
}

type LocalAuthStore interface {
	LocalRegistrationOpen(context.Context) (bool, error)
	CreateLocalAccount(context.Context, string, string, string, []byte, time.Time) (LocalAuthUser, error)
	GetLocalCredential(context.Context, string) (LocalCredential, error)
	CreateLocalSession(context.Context, string, []byte, time.Time) error
	RevokeLocalSession(context.Context, []byte) error
}

type localAuthRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Nickname string `json:"nickname"`
}

type localAuthResponse struct {
	Token     string        `json:"token"`
	ExpiresAt time.Time     `json:"expiresAt"`
	User      LocalAuthUser `json:"user"`
}

func (s *Server) localAuthStore(response http.ResponseWriter) (LocalAuthStore, bool) {
	if !s.localAuthEnabled {
		writeError(response, http.StatusServiceUnavailable, "local_auth_disabled", "개인 계정 로그인이 설정되지 않았습니다")
		return nil, false
	}
	store, ok := s.store.(LocalAuthStore)
	if !ok {
		writeError(response, http.StatusNotImplemented, "feature_unavailable", "개인 계정 저장소가 설정되지 않았습니다")
	}
	return store, ok
}

func (s *Server) localAuthStatus(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("Cache-Control", "no-store")
	store, ok := s.localAuthStore(response)
	if !ok {
		return
	}
	registrationOpen, err := store.LocalRegistrationOpen(request.Context())
	if err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, map[string]bool{"registrationOpen": registrationOpen})
}

func (s *Server) registerLocalAccount(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("Cache-Control", "no-store")
	store, ok := s.localAuthStore(response)
	if !ok {
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
	token, tokenHash, err := newLocalSessionToken()
	if err != nil {
		s.internalError(response, err)
		return
	}
	expiresAt := time.Now().UTC().Add(localSessionDuration)
	user, err := store.CreateLocalAccount(request.Context(), payload.Email, payload.Nickname, string(passwordHash), tokenHash, expiresAt)
	if err != nil {
		if errors.Is(err, ErrConflict) {
			writeError(response, http.StatusConflict, "registration_closed", "개인 계정이 이미 만들어져 있습니다")
			return
		}
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusCreated, localAuthResponse{Token: token, ExpiresAt: expiresAt, User: user})
}

func (s *Server) loginLocalAccount(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("Cache-Control", "no-store")
	store, ok := s.localAuthStore(response)
	if !ok {
		return
	}
	payload, ok := decodeLocalAuthRequest(response, request, false)
	if !ok {
		return
	}

	credential, err := store.GetLocalCredential(request.Context(), payload.Email)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			// A real bcrypt comparison keeps unknown-account and wrong-password paths similar.
			_ = bcrypt.CompareHashAndPassword([]byte("$2a$10$7EqJtq98hPqEX7fNZaFWoO5uP6YwA4C1pV5aZ5eI0vT2fl7w4QJtK"), []byte(payload.Password))
			writeError(response, http.StatusUnauthorized, "invalid_credentials", "이메일 또는 비밀번호를 확인해 주세요")
			return
		}
		s.internalError(response, err)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(credential.PasswordHash), []byte(payload.Password)) != nil {
		writeError(response, http.StatusUnauthorized, "invalid_credentials", "이메일 또는 비밀번호를 확인해 주세요")
		return
	}

	token, tokenHash, err := newLocalSessionToken()
	if err != nil {
		s.internalError(response, err)
		return
	}
	expiresAt := time.Now().UTC().Add(localSessionDuration)
	if err := store.CreateLocalSession(request.Context(), credential.User.ID, tokenHash, expiresAt); err != nil {
		s.internalError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, localAuthResponse{Token: token, ExpiresAt: expiresAt, User: credential.User})
}

func (s *Server) logoutLocalAccount(response http.ResponseWriter, request *http.Request, _ string) {
	response.Header().Set("Cache-Control", "no-store")
	store, ok := s.localAuthStore(response)
	if !ok {
		return
	}
	token := bearerToken(request)
	if token == "" {
		writeError(response, http.StatusUnauthorized, "missing_access_token", "로그인이 필요합니다")
		return
	}
	digest := sha256.Sum256([]byte(token))
	if err := store.RevokeLocalSession(request.Context(), digest[:]); err != nil {
		s.internalError(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func decodeLocalAuthRequest(response http.ResponseWriter, request *http.Request, registration bool) (localAuthRequest, bool) {
	var payload localAuthRequest
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 16<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_json", "요청 본문을 확인해 주세요")
		return payload, false
	}
	payload.Email = strings.ToLower(strings.TrimSpace(payload.Email))
	payload.Nickname = strings.TrimSpace(payload.Nickname)
	passwordBytes := len([]byte(payload.Password))
	if len(payload.Email) > 254 || !emailPattern.MatchString(payload.Email) || passwordBytes < 10 || passwordBytes > 72 {
		writeError(response, http.StatusBadRequest, "invalid_credentials", "올바른 이메일과 10자 이상의 비밀번호를 입력해 주세요")
		return payload, false
	}
	if registration && (utf8.RuneCountInString(payload.Nickname) < 1 || utf8.RuneCountInString(payload.Nickname) > 40) {
		writeError(response, http.StatusBadRequest, "invalid_nickname", "닉네임은 1자에서 40자 사이여야 합니다")
		return payload, false
	}
	return payload, true
}

func newLocalSessionToken() (string, []byte, error) {
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", nil, err
	}
	token := "bgs_" + base64.RawURLEncoding.EncodeToString(random)
	digest := sha256.Sum256([]byte(token))
	return token, digest[:], nil
}

func bearerToken(request *http.Request) string {
	parts := strings.Fields(strings.TrimSpace(request.Header.Get("Authorization")))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return parts[1]
}
