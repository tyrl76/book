package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/datau/book/internal/catalog"
)

type pagedCatalogStub struct {
	page  int
	limit int
}

func (p *pagedCatalogStub) Search(context.Context, string, int) ([]catalog.Book, error) {
	return nil, nil
}

func (p *pagedCatalogStub) SearchPage(_ context.Context, _ string, page, limit int) (catalog.SearchResult, error) {
	p.page = page
	p.limit = limit
	return catalog.SearchResult{
		Items:       []catalog.Book{{ISBN: "9788936434595", Title: "눈"}},
		HasNextPage: true,
	}, nil
}

func (p *pagedCatalogStub) LookupISBN(context.Context, string) (catalog.Book, error) {
	return catalog.Book{}, catalog.ErrNotFound
}

func TestSearchCatalogBooksReturnsPaginationMetadata(t *testing.T) {
	provider := &pagedCatalogStub{}
	server := &Server{catalog: provider}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/v1/catalog/books?query=눈&page=2&limit=20", nil)

	server.searchCatalogBooks(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	var payload struct {
		Items       []catalog.Book `json:"items"`
		Page        int            `json:"page"`
		Limit       int            `json:"limit"`
		HasNextPage bool           `json:"hasNextPage"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if provider.page != 2 || provider.limit != 20 || payload.Page != 2 || payload.Limit != 20 || !payload.HasNextPage || len(payload.Items) != 1 {
		t.Fatalf("unexpected pagination: provider=%d/%d payload=%+v", provider.page, provider.limit, payload)
	}
}

func TestSearchCatalogBooksRejectsInvalidPage(t *testing.T) {
	server := &Server{catalog: &pagedCatalogStub{}}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/v1/catalog/books?query=눈&page=51", nil)

	server.searchCatalogBooks(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestSuggestBooksReturnsTitlesOnly(t *testing.T) {
	server := &Server{catalog: &pagedCatalogStub{}}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/v1/catalog/book-suggestions?query=눈&limit=6", nil)

	server.suggestBooks(response, request, "user-id")

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	var payload struct {
		Items []string `json:"items"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.Items) != 1 || payload.Items[0] != "눈" {
		t.Fatalf("unexpected suggestions: %#v", payload.Items)
	}
}
