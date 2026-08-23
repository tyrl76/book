package kakao

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSearchMapsKakaoBook(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if got := request.Header.Get("Authorization"); got != "KakaoAK secret" {
			t.Fatalf("Authorization = %q", got)
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"documents":[{"title":"미움받을 용기","contents":"소개","url":"https://example.com/book","isbn":"8996991341 9788996991342","datetime":"2014-11-17T00:00:00.000+09:00","authors":["기시미 이치로","고가 후미타케"],"publisher":"인플루엔셜","translators":["전경아"],"thumbnail":"https://example.com/cover.jpg"}]}`))
	}))
	defer server.Close()

	client := NewClientForTest("secret", server.URL, server.Client())
	items, err := client.Search(context.Background(), "미움받을 용기", 10)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(items) != 1 || items[0].ISBN != "9788996991342" || items[0].Source != "kakao" {
		t.Fatalf("unexpected items: %#v", items)
	}
}

func TestISBN10To13(t *testing.T) {
	if got := isbn10To13("8996991341"); got != "9788996991342" {
		t.Fatalf("isbn10To13 = %q", got)
	}
}
