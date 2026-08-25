package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRequestRateLimiterResetsAfterWindow(t *testing.T) {
	now := time.Date(2026, 8, 25, 0, 0, 0, 0, time.UTC)
	limiter := newRequestRateLimiter()
	limiter.now = func() time.Time { return now }

	if allowed, _ := limiter.allow("login:203.0.113.10", 2, time.Minute); !allowed {
		t.Fatal("first attempt was blocked")
	}
	if allowed, _ := limiter.allow("login:203.0.113.10", 2, time.Minute); !allowed {
		t.Fatal("second attempt was blocked")
	}
	if allowed, retryAfter := limiter.allow("login:203.0.113.10", 2, time.Minute); allowed || retryAfter != time.Minute {
		t.Fatalf("third attempt = allowed %t, retry after %s", allowed, retryAfter)
	}

	now = now.Add(time.Minute)
	if allowed, _ := limiter.allow("login:203.0.113.10", 2, time.Minute); !allowed {
		t.Fatal("attempt was not allowed after the window reset")
	}
}

func TestLoginRateLimitUsesForwardedClientAddress(t *testing.T) {
	handler := NewServer(&fakeLocalAuthStore{}, Options{LocalAuthEnabled: true})
	for attempt := 1; attempt <= 11; attempt++ {
		request := httptest.NewRequest(http.MethodPost, "/v1/auth/login", strings.NewReader(`{}`))
		request.Header.Set("X-Forwarded-For", "203.0.113.10")
		request.RemoteAddr = "172.18.0.4:41234"
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if attempt <= 10 && response.Code != http.StatusBadRequest {
			t.Fatalf("attempt %d status = %d, body = %s", attempt, response.Code, response.Body.String())
		}
		if attempt == 11 {
			if response.Code != http.StatusTooManyRequests || response.Header().Get("Retry-After") == "" {
				t.Fatalf("limited status = %d, retry-after = %q, body = %s", response.Code, response.Header().Get("Retry-After"), response.Body.String())
			}
		}
	}

	request := httptest.NewRequest(http.MethodPost, "/v1/auth/login", strings.NewReader(`{}`))
	request.Header.Set("X-Forwarded-For", "203.0.113.11")
	request.RemoteAddr = "172.18.0.4:41234"
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("independent client status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestClientAddressRejectsInvalidForwardedValue(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("X-Forwarded-For", "not-an-ip")
	request.RemoteAddr = "192.0.2.20:54321"
	if address := clientAddress(request); address != "192.0.2.20" {
		t.Fatalf("client address = %q", address)
	}
}
