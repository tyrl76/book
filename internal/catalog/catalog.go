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

type LayeredProvider struct {
	primary  Provider
	fallback Provider
}

func NewLayeredProvider(primary, fallback Provider) *LayeredProvider {
	return &LayeredProvider{primary: primary, fallback: fallback}
}

func (p *LayeredProvider) Search(ctx context.Context, query string, limit int) ([]Book, error) {
	items, err := p.primary.Search(ctx, query, limit)
	if err == nil {
		return items, nil
	}
	return p.fallback.Search(ctx, query, limit)
}

func (p *LayeredProvider) LookupISBN(ctx context.Context, isbn string) (Book, error) {
	item, err := p.primary.LookupISBN(ctx, isbn)
	if err == nil {
		return item, nil
	}
	return p.fallback.LookupISBN(ctx, isbn)
}
