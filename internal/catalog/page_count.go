package catalog

import (
	"context"
	"sync"
)

type PageCountProvider interface {
	SearchPageCounts(context.Context, string, int) (map[string]int, error)
	LookupPageCount(context.Context, string) (int, error)
}

type PageCountEnrichedProvider struct {
	base  Provider
	pages PageCountProvider
	cache sync.Map
}

func NewPageCountEnrichedProvider(base Provider, pages PageCountProvider) *PageCountEnrichedProvider {
	return &PageCountEnrichedProvider{base: base, pages: pages}
}

func (p *PageCountEnrichedProvider) Search(ctx context.Context, query string, limit int) ([]Book, error) {
	items, err := p.base.Search(ctx, query, limit)
	if err != nil || len(items) == 0 {
		return items, err
	}
	for index := range items {
		p.applyCached(&items[index])
	}
	counts, err := p.pages.SearchPageCounts(ctx, query, limit)
	if err != nil {
		return items, nil
	}
	for isbn, pageCount := range counts {
		if pageCount > 0 {
			p.cache.Store(isbn, pageCount)
		}
	}
	for index := range items {
		p.applyCached(&items[index])
	}
	return items, nil
}

func (p *PageCountEnrichedProvider) LookupISBN(ctx context.Context, isbn string) (Book, error) {
	item, err := p.base.LookupISBN(ctx, isbn)
	if err != nil || item.PageCount > 0 {
		return item, err
	}
	p.applyCached(&item)
	if item.PageCount > 0 {
		return item, nil
	}
	pageCount, lookupErr := p.pages.LookupPageCount(ctx, item.ISBN)
	if lookupErr == nil && pageCount > 0 {
		item.PageCount = pageCount
		p.cache.Store(item.ISBN, pageCount)
	}
	return item, nil
}

func (p *PageCountEnrichedProvider) applyCached(item *Book) {
	if item.PageCount > 0 || item.ISBN == "" {
		return
	}
	if cached, ok := p.cache.Load(item.ISBN); ok {
		item.PageCount, _ = cached.(int)
	}
}

var _ Provider = (*PageCountEnrichedProvider)(nil)
