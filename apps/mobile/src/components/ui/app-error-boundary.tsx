import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

type State = { failed: boolean };

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('unexpected app error', error, info.componentStack);
  }

  private retry = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    const theme = Colors.light;
    return (
      <View accessibilityRole="alert" style={[styles.page, { backgroundColor: theme.background }]}>
        <Text style={[styles.eyebrow, { color: theme.accent }]}>UNEXPECTED ERROR</Text>
        <Text style={[styles.title, { color: theme.text }]}>화면을 열지 못했어요</Text>
        <Text style={[styles.message, { color: theme.textSecondary }]}>화면을 다시 불러옵니다. 작성 중인 내용은 사라질 수 있어요. 같은 문제가 계속되면 잠시 후 다시 시도해 주세요.</Text>
        <Pressable accessibilityRole="button" onPress={this.retry} style={[styles.button, { backgroundColor: theme.primary }]}>
          <Text style={[styles.buttonText, { color: theme.inverse }]}>화면 다시 불러오기</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.five, gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { fontSize: 25, lineHeight: 33, fontWeight: '900', textAlign: 'center' },
  message: { maxWidth: 420, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  button: { marginTop: 10, minHeight: 50, borderRadius: Radius.medium, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '900' },
});
