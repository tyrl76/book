import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppErrorBoundary } from '@/components/ui/app-error-boundary';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { FeedbackProvider } from '@/features/feedback/feedback-provider';
import { AppThemeProvider, useThemeSelection } from '@/features/theme/theme-provider';
import { AppDatabaseProvider } from '@/lib/database-provider';
import { SyncOnResume } from '@/lib/sync-on-resume';
import { PushNotificationObserver } from '@/lib/push-notifications';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <AppErrorBoundary>
      <AppThemeProvider>
        <FeedbackProvider>
          <AppRoot />
        </FeedbackProvider>
      </AppThemeProvider>
    </AppErrorBoundary>
  );
}

function AppRoot() {
  const { resolvedScheme } = useThemeSelection();
  const colors = Colors[resolvedScheme];
  const baseTheme = resolvedScheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      notification: colors.accent,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
      <QueryClientProvider client={queryClient}>
        <AppDatabaseProvider>
          <AuthProvider>
            <AppStack />
          </AuthProvider>
        </AppDatabaseProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function AppStack() {
  const auth = useAuth();
  const { resolvedScheme } = useThemeSelection();
  const colors = Colors[resolvedScheme];

  return (
    <>
      <SyncOnResume />
      <PushNotificationObserver />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Protected guard={!auth.session}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(auth.session)}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="book-search"
                options={{ presentation: 'modal', title: '읽을 책 추가' }}
              />
              <Stack.Screen
                name="scan"
                options={{ presentation: 'modal', title: 'ISBN 바코드 스캔' }}
              />
              <Stack.Screen name="friends" options={{ title: '친구와 그룹' }} />
              <Stack.Screen name="friend/[userID]" options={{ title: '친구 독서 프로필' }} />
              <Stack.Screen name="invite/[token]" options={{ title: '친구 초대' }} />
              <Stack.Screen name="comments/[eventID]" options={{ title: '독서 대화' }} />
              <Stack.Screen name="library" options={{ title: '내 책장' }} />
              <Stack.Screen name="book/[runID]" options={{ title: '책 상세' }} />
              <Stack.Screen name="profile-edit" options={{ title: '프로필 편집' }} />
              <Stack.Screen name="stats" options={{ title: '독서 통계와 목표' }} />
              <Stack.Screen name="privacy" options={{ title: '공개 범위' }} />
              <Stack.Screen name="notifications" options={{ title: '알림 설정' }} />
              <Stack.Screen name="account-data" options={{ title: '데이터와 계정' }} />
              <Stack.Screen name="manual-book" options={{ title: '책 직접 등록' }} />
              <Stack.Screen name="groups" options={{ title: '비공개 독서 그룹' }} />
              <Stack.Screen name="group/[groupID]" options={{ title: '독서 그룹' }} />
              <Stack.Screen name="group-invite/[token]" options={{ title: '그룹 초대' }} />
              <Stack.Screen name="weekly-report" options={{ title: '주간 동행 리포트' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
