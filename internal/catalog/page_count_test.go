package catalog

import (
	"context"
	"errors"
	"testing"
)

type pageCountBase struct {
	items  []Book
	lookup Book
}

func (p *pageCountBase) Search(context.Context, string, int) ([]Book, error) {
	return append([]Book(nil), p.items...), nil
}

func (p *pageCountBase) LookupISBN(context.Context, string) (Book, error) {
	return p.lookup, nil
}

type pageCountSource struct {
	counts      map[string]int
	lookup      int
	searchError error
	lookupError error
}

func (p *pageCountSource) SearchPageCounts(context.Context, string, int) (map[string]int, error) {
	return p.counts, p.searchError
}

func (p *pageCountSource) LookupPageCount(context.Context, string) (int, error) {
	return p.lookup, p.lookupError
}

func TestPageCountEnrichedProviderMergesAndCachesCounts(t *testing.T) {
	base := &pageCountBase{
		items:  []Book{{ISBN: "9788936434595", Title: "채식주의자"}},
		lookup: Book{ISBN: "9788936434595", Title: "채식주의자"},
	}
	provider := NewPageCountEnrichedProvider(base, &pageCountSource{counts: map[string]int{"9788936434595": 240}})

	items, err := provider.Search(context.Background(), "한강", 20)
	if err != nil || len(items) != 1 || items[0].PageCount != 240 {
		t.Fatalf("Search() = %#v, %v", items, err)
	}
	item, err := provider.LookupISBN(context.Background(), "9788936434595")
	if err != nil || item.PageCount != 240 {
		t.Fatalf("LookupISBN() = %#v, %v", item, err)
	}
}

func TestPageCountEnrichedProviderKeepsCatalogAvailable(t *testing.T) {
	base := &pageCountBase{
		items:  []Book{{ISBN: "9788936434595", Title: "채식주의자"}},
		lookup: Book{ISBN: "9788936434595", Title: "채식주의자"},
	}
	provider := NewPageCountEnrichedProvider(base, &pageCountSource{
		searchError: errors.New("quota exceeded"),
		lookupError: errors.New("quota exceeded"),
	})

	items, err := provider.Search(context.Background(), "한강", 20)
	if err != nil || len(items) != 1 || items[0].PageCount != 0 {
		t.Fatalf("Search() = %#v, %v", items, err)
	}
	item, err := provider.LookupISBN(context.Background(), "9788936434595")
	if err != nil || item.Title != "채식주의자" || item.PageCount != 0 {
		t.Fatalf("LookupISBN() = %#v, %v", item, err)
	}
}

func TestPageCountEnrichedProviderLooksUpMissingISBN(t *testing.T) {
	base := &pageCountBase{items: []Book{{ISBN: "9788936434595", Title: "채식주의자"}}}
	provider := NewPageCountEnrichedProvider(base, &pageCountSource{counts: map[string]int{}, lookup: 240})

	items, err := provider.Search(context.Background(), "채식주의자", 20)
	if err != nil || len(items) != 1 || items[0].PageCount != 240 {
		t.Fatalf("Search() = %#v, %v", items, err)
	}
}
