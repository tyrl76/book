import type { Provider, Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';

import { bootstrapUser } from '@/lib/api';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type SocialProvider = Extract<Provider, 'google' | 'apple' | 'kakao'>;

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  userID: string | null;
  signIn: (provider: SocialProvider) => Promise<void>;
  signOut: () => Promise<void>;
  completeOAuthURL: (url: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const devUserID = process.env.EXPO_PUBLIC_DEV_USER_ID ?? '11111111-1111-4111-8111-111111111111';

function oauthCode(url: string) {
  const parsed = Linking.parse(url);
  const code = parsed.queryParams?.code;
  return typeof code === 'string' ? code : null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const exchangeRef = useRef<{ code: string; promise: Promise<void> } | null>(null);

  const completeOAuthURL = useCallback(async (url: string) => {
    if (!isSupabaseConfigured) return;
    const code = oauthCode(url);
    if (!code) throw new Error('로그인 응답에 인증 코드가 없습니다');
    if (exchangeRef.current?.code === code) return exchangeRef.current.promise;

    const promise = getSupabaseClient()
      .auth.exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) throw error;
      });
    exchangeRef.current = { code, promise };
    return promise;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = getSupabaseClient();
    let active = true;
    client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.warn('restore Supabase session', error);
      setSession(data.session);
      setLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || Platform.OS === 'web') return;
    const client = getSupabaseClient();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!session) return;
    const metadata = session.user.user_metadata;
    const nickname = metadata.full_name ?? metadata.name ?? metadata.preferred_username;
    bootstrapUser(typeof nickname === 'string' ? nickname : undefined).catch((error) => {
      console.warn('bootstrap user', error);
    });
  }, [session]);

  const signIn = useCallback(
    async (provider: SocialProvider) => {
      const redirectTo = makeRedirectUri({ scheme: 'bookgyeol', path: 'auth/callback' });
      const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('로그인 주소를 만들지 못했습니다');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success') await completeOAuthURL(result.url);
      if (result.type === 'cancel' || result.type === 'dismiss') {
        throw new Error('로그인이 취소되었습니다');
      }
    },
    [completeOAuthURL],
  );

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      userID: session?.user.id ?? (isSupabaseConfigured ? null : devUserID),
      signIn,
      signOut,
      completeOAuthURL,
    }),
    [completeOAuthURL, loading, session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
