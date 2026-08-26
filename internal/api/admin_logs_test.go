package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

type fakeAdminOverviewStore struct {
	fakeStore
	overview AdminStorageOverview
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
	for _, expected := range []string{"운영 현황", "실시간 API 로그", "신고 및 감사 기록", "최초 개인 계정 만들기", "/v1/auth/register"} {
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

func TestAdminConsoleAutoConnectsInDevelopmentOpenAccess(t *testing.T) {
	handler := NewServer(&fakeStore{}, Options{AdminOpenAccess: true})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/admin", nil))

	if !strings.Contains(response.Body.String(), "const openAccess=true") {
		t.Fatal("admin console must enable automatic development access")
	}
}
