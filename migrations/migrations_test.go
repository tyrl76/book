package migrations

import "testing"

func TestListReturnsOrderedImmutableMigrations(t *testing.T) {
	items, err := List()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 5 {
		t.Fatalf("migration count = %d, want 5", len(items))
	}
	for index, item := range items {
		if item.Version == "" || item.Name == "" || item.SQL == "" || len(item.Checksum) != 64 {
			t.Fatalf("invalid migration at index %d: %#v", index, item)
		}
		if index > 0 && items[index-1].Version >= item.Version {
			t.Fatalf("migrations are not ordered: %s before %s", items[index-1].Version, item.Version)
		}
	}
}
