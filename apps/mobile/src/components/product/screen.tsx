import type { PropsWithChildren } from 'react';
import {
  RefreshControl,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = PropsWithChildren<{
  contentContainerStyle?: StyleProp<ViewStyle>;
  onEndReached?: () => void;
  endReachedThreshold?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
}>;

export function Screen({
  children,
  contentContainerStyle,
  onEndReached,
  endReachedThreshold = 480,
  refreshing = false,
  onRefresh,
}: ScreenProps) {
  const theme = useTheme();
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!onEndReached) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - endReachedThreshold) {
      onEndReached();
    }
  };
  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={[styles.content, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          onScroll={onEndReached ? handleScroll : undefined}
          scrollEventThrottle={160}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              progressBackgroundColor={theme.card}
              tintColor={theme.primary}
            />
          ) : undefined}>
          {children}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center' },
  safe: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
    gap: 28,
  },
});
