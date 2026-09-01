package catalog

import (
	"context"
	"sync"
	"time"
)

const (
	maxPageCountLookups     = 10
	pageCountLookupWorkers  = 5
	pageCountLookupDeadline = 5 * time.Second
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
	result, err := p.SearchPage(ctx, query, 1, limit)
	return result.Items, err
}

func (p *PageCountEnrichedProvider) SearchPage(ctx context.Context, query string, page, limit int) (SearchResult, error) {
	result, err := SearchProviderPage(ctx, p.base, query, page, limit)
	if err != nil || len(result.Items) == 0 {
		return result, err
	}
	for index := range result.Items {
		p.applyCached(&result.Items[index])
	}
	counts, err := p.pages.SearchPageCounts(ctx, query, limit)
	if err != nil {
		return result, nil
	}
	for isbn, pageCount := range counts {
		if pageCount > 0 {
			p.cache.Store(isbn, pageCount)
		}
	}
	for index := range result.Items {
		p.applyCached(&result.Items[index])
	}
	p.enrichMissing(ctx, result.Items)
	return result, nil
}

func (p *PageCountEnrichedProvider) Suggest(ctx context.Context, query string, limit int) ([]string, error) {
	return SuggestProvider(ctx, p.base, query, limit)
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

func (p *PageCountEnrichedProvider) enrichMissing(ctx context.Context, items []Book) {
	isbns := make([]string, 0, maxPageCountLookups)
	seen := make(map[string]struct{}, maxPageCountLookups)
	for _, item := range items {
		if item.PageCount > 0 || item.ISBN == "" {
			continue
		}
		if _, cached := p.cache.Load(item.ISBN); cached {
			continue
		}
		if _, duplicate := seen[item.ISBN]; duplicate {
			continue
		}
		seen[item.ISBN] = struct{}{}
		isbns = append(isbns, item.ISBN)
		if len(isbns) == maxPageCountLookups {
			break
		}
	}
	if len(isbns) == 0 {
		return
	}

	lookupContext, cancel := context.WithTimeout(ctx, pageCountLookupDeadline)
	defer cancel()
	type result struct {
		isbn      string
		pageCount int
	}
	results := make(chan result, len(isbns))
	semaphore := make(chan struct{}, pageCountLookupWorkers)
	var group sync.WaitGroup
	for _, isbn := range isbns {
		group.Add(1)
		go func() {
			defer group.Done()
			select {
			case semaphore <- struct{}{}:
				defer func() { <-semaphore }()
			case <-lookupContext.Done():
				return
			}
			pageCount, err := p.pages.LookupPageCount(lookupContext, isbn)
			if err == nil && pageCount > 0 {
				results <- result{isbn: isbn, pageCount: pageCount}
			}
		}()
	}
	group.Wait()
	close(results)
	for item := range results {
		p.cache.Store(item.isbn, item.pageCount)
	}
	for index := range items {
		p.applyCached(&items[index])
	}
}

var _ Provider = (*PageCountEnrichedProvider)(nil)
var _ PagedProvider = (*PageCountEnrichedProvider)(nil)
var _ SuggestionProvider = (*PageCountEnrichedProvider)(nil)
