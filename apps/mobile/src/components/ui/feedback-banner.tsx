import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/error-message';

type Props = {
  title: string;
  message?: string;
  error?: unknown;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'error' | 'warning' | 'info';
  compact?: boolean;
};

export function FeedbackBanner({
  title,
  message,
  error,
  actionLabel = '다시 시도',
  onAction,
  tone = 'error',
  compact = false,
}: Props) {
  const theme = useTheme();
  const accent = tone === 'error' ? theme.accent : tone === 'warning' ? theme.warning : theme.primary;
  const copy = message ?? (error === undefined ? undefined : errorMessage(error));

  return (
    <View
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      accessibilityRole="alert"
      style={[
        styles.banner,
        compact && styles.compact,
        { backgroundColor: theme.card, borderColor: accent },
      ]}>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: accent }]}>{title}</Text>
        {copy ? <Text style={[styles.message, { color: theme.textSecondary }]}>{copy}</Text> : null}
      </View>
      {onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={[styles.action, { backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.actionText, { color: theme.primary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  compact: { paddingVertical: 11, paddingHorizontal: 13 },
  copy: { flex: 1, gap: 3 },
  title: { fontSize: 13, fontWeight: '900', lineHeight: 18 },
  message: { fontSize: 12, lineHeight: 18 },
  action: { minHeight: 40, borderRadius: Radius.small, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 11, fontWeight: '900' },
});
