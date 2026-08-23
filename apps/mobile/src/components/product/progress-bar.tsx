import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function ProgressBar({ value }: { value: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
      <View
        style={[
          styles.fill,
          { backgroundColor: theme.primary, width: `${Math.max(0, Math.min(100, value))}%` },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 7, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
});
