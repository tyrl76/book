import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { completeOAuthURL } = useAuth();
  const theme = useTheme();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!params.code) return;
    completeOAuthURL(`bookgyeol://auth/callback?code=${encodeURIComponent(params.code)}`)
      .then(() => router.replace('/'))
      .catch((error) => setErrorMessage(error instanceof Error ? error.message : '로그인을 완료하지 못했습니다'));
  }, [completeOAuthURL, params.code]);

  const message = !params.code
    ? '인증 코드가 없습니다. 로그인 화면에서 다시 시도해 주세요.'
    : errorMessage ?? '로그인을 마무리하고 있어요';

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <ActivityIndicator color={theme.primary} />
      <Text style={[styles.copy, { color: theme.textSecondary }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 },
  copy: { fontSize: 15, textAlign: 'center' },
});
