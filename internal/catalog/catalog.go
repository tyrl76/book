package catalog

import (
	"context"
	"errors"
)

var (
	ErrNotFound    = errors.New("book not found")
	ErrUnavailable = errors.New("catalog provider unavailable")
)

type Book struct {
	ISBN        string `json:"isbn"`
	Title       string `json:"title"`
	Author      string `json:"author"`
	Publisher   string `json:"publisher,omitempty"`
	PublishedAt string `json:"publishedAt,omitempty"`
	Description string `json:"description,omitempty"`
	CoverURL    string `json:"coverUrl,omitempty"`
	DetailURL   string `json:"detailUrl,omitempty"`
	Source      string `json:"source"`
	PageCount   int    `json:"pageCount,omitempty"`
}

type Provider interface {
	Search(context.Context, string, int) ([]Book, error)
	LookupISBN(context.Context, string) (Book, error)
}

type SearchResult struct {
	Items       []Book
	HasNextPage bool
}

type PagedProvider interface {
	SearchPage(context.Context, string, int, int) (SearchResult, error)
}

func SearchProviderPage(ctx context.Context, provider Provider, query string, page, limit int) (SearchResult, error) {
	if paged, ok := provider.(PagedProvider); ok {
		return paged.SearchPage(ctx, query, page, limit)
	}
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
	}
	end := page * limit
	items, err := provider.Search(ctx, query, end+1)
	if err != nil {
		return SearchResult{}, err
	}
	start := (page - 1) * limit
	if start >= len(items) {
		return SearchResult{Items: []Book{}}, nil
	}
	hasNextPage := len(items) > end
	if end > len(items) {
		end = len(items)
	}
	return SearchResult{Items: items[start:end], HasNextPage: hasNextPage}, nil
}

type LayeredProvider struct {
	primary  Provider
	fallback Provider
}

func NewLayeredProvider(primary, fallback Provider) *LayeredProvider {
	return &LayeredProvider{primary: primary, fallback: fallback}
}

func (p *LayeredProvider) Search(ctx context.Context, query string, limit int) ([]Book, error) {
	result, err := p.SearchPage(ctx, query, 1, limit)
	return result.Items, err
}

func (p *LayeredProvider) SearchPage(ctx context.Context, query string, page, limit int) (SearchResult, error) {
	result, err := SearchProviderPage(ctx, p.primary, query, page, limit)
	if err == nil {
		return result, nil
	}
	return SearchProviderPage(ctx, p.fallback, query, page, limit)
}

func (p *LayeredProvider) LookupISBN(ctx context.Context, isbn string) (Book, error) {
	item, err := p.primary.LookupISBN(ctx, isbn)
	if err == nil {
		return item, nil
	}
	return p.fallback.LookupISBN(ctx, isbn)
}
