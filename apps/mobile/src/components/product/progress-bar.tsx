import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type ProgressBarProps = {
  value: number;
  accessibilityLabel?: string;
};

export function ProgressBar({ value, accessibilityLabel = '독서 진척률' }: ProgressBarProps) {
  const theme = useTheme();
  const progress = Math.max(0, Math.min(100, value));
  const roundedProgress = Math.round(progress);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: roundedProgress, text: `${roundedProgress}%` }}
      style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.fill,
          { backgroundColor: theme.primary, width: `${progress}%` },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 7, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
});
