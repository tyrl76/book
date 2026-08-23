package reading

import "math"

const MaxNormalizedProgress = 10_000

func Normalize(current, total float64) int {
	if total <= 0 || current <= 0 {
		return 0
	}
	value := int(math.Round(current / total * MaxNormalizedProgress))
	if value > MaxNormalizedProgress {
		return MaxNormalizedProgress
	}
	return value
}

// CrossedMilestone returns only the highest newly crossed milestone. This keeps
// a single correction or large offline update from flooding a friend's feed.
func CrossedMilestone(previous, current int) string {
	thresholds := []struct {
		value int
		name  string
	}{
		{10_000, "finished"},
		{7_500, "milestone_75"},
		{5_000, "milestone_50"},
		{2_500, "milestone_25"},
	}

	for _, threshold := range thresholds {
		if previous < threshold.value && current >= threshold.value {
			return threshold.name
		}
	}
	return ""
}
