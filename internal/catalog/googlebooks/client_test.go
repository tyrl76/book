package googlebooks

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/datau/book/internal/catalog"
)

func TestSearchPageCounts(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Query().Get("key") != "google-key" || request.URL.Query().Get("q") != "한강" || request.URL.Query().Get("country") != "KR" || request.URL.Query().Get("maxResults") != "40" {
			t.Fatalf("unexpected query: %s", request.URL.RawQuery)
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"items":[{"volumeInfo":{"industryIdentifiers":[{"type":"ISBN_13","identifier":"9788936434595"}],"pageCount":240}},{"volumeInfo":{"industryIdentifiers":[{"type":"ISBN_10","identifier":"8936434128"}],"pageCount":216}}]}`))
	}))
	defer server.Close()

	client := NewClientForTest("google-key", server.URL, server.Client())
	counts, err := client.SearchPageCounts(context.Background(), "한강", 20)
	if err != nil || counts["9788936434595"] != 240 || counts["9788936434120"] != 216 {
		t.Fatalf("SearchPageCounts() = %#v, %v", counts, err)
	}
}

func TestLookupPageCountAndUnavailable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Query().Get("q") != "isbn:9788936434595" || request.URL.Query().Get("maxResults") != "1" {
			t.Fatalf("unexpected query: %s", request.URL.RawQuery)
		}
		_, _ = response.Write([]byte(`{"items":[{"volumeInfo":{"industryIdentifiers":[{"type":"ISBN_13","identifier":"9788936434595"}],"pageCount":240}}]}`))
	}))
	defer server.Close()

	client := NewClientForTest("google-key", server.URL, server.Client())
	pageCount, err := client.LookupPageCount(context.Background(), "978-89-364-3459-5")
	if err != nil || pageCount != 240 {
		t.Fatalf("LookupPageCount() = %d, %v", pageCount, err)
	}
	if _, err := NewClient("").LookupPageCount(context.Background(), "9788936434595"); !errors.Is(err, catalog.ErrUnavailable) {
		t.Fatalf("empty key error = %v", err)
	}
}

func TestLookupPageCountUsesExactQueryResultWithoutISBNIdentifier(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Query().Get("q") != "isbn:9788936434595" {
			t.Fatalf("unexpected query: %s", request.URL.RawQuery)
		}
		_, _ = response.Write([]byte(`{"items":[{"volumeInfo":{"industryIdentifiers":[{"type":"OTHER","identifier":"OCLC:1083191738"}],"pageCount":240}}]}`))
	}))
	defer server.Close()

	client := NewClientForTest("google-key", server.URL, server.Client())
	pageCount, err := client.LookupPageCount(context.Background(), "9788936434595")
	if err != nil || pageCount != 240 {
		t.Fatalf("LookupPageCount() = %d, %v", pageCount, err)
	}
}
