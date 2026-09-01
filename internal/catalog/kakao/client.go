package kakao

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/datau/book/internal/catalog"
)

const defaultEndpoint = "https://dapi.kakao.com/v3/search/book"

var nonDigit = regexp.MustCompile(`\D`)

type Client struct {
	apiKey   string
	endpoint string
	http     *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		apiKey:   apiKey,
		endpoint: defaultEndpoint,
		http:     &http.Client{Timeout: 5 * time.Second},
	}
}

func NewClientForTest(apiKey, endpoint string, httpClient *http.Client) *Client {
	return &Client{apiKey: apiKey, endpoint: endpoint, http: httpClient}
}

func (c *Client) Search(ctx context.Context, query string, limit int) ([]catalog.Book, error) {
	result, err := c.SearchPage(ctx, query, 1, limit)
	return result.Items, err
}

func (c *Client) SearchPage(ctx context.Context, query string, page, limit int) (catalog.SearchResult, error) {
	return c.search(ctx, query, "", page, limit)
}

func (c *Client) Suggest(ctx context.Context, query string, limit int) ([]string, error) {
	result, err := c.SearchPage(ctx, query, 1, limit)
	if err != nil {
		return nil, err
	}
	items := make([]string, 0, len(result.Items))
	seen := make(map[string]struct{}, len(result.Items))
	for _, book := range result.Items {
		key := strings.ToLower(book.Title)
		if book.Title == "" {
			continue
		}
		if _, duplicate := seen[key]; duplicate {
			continue
		}
		seen[key] = struct{}{}
		items = append(items, book.Title)
	}
	return items, nil
}

func (c *Client) LookupISBN(ctx context.Context, isbn string) (catalog.Book, error) {
	normalized := normalizeISBN(isbn)
	if len(normalized) == 10 {
		normalized = isbn10To13(normalized)
	}
	result, err := c.search(ctx, normalized, "isbn", 1, 10)
	if err != nil {
		return catalog.Book{}, err
	}
	for _, item := range result.Items {
		if item.ISBN == normalized {
			return item, nil
		}
	}
	return catalog.Book{}, catalog.ErrNotFound
}

func (c *Client) search(ctx context.Context, query, target string, page, limit int) (catalog.SearchResult, error) {
	if c.apiKey == "" {
		return catalog.SearchResult{}, catalog.ErrUnavailable
	}
	if page < 1 {
		page = 1
	}
	if page > 50 {
		page = 50
	}
	if limit < 1 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}

	endpoint, err := url.Parse(c.endpoint)
	if err != nil {
		return catalog.SearchResult{}, fmt.Errorf("parse Kakao endpoint: %w", err)
	}
	parameters := endpoint.Query()
	parameters.Set("query", query)
	parameters.Set("page", fmt.Sprintf("%d", page))
	parameters.Set("size", fmt.Sprintf("%d", limit))
	parameters.Set("sort", "accuracy")
	if target != "" {
		parameters.Set("target", target)
	}
	endpoint.RawQuery = parameters.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return catalog.SearchResult{}, fmt.Errorf("create Kakao request: %w", err)
	}
	request.Header.Set("Authorization", "KakaoAK "+c.apiKey)
	request.Header.Set("Accept", "application/json")

	response, err := c.http.Do(request)
	if err != nil {
		return catalog.SearchResult{}, fmt.Errorf("%w: request Kakao catalog: %v", catalog.ErrUnavailable, err)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return catalog.SearchResult{}, catalog.ErrNotFound
	}
	if response.StatusCode != http.StatusOK {
		return catalog.SearchResult{}, fmt.Errorf("%w: Kakao catalog returned %d", catalog.ErrUnavailable, response.StatusCode)
	}

	var payload struct {
		Meta struct {
			IsEnd bool `json:"is_end"`
		} `json:"meta"`
		Documents []struct {
			Title       string   `json:"title"`
			Contents    string   `json:"contents"`
			URL         string   `json:"url"`
			ISBN        string   `json:"isbn"`
			Datetime    string   `json:"datetime"`
			Authors     []string `json:"authors"`
			Publisher   string   `json:"publisher"`
			Translators []string `json:"translators"`
			Thumbnail   string   `json:"thumbnail"`
		} `json:"documents"`
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 2<<20))
	if err := decoder.Decode(&payload); err != nil {
		return catalog.SearchResult{}, fmt.Errorf("decode Kakao catalog: %w", err)
	}

	items := make([]catalog.Book, 0, len(payload.Documents))
	for _, document := range payload.Documents {
		isbn := isbn13From(document.ISBN)
		if isbn == "" {
			continue
		}
		authors := append([]string{}, document.Authors...)
		for _, translator := range document.Translators {
			authors = append(authors, translator+" 옮김")
		}
		items = append(items, catalog.Book{
			ISBN:        isbn,
			Title:       cleanText(document.Title),
			Author:      strings.Join(authors, ", "),
			Publisher:   cleanText(document.Publisher),
			PublishedAt: document.Datetime,
			Description: cleanText(document.Contents),
			CoverURL:    document.Thumbnail,
			DetailURL:   document.URL,
			Source:      "kakao",
		})
	}
	hasNextPage := page < 50 && len(payload.Documents) >= limit && !payload.Meta.IsEnd
	return catalog.SearchResult{Items: items, HasNextPage: hasNextPage}, nil
}

func isbn13From(raw string) string {
	for _, candidate := range strings.Fields(raw) {
		digits := normalizeISBN(candidate)
		if len(digits) == 13 {
			return digits
		}
	}
	for _, candidate := range strings.Fields(raw) {
		if converted := isbn10To13(candidate); converted != "" {
			return converted
		}
	}
	return ""
}

func normalizeISBN(value string) string { return nonDigit.ReplaceAllString(value, "") }

func isbn10To13(value string) string {
	cleaned := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(value), "-", ""))
	if len(cleaned) != 10 || nonDigit.ReplaceAllString(cleaned[:9], "") != cleaned[:9] {
		return ""
	}
	base := "978" + cleaned[:9]
	sum := 0
	for index, character := range base {
		digit := int(character - '0')
		if index%2 == 0 {
			sum += digit
		} else {
			sum += digit * 3
		}
	}
	return fmt.Sprintf("%s%d", base, (10-sum%10)%10)
}

func cleanText(value string) string {
	value = strings.ReplaceAll(value, "<b>", "")
	value = strings.ReplaceAll(value, "</b>", "")
	return strings.TrimSpace(html.UnescapeString(value))
}

var _ catalog.Provider = (*Client)(nil)
var _ catalog.PagedProvider = (*Client)(nil)
var _ catalog.SuggestionProvider = (*Client)(nil)
