package googlebooks

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/datau/book/internal/catalog"
)

const defaultEndpoint = "https://www.googleapis.com/books/v1/volumes"

var nonDigit = regexp.MustCompile(`\D`)

type Client struct {
	apiKey   string
	endpoint string
	http     *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		apiKey:   strings.TrimSpace(apiKey),
		endpoint: defaultEndpoint,
		http:     &http.Client{Timeout: 4 * time.Second},
	}
}

func NewClientForTest(apiKey, endpoint string, httpClient *http.Client) *Client {
	return &Client{apiKey: apiKey, endpoint: endpoint, http: httpClient}
}

func (c *Client) SearchPageCounts(ctx context.Context, query string, _ int) (map[string]int, error) {
	return c.search(ctx, strings.TrimSpace(query), 40)
}

func (c *Client) LookupPageCount(ctx context.Context, isbn string) (int, error) {
	normalized := normalizeISBN(isbn)
	counts, err := c.search(ctx, "isbn:"+normalized, 1)
	if err != nil {
		return 0, err
	}
	if pageCount := counts[normalized]; pageCount > 0 {
		return pageCount, nil
	}
	return 0, catalog.ErrNotFound
}

func (c *Client) search(ctx context.Context, query string, maxResults int) (map[string]int, error) {
	if c.apiKey == "" {
		return nil, catalog.ErrUnavailable
	}
	endpoint, err := url.Parse(c.endpoint)
	if err != nil {
		return nil, fmt.Errorf("parse Google Books endpoint: %w", err)
	}
	parameters := endpoint.Query()
	parameters.Set("q", query)
	parameters.Set("key", c.apiKey)
	parameters.Set("country", "KR")
	parameters.Set("printType", "books")
	parameters.Set("maxResults", strconv.Itoa(maxResults))
	parameters.Set("fields", "items(volumeInfo(industryIdentifiers,pageCount))")
	endpoint.RawQuery = parameters.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create Google Books request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	response, err := c.http.Do(request)
	if err != nil {
		return nil, fmt.Errorf("%w: request Google Books: %v", catalog.ErrUnavailable, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: Google Books returned %d", catalog.ErrUnavailable, response.StatusCode)
	}

	var payload struct {
		Items []struct {
			VolumeInfo struct {
				IndustryIdentifiers []struct {
					Type       string `json:"type"`
					Identifier string `json:"identifier"`
				} `json:"industryIdentifiers"`
				PageCount int `json:"pageCount"`
			} `json:"volumeInfo"`
		} `json:"items"`
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 2<<20))
	if err := decoder.Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode Google Books: %w", err)
	}
	counts := make(map[string]int, len(payload.Items))
	for _, item := range payload.Items {
		if item.VolumeInfo.PageCount < 1 || item.VolumeInfo.PageCount > 100_000 {
			continue
		}
		for _, identifier := range item.VolumeInfo.IndustryIdentifiers {
			isbn := isbn13(identifier.Type, identifier.Identifier)
			if isbn != "" {
				counts[isbn] = item.VolumeInfo.PageCount
			}
		}
	}
	return counts, nil
}

func isbn13(identifierType, value string) string {
	cleaned := normalizeISBN(value)
	if identifierType == "ISBN_13" && len(cleaned) == 13 {
		return cleaned
	}
	if identifierType == "ISBN_10" && len(cleaned) == 10 {
		return isbn10To13(cleaned)
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

var _ catalog.PageCountProvider = (*Client)(nil)
