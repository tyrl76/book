import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';

const providers = [
  { id: 'kakao' as const, label: '카카오로 계속하기', background: '#FEE500', foreground: '#191919' },
  { id: 'google' as const, label: 'Google로 계속하기', background: '#FFFFFF', foreground: '#25231F' },
  { id: 'apple' as const, label: 'Apple로 계속하기', background: '#171717', foreground: '#FFFFFF' },
];

export default function SignInScreen() {
  const auth = useAuth();
  const theme = useTheme();
  const [pending, setPending] = useState<string | null>(null);

  if (!auth.configured || auth.session) return <Redirect href="/" />;

  const signIn = async (provider: (typeof providers)[number]['id']) => {
    setPending(provider);
    try {
      await auth.signIn(provider);
    } catch (error) {
      Alert.alert('로그인하지 못했어요', error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요');
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.brand}>
          <View style={[styles.mark, { backgroundColor: theme.primary }]}>
            <Text style={styles.markText}>책</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>같이 읽으면, 더 오래 읽어요</Text>
          <Text style={[styles.copy, { color: theme.textSecondary }]}>친구의 독서 흐름을 보고 내 진척도도 가볍게 나누는 책결입니다.</Text>
        </View>

        <View style={styles.actions}>
          {providers.map((provider) => (
            <Pressable
              key={provider.id}
              accessibilityRole="button"
              accessibilityLabel={provider.label}
              accessibilityState={{ disabled: pending !== null }}
              disabled={pending !== null}
              onPress={() => signIn(provider.id)}
              style={[
                styles.button,
                { backgroundColor: provider.background, borderColor: theme.border, opacity: pending && pending !== provider.id ? 0.55 : 1 },
              ]}>
              <Text style={[styles.buttonText, { color: provider.foreground }]}>
                {pending === provider.id ? '연결 중…' : provider.label}
              </Text>
            </Pressable>
          ))}
          <Text style={[styles.terms, { color: theme.textSecondary }]}>계속하면 서비스 이용약관과 개인정보 처리방침에 동의하게 됩니다.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 28, paddingBottom: 24, justifyContent: 'space-between' },
  brand: { flex: 1, justifyContent: 'center', gap: 15 },
  mark: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#fff', fontSize: 25, fontWeight: '900' },
  title: { fontSize: 34, lineHeight: 44, fontWeight: '900', letterSpacing: -1.2 },
  copy: { fontSize: 16, lineHeight: 25, maxWidth: 340 },
  actions: { gap: 10 },
  button: { height: 56, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '900' },
  terms: { marginTop: 5, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
