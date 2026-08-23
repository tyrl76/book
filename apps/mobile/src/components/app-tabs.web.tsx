import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, View, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>함께</TabButton>
          </TabTrigger>
          <TabTrigger name="record" href="/record" asChild>
            <TabButton>기록</TabButton>
          </TabTrigger>
          <TabTrigger name="me" href="/me" asChild>
            <TabButton>나</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const label = String(children);
  const icon = label === '함께' ? '◉' : label === '기록' ? '▤' : '●';

  return (
    <Pressable
      {...props}
      style={({ pressed }) => [styles.tabPressable, pressed && styles.pressed]}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        <ThemedText style={styles.tabIcon} themeColor={isFocused ? 'primary' : 'textSecondary'}>
          {icon}
        </ThemedText>
        <ThemedText type="smallBold" themeColor={isFocused ? 'primary' : 'textSecondary'}>
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const colors = useTheme();

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView
        type="card"
        style={[styles.innerContainer, { borderColor: colors.border }]}>
        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 14,
    width: '100%',
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    width: '100%',
    maxWidth: 360,
    minHeight: 68,
    padding: 6,
    borderRadius: Radius.xlarge,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    boxShadow: '0 12px 34px rgba(37, 35, 31, 0.16)',
    elevation: 10,
  },
  tabPressable: { flex: 1 },
  pressed: {
    opacity: 0.68,
  },
  tabButtonView: {
    minHeight: 54,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  tabIcon: { fontSize: 13, lineHeight: 17, fontWeight: '900' },
});
