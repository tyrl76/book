package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdminClientDeletesUserWithServerCredentials(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodDelete || request.URL.Path != "/auth/v1/admin/users/11111111-1111-4111-8111-111111111111" {
			t.Fatalf("unexpected request: %s %s", request.Method, request.URL.Path)
		}
		if request.Header.Get("Authorization") != "Bearer server-secret" || request.Header.Get("apikey") != "server-secret" {
			t.Fatal("server credentials were not attached")
		}
		response.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	client := NewAdminClient(server.URL, "server-secret")
	if err := client.DeleteUser(context.Background(), "11111111-1111-4111-8111-111111111111"); err != nil {
		t.Fatalf("DeleteUser: %v", err)
	}
}

func TestAdminClientTreatsAlreadyDeletedUserAsSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	if err := NewAdminClient(server.URL, "server-secret").DeleteUser(context.Background(), "missing"); err != nil {
		t.Fatalf("DeleteUser: %v", err)
	}
}
