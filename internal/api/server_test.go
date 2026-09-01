package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/datau/book/internal/catalog"
)

type fakeStore struct {
	recorded      RecordProgressCommand
	created       CreateReadingRunCommand
	createdUserID string
	lookup        catalog.Book
	lookupErr     error
}

func (f *fakeStore) Ping(context.Context) error                       { return nil }
func (f *fakeStore) EnsureUser(context.Context, string, string) error { return nil }
func (f *fakeStore) ListReadingRuns(context.Context, string) ([]ReadingRun, error) {
	return []ReadingRun{{ID: "a1111111-1111-4111-8111-111111111111", ISBN: "9788934998068", Title: "아무튼, 메모", Author: "정혜윤"}}, nil
}
func (f *fakeStore) ListFeed(context.Context, string, int) ([]FeedEvent, error) {
	return []FeedEvent{}, nil
}
func (f *fakeStore) CreateReadingRun(context.Context, string, CreateReadingRunCommand) (ReadingRun, error) {
	panic("use CreateReadingRunWithCapture")
}
func (f *fakeStore) Search(context.Context, string, int) ([]catalog.Book, error) { return nil, nil }
func (f *fakeStore) LookupISBN(context.Context, string) (catalog.Book, error) {
	if f.lookupErr != nil {
		return catalog.Book{}, f.lookupErr
	}
	if f.lookup.ISBN == "" {
		return catalog.Book{}, catalog.ErrNotFound
	}
	return f.lookup, nil
}
func (f *fakeStore) RecordProgress(_ context.Context, _, _ string, command RecordProgressCommand) (RecordProgressResult, error) {
	f.recorded = command
	return RecordProgressResult{EntryID: "e1111111-1111-4111-8111-111111111111", CurrentValue: command.CurrentValue}, nil
}

type captureStore struct{ fakeStore }

func (f *captureStore) CreateReadingRun(_ context.Context, userID string, command CreateReadingRunCommand) (ReadingRun, error) {
	f.createdUserID = userID
	f.created = command
	return ReadingRun{ID: "b1111111-1111-4111-8111-111111111111", ISBN: command.Book.ISBN, Title: command.Book.Title, TotalValue: command.TotalValue}, nil
}

type fakeAccessStore struct {
	fakeStore
	access UserAccess
}

func (f *fakeAccessStore) GetUserAccess(context.Context, string) (UserAccess, error) {
	return f.access, nil
}

type fakeModerationStore struct {
	fakeStore
	resolved ResolveReportCommand
}

func (f *fakeModerationStore) ListReports(context.Context, string, int) ([]AdminReport, error) {
	return []AdminReport{{ID: "a1111111-1111-4111-8111-111111111111", Status: "open"}}, nil
}
func (f *fakeModerationStore) ResolveReport(_ context.Context, _ string, command ResolveReportCommand) (ModerationAction, error) {
	f.resolved = command
	return ModerationAction{ID: "b1111111-1111-4111-8111-111111111111", OperatorID: command.OperatorID}, nil
}
func (f *fakeModerationStore) RestoreHiddenTarget(context.Context, string, string, string, string) (ModerationAction, error) {
	return ModerationAction{}, nil
}
func (f *fakeModerationStore) ListModerationActions(context.Context, int) ([]ModerationAction, error) {
	return []ModerationAction{}, nil
}

type fakeAccountStore struct {
	fakeStore
	requested, deleted, completed bool
	deletedReadingRunID           string
	deleteErr                     error
	deleteReadingRunErr           error
}

func (f *fakeAccountStore) GetProfile(context.Context, string) (Profile, error) {
	return Profile{}, nil
}
func (f *fakeAccountStore) UpdateProfile(context.Context, string, UpdateProfileCommand) (Profile, error) {
	return Profile{}, nil
}
func (f *fakeAccountStore) UpdateReadingRun(context.Context, string, string, UpdateReadingRunCommand) (ReadingRun, error) {
	return ReadingRun{}, nil
}
func (f *fakeAccountStore) DeleteReadingRun(_ context.Context, _ string, runID string) error {
	f.deletedReadingRunID = runID
	return f.deleteReadingRunErr
}
func (f *fakeAccountStore) ListProgressEntries(context.Context, string, string) ([]ProgressEntry, error) {
	return nil, nil
}
func (f *fakeAccountStore) GetReadingStats(context.Context, string, int) (ReadingStats, error) {
	return ReadingStats{}, nil
}
func (f *fakeAccountStore) GetNotificationPreferences(context.Context, string) (NotificationPreferences, error) {
	return NotificationPreferences{}, nil
}
func (f *fakeAccountStore) UpdateNotificationPreferences(context.Context, string, NotificationPreferences) (NotificationPreferences, error) {
	return NotificationPreferences{}, nil
}
func (f *fakeAccountStore) RegisterPushToken(context.Context, string, string, string) error {
	return nil
}
func (f *fakeAccountStore) DisablePushTokens(context.Context, string) error { return nil }
func (f *fakeAccountStore) SetAnnualGoal(context.Context, string, int, int) error {
	return nil
}
func (f *fakeAccountStore) ExportUserData(context.Context, string) (json.RawMessage, error) {
	return nil, nil
}
func (f *fakeAccountStore) DeleteUser(context.Context, string) error {
	f.deleted = true
	return f.deleteErr
}
func (f *fakeAccountStore) RequestUserDeletion(context.Context, string) error {
	f.requested = true
	return nil
}
func (f *fakeAccountStore) MarkUserDeletionCompleted(context.Context, string) error {
	f.completed = true
	return nil
}

type fakeAuthUserDeleter struct{ err error }

func (f fakeAuthUserDeleter) DeleteUser(context.Context, string) error { return f.err }

type fakeVerifier struct {
	userID string
	err    error
	token  string
}

func (f *fakeVerifier) Verify(_ context.Context, token string) (string, error) {
	f.token = token
	return f.userID, f.err
}

func TestRecordProgress(t *testing.T) {
	store := &fakeStore{}
	handler := NewServer(store, Options{AllowDevAuth: true, DevUserID: "11111111-1111-4111-8111-111111111111"})
	body := `{"clientOperationId":"d1111111-1111-4111-8111-111111111111","currentValue":120,"recordedAt":"2026-08-20T01:02:03Z","note":"좋은 문장"}`
	request := httptest.NewRequest(http.MethodPost, "/v1/reading-runs/a1111111-1111-4111-8111-111111111111/progress", strings.NewReader(body))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if store.recorded.CurrentValue != 120 || !store.recorded.RecordedAt.Equal(time.Date(2026, 8, 20, 1, 2, 3, 0, time.UTC)) {
		t.Fatalf("unexpected command: %#v", store.recorded)
	}
}

func TestRecordProgressRejectsDecreaseShapeBeforeStore(t *testing.T) {
	store := &fakeStore{}
	handler := NewServer(store, Options{AllowDevAuth: true, DevUserID: "11111111-1111-4111-8111-111111111111"})
	body := `{"clientOperationId":"not-a-uuid","currentValue":-1,"recordedAt":"2026-08-20T01:02:03Z"}`
	request := httptest.NewRequest(http.MethodPost, "/v1/reading-runs/a1111111-1111-4111-8111-111111111111/progress", strings.NewReader(body))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", response.Code)
	}
}

func TestBearerAuthUsesVerifiedSubject(t *testing.T) {
	store := &fakeStore{}
	verifier := &fakeVerifier{userID: "22222222-2222-4222-8222-222222222222"}
	handler := NewServer(store, Options{TokenVerifier: verifier})
	request := httptest.NewRequest(http.MethodGet, "/v1/reading-runs", nil)
	request.Header.Set("Authorization", "Bearer signed-token")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK || verifier.token != "signed-token" {
		t.Fatalf("status = %d, token = %q, body = %s", response.Code, verifier.token, response.Body.String())
	}
}

func TestListReadingRunsIncludesCatalogISBN(t *testing.T) {
	handler := NewServer(&fakeStore{}, Options{
		AllowDevAuth: true,
		DevUserID:    "11111111-1111-4111-8111-111111111111",
	})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/reading-runs", nil))

	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"isbn":"9788934998068"`) {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestInvalidBearerNeverFallsBackToDevAuth(t *testing.T) {
	store := &fakeStore{}
	verifier := &fakeVerifier{err: errors.New("invalid signature")}
	handler := NewServer(store, Options{
		AllowDevAuth: true, DevUserID: "11111111-1111-4111-8111-111111111111", TokenVerifier: verifier,
	})
	request := httptest.NewRequest(http.MethodGet, "/v1/reading-runs", nil)
	request.Header.Set("Authorization", "Bearer forged-token")
	request.Header.Set("X-User-ID", "11111111-1111-4111-8111-111111111111")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", response.Code)
	}
}

func TestCreateReadingRunUsesCatalogBook(t *testing.T) {
	store := &captureStore{}
	store.lookup = catalog.Book{ISBN: "9788936434267", Title: "소년이 온다", Author: "한강", Source: "test"}
	handler := NewServer(store, Options{
		AllowDevAuth: true,
		DevUserID:    "11111111-1111-4111-8111-111111111111",
		Catalog:      store,
	})
	request := httptest.NewRequest(http.MethodPost, "/v1/reading-runs", strings.NewReader(`{"isbn":"978-89-3643-426-7","totalValue":216}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if store.created.Book.Title != "소년이 온다" || store.created.TotalValue != 216 {
		t.Fatalf("unexpected create command: %#v", store.created)
	}
}

func TestDeleteReadingRunChecksOwnershipAndReturnsNoContent(t *testing.T) {
	store := &fakeAccountStore{}
	handler := NewServer(store, Options{AllowDevAuth: true, DevUserID: "11111111-1111-4111-8111-111111111111"})
	const runID = "a1111111-1111-4111-8111-111111111111"
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/v1/reading-runs/"+runID, nil))

	if response.Code != http.StatusNoContent || store.deletedReadingRunID != runID {
		t.Fatalf("status = %d, deleted run = %q, body = %s", response.Code, store.deletedReadingRunID, response.Body.String())
	}
}

func TestDeleteReadingRunReturnsNotFound(t *testing.T) {
	store := &fakeAccountStore{deleteReadingRunErr: ErrNotFound}
	handler := NewServer(store, Options{AllowDevAuth: true, DevUserID: "11111111-1111-4111-8111-111111111111"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/v1/reading-runs/a1111111-1111-4111-8111-111111111111", nil))

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404, body = %s", response.Code, response.Body.String())
	}
}

func TestRestrictedAccountCannotUseRegularAPI(t *testing.T) {
	store := &fakeAccessStore{access: UserAccess{Allowed: false, Code: "account_suspended", Message: "정지됨"}}
	handler := NewServer(store, Options{AllowDevAuth: true, DevUserID: "11111111-1111-4111-8111-111111111111"})
	request := httptest.NewRequest(http.MethodGet, "/v1/reading-runs", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden || !strings.Contains(response.Body.String(), "account_suspended") {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestAdminAPIRequiresKeyAndTracksOperator(t *testing.T) {
	store := &fakeModerationStore{}
	handler := NewServer(store, Options{AdminAPIKey: "test-admin-key"})

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/admin/reports", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodPatch, "/v1/admin/reports/a1111111-1111-4111-8111-111111111111", strings.NewReader(`{"action":"hide","reason":"운영 정책 위반","durationHours":0}`))
	request.Header.Set("X-Admin-Key", "test-admin-key")
	request.Header.Set("X-Admin-ID", "moderator@example.com")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || store.resolved.OperatorID != "moderator@example.com" {
		t.Fatalf("status = %d, operator = %q, body = %s", response.Code, store.resolved.OperatorID, response.Body.String())
	}
}

func TestAccountDeletionQueuesWhenAuthProviderFails(t *testing.T) {
	store := &fakeAccountStore{}
	handler := NewServer(store, Options{
		AllowDevAuth: true, DevUserID: "11111111-1111-4111-8111-111111111111",
		AuthUserDeleter: fakeAuthUserDeleter{err: errors.New("temporary Supabase failure")},
	})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/v1/me", nil))

	if response.Code != http.StatusAccepted || !store.requested || store.deleted || store.completed {
		t.Fatalf("status = %d, requested=%t deleted=%t completed=%t body=%s", response.Code, store.requested, store.deleted, store.completed, response.Body.String())
	}
}
