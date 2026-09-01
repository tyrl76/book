package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type fakeAdminOverviewStore struct {
	fakeStore
	overview AdminStorageOverview
}

type fakeAdminLocalAccountStore struct {
	fakeStore
	items           []AdminLocalAccount
	createErr       error
	createdEmail    string
	createdNickname string
	createdHash     string
}

func (store *fakeAdminLocalAccountStore) ListAdminLocalAccounts(context.Context) ([]AdminLocalAccount, error) {
	return store.items, nil
}

func (store *fakeAdminLocalAccountStore) CreateAdminLocalAccount(_ context.Context, email, nickname, passwordHash string) (AdminLocalAccount, error) {
	store.createdEmail = email
	store.createdNickname = nickname
	store.createdHash = passwordHash
	if store.createErr != nil {
		return AdminLocalAccount{}, store.createErr
	}
	return AdminLocalAccount{ID: "11111111-1111-4111-8111-111111111111", Email: email, Nickname: nickname, CreatedAt: time.Now().UTC()}, nil
}

func (store *fakeAdminOverviewStore) GetAdminOverview(context.Context) (AdminStorageOverview, error) {
	return store.overview, nil
}

func TestAdminLogBufferBoundsAndRedacts(t *testing.T) {
	buffer := NewAdminLogBuffer(2)
	buffer.Append(AdminLogEntry{Level: "INFO", Message: "first"})
	buffer.Append(AdminLogEntry{Level: "warn", Message: "second", Detail: "token=private-value"})
	buffer.Append(AdminLogEntry{Level: "unexpected", Message: "third"})

	items := buffer.Snapshot(0, 10)
	if len(items) != 2 || items[0].Message != "second" || items[1].Message != "third" {
		t.Fatalf("unexpected bounded snapshot: %#v", items)
	}
	if items[0].Detail != "token=[REDACTED]" || items[1].Level != "info" {
		t.Fatalf("redaction or normalization failed: %#v", items)
	}
	if after := buffer.Snapshot(items[0].ID, 10); len(after) != 1 || after[0].ID != items[1].ID {
		t.Fatalf("unexpected after snapshot: %#v", after)
	}
}

func TestAdminOverviewRequiresKeyAndReturnsMetrics(t *testing.T) {
	store := &fakeAdminOverviewStore{overview: AdminStorageOverview{Users: 3, ActiveSessions: 2, DatabaseSizeBytes: 4096}}
	handler := NewServer(store, Options{AdminAPIKey: "test-admin-key"})

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/admin/overview", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/admin/overview", nil)
	request.Header.Set("X-Admin-Key", "test-admin-key")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"users":3`) || !strings.Contains(response.Body.String(), `"database":"connected"`) {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestAdminOverviewAllowsExplicitDevelopmentOpenAccess(t *testing.T) {
	store := &fakeAdminOverviewStore{overview: AdminStorageOverview{Users: 1}}
	handler := NewServer(store, Options{AdminOpenAccess: true})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/admin/overview", nil))

	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"users":1`) {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestAdminCanCreateAdditionalLocalAccountWithoutOpeningRegistration(t *testing.T) {
	store := &fakeAdminLocalAccountStore{}
	handler := NewServer(store, Options{AdminAPIKey: "test-admin-key", LocalAuthEnabled: true})

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodPost, "/v1/admin/local-accounts", strings.NewReader(`{"email":"tester@example.com","nickname":"테스터","password":"correct-horse-42"}`)))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodPost, "/v1/admin/local-accounts", strings.NewReader(`{"email":" Tester@Example.com ","nickname":"테스트 독서가","password":"correct-horse-42"}`))
	request.Header.Set("X-Admin-Key", "test-admin-key")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if store.createdEmail != "tester@example.com" || store.createdNickname != "테스트 독서가" {
		t.Fatalf("unexpected account = %q, %q", store.createdEmail, store.createdNickname)
	}
	if store.createdHash == "correct-horse-42" || bcrypt.CompareHashAndPassword([]byte(store.createdHash), []byte("correct-horse-42")) != nil {
		t.Fatal("admin-created password was not stored as a bcrypt hash")
	}
	if strings.Contains(response.Body.String(), "correct-horse-42") || strings.Contains(response.Body.String(), `"token"`) {
		t.Fatalf("response leaked credential material: %s", response.Body.String())
	}
}

func TestAdminAdditionalLocalAccountRejectsDuplicateEmail(t *testing.T) {
	store := &fakeAdminLocalAccountStore{createErr: ErrConflict}
	handler := NewServer(store, Options{AdminOpenAccess: true, LocalAuthEnabled: true})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/admin/local-accounts", strings.NewReader(`{"email":"tester@example.com","nickname":"테스터","password":"correct-horse-42"}`)))

	if response.Code != http.StatusConflict || !strings.Contains(response.Body.String(), "email_exists") {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestAdminListsLocalAccounts(t *testing.T) {
	store := &fakeAdminLocalAccountStore{items: []AdminLocalAccount{{
		ID: "11111111-1111-4111-8111-111111111111", Email: "reader@example.com", Nickname: "독서가", ActiveSessions: 2, CreatedAt: time.Now().UTC(),
	}}}
	handler := NewServer(store, Options{AdminOpenAccess: true, LocalAuthEnabled: true})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/admin/local-accounts", nil))

	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "reader@example.com") || !strings.Contains(response.Body.String(), `"activeSessions":2`) {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestRequestLogCapturesStatusWithoutQuery(t *testing.T) {
	buffer := NewAdminLogBuffer(10)
	handler := NewServer(&fakeStore{}, Options{AdminLogBuffer: buffer})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/missing?token=must-not-appear", nil))

	items := buffer.Snapshot(0, 10)
	if response.Code != http.StatusNotFound || len(items) != 1 {
		t.Fatalf("status = %d, logs = %#v", response.Code, items)
	}
	if items[0].Status != http.StatusNotFound || items[0].Path != "/missing" || strings.Contains(items[0].Path, "token") {
		t.Fatalf("sensitive or incomplete request log: %#v", items[0])
	}
}

func TestAdminLogListAndStreamAreProtected(t *testing.T) {
	buffer := NewAdminLogBuffer(10)
	entry := buffer.Append(AdminLogEntry{Level: "error", Message: "database unavailable"})
	handler := NewServer(&fakeStore{}, Options{AdminAPIKey: "test-admin-key", AdminLogBuffer: buffer})

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/admin/logs", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/admin/logs?after=0", nil)
	request.Header.Set("X-Admin-Key", "test-admin-key")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"id":`+strconv.FormatUint(entry.ID, 10)) || !strings.Contains(response.Body.String(), "database unavailable") {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	streamRequest := httptest.NewRequest(http.MethodGet, "/v1/admin/logs/stream?after=0", nil).WithContext(ctx)
	streamRequest.Header.Set("X-Admin-Key", "test-admin-key")
	streamResponse := httptest.NewRecorder()
	handler.ServeHTTP(streamResponse, streamRequest)
	if streamResponse.Code != http.StatusOK || !strings.Contains(streamResponse.Body.String(), `"type":"log"`) {
		t.Fatalf("stream status = %d, body = %s", streamResponse.Code, streamResponse.Body.String())
	}
}

func TestAdminConsoleIncludesOperationsViews(t *testing.T) {
	handler := NewServer(&fakeStore{}, Options{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/admin", nil))
	for _, expected := range []string{"운영 현황", "테스트 계정 관리", "새 계정 추가", "/v1/admin/local-accounts", "실시간 API 로그", "신고 및 감사 기록", "최초 개인 계정 만들기", "/v1/auth/register", "/admin/books"} {
		if !strings.Contains(response.Body.String(), expected) {
			t.Fatalf("admin console missing %q", expected)
		}
	}
	if strings.Contains(response.Body.String(), "bookgyeol.ownerPassword") {
		t.Fatal("admin console must not persist the owner password")
	}
	if !strings.Contains(response.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Fatal("admin console missing restrictive content security policy")
	}
}

func TestAdminBookSearchPageAndAPI(t *testing.T) {
	handler := NewServer(&fakeStore{}, Options{AdminAPIKey: "test-admin-key", Catalog: &fakeStore{}})

	page := httptest.NewRecorder()
	handler.ServeHTTP(page, httptest.NewRequest(http.MethodGet, "/admin/books", nil))
	if page.Code != http.StatusOK || !strings.Contains(page.Body.String(), "도서 검색") || !strings.Contains(page.Body.String(), "/v1/admin/catalog/books") {
		t.Fatalf("book search page status = %d", page.Code)
	}
	if !strings.Contains(page.Body.String(), `minlength="1"`) {
		t.Fatal("book search page must allow one-character queries")
	}
	if !strings.Contains(page.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Fatal("book search page missing restrictive content security policy")
	}

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/admin/catalog/books?query=한강", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized catalog status = %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/admin/catalog/books?query=눈", nil)
	request.Header.Set("X-Admin-Key", "test-admin-key")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"items":[]`) {
		t.Fatalf("catalog status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestAdminConsoleAutoConnectsInDevelopmentOpenAccess(t *testing.T) {
	handler := NewServer(&fakeStore{}, Options{AdminOpenAccess: true})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/admin", nil))

	if !strings.Contains(response.Body.String(), "const openAccess=true") {
		t.Fatal("admin console must enable automatic development access")
	}
}
