package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type fakeLocalAuthStore struct {
	fakeStore
	registrationOpen bool
	createErr        error
	credential       LocalCredential
	createdEmail     string
	createdNickname  string
	createdHash      string
	sessionUserID    string
	sessionHash      []byte
}

func (f *fakeLocalAuthStore) LocalRegistrationOpen(context.Context) (bool, error) {
	return f.registrationOpen, nil
}

func (f *fakeLocalAuthStore) CreateLocalAccount(_ context.Context, email, nickname, passwordHash string, tokenHash []byte, _ time.Time) (LocalAuthUser, error) {
	f.createdEmail = email
	f.createdNickname = nickname
	f.createdHash = passwordHash
	f.sessionHash = tokenHash
	if f.createErr != nil {
		return LocalAuthUser{}, f.createErr
	}
	return LocalAuthUser{ID: "11111111-1111-4111-8111-111111111111", Email: email, Nickname: nickname}, nil
}

func (f *fakeLocalAuthStore) GetLocalCredential(context.Context, string) (LocalCredential, error) {
	if f.credential.User.ID == "" {
		return LocalCredential{}, ErrNotFound
	}
	return f.credential, nil
}

func (f *fakeLocalAuthStore) CreateLocalSession(_ context.Context, userID string, tokenHash []byte, _ time.Time) error {
	f.sessionUserID = userID
	f.sessionHash = tokenHash
	return nil
}

func (f *fakeLocalAuthStore) RevokeLocalSession(context.Context, []byte) error { return nil }

func TestLocalRegistrationCreatesSingleSecureCredential(t *testing.T) {
	store := &fakeLocalAuthStore{registrationOpen: true}
	handler := NewServer(store, Options{LocalAuthEnabled: true})
	request := httptest.NewRequest(http.MethodPost, "/v1/auth/register", strings.NewReader(`{
		"email":" Reader@Example.com ","password":"correct-horse-42","nickname":"나의 책장"
	}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if store.createdEmail != "reader@example.com" || store.createdNickname != "나의 책장" {
		t.Fatalf("unexpected account = %q, %q", store.createdEmail, store.createdNickname)
	}
	if store.createdHash == "correct-horse-42" || bcrypt.CompareHashAndPassword([]byte(store.createdHash), []byte("correct-horse-42")) != nil {
		t.Fatal("password was not stored as a bcrypt hash")
	}
	var payload localAuthResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(payload.Token, "bgs_") || len(store.sessionHash) != 32 {
		t.Fatalf("unexpected session token or hash: %q, %d", payload.Token, len(store.sessionHash))
	}
}

func TestLocalLoginRejectsWrongPassword(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("correct-horse-42"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	store := &fakeLocalAuthStore{credential: LocalCredential{
		User:         LocalAuthUser{ID: "11111111-1111-4111-8111-111111111111", Email: "reader@example.com", Nickname: "독서가"},
		PasswordHash: string(hash),
	}}
	handler := NewServer(store, Options{LocalAuthEnabled: true})
	request := httptest.NewRequest(http.MethodPost, "/v1/auth/login", strings.NewReader(`{"email":"reader@example.com","password":"totally-wrong"}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized || store.sessionUserID != "" {
		t.Fatalf("status = %d, session user = %q, body = %s", response.Code, store.sessionUserID, response.Body.String())
	}
}

func TestLocalRegistrationClosesAfterFirstAccount(t *testing.T) {
	store := &fakeLocalAuthStore{createErr: ErrConflict}
	handler := NewServer(store, Options{LocalAuthEnabled: true})
	request := httptest.NewRequest(http.MethodPost, "/v1/auth/register", strings.NewReader(`{
		"email":"reader@example.com","password":"correct-horse-42","nickname":"독서가"
	}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusConflict {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}
