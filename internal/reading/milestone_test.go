package reading

import "testing"

func TestNormalize(t *testing.T) {
	tests := []struct {
		name           string
		current, total float64
		want           int
	}{
		{name: "half", current: 150, total: 300, want: 5_000},
		{name: "round", current: 1, total: 3, want: 3_333},
		{name: "clamp", current: 400, total: 300, want: 10_000},
		{name: "missing total", current: 10, total: 0, want: 0},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := Normalize(test.current, test.total); got != test.want {
				t.Fatalf("Normalize(%v, %v) = %d, want %d", test.current, test.total, got, test.want)
			}
		})
	}
}

func TestCrossedMilestoneReturnsHighestOnly(t *testing.T) {
	if got := CrossedMilestone(2_000, 8_000); got != "milestone_75" {
		t.Fatalf("CrossedMilestone() = %q, want milestone_75", got)
	}
	if got := CrossedMilestone(9_000, 10_000); got != "finished" {
		t.Fatalf("CrossedMilestone() = %q, want finished", got)
	}
	if got := CrossedMilestone(5_000, 5_400); got != "" {
		t.Fatalf("CrossedMilestone() = %q, want no event", got)
	}
	if got := CrossedMilestone(10_000, 7_000); got != "" {
		t.Fatalf("CrossedMilestone() on correction = %q, want no event", got)
	}
}
