import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { fetchAuthStatus, loginAccount, logoutAccount, registerAccount } from '@/lib/api';
import {
  clearSession,
  onSessionCleared,
  persistSession,
  restoreSession,
} from '@/lib/session-storage';
import type { AuthSession } from '@/types/domain';
import { errorMessage } from '@/lib/error-message';

type AuthContextValue = {
  loading: boolean;
  session: AuthSession | null;
  userID: string | null;
  registrationOpen: boolean | null;
  statusError: string | null;
  refreshStatus: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  register: (nickname: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatusError(null);
    try {
      const status = await fetchAuthStatus();
      setRegistrationOpen(status.registrationOpen);
    } catch (error) {
      setRegistrationOpen(null);
      setStatusError(errorMessage(error, '서버에 연결하지 못했어요.'));
    }
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = onSessionCleared(() => {
      if (active) {
        queryClient.clear();
        setSession(null);
        void refreshStatus();
      }
    });
    restoreSession()
      .then(async (stored) => {
        if (!active) return;
        if (stored && new Date(stored.expiresAt).getTime() > Date.now()) {
          setSession(stored);
          return;
        }
        if (stored) await clearSession();
        await refreshStatus();
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [queryClient, refreshStatus]);

  const signIn = useCallback(async (email: string, password: string) => {
    const nextSession = await loginAccount({ email: email.trim(), password });
    await persistSession(nextSession);
    queryClient.clear();
    setSession(nextSession);
    setRegistrationOpen(false);
    setStatusError(null);
  }, [queryClient]);

  const register = useCallback(async (nickname: string, email: string, password: string) => {
    const nextSession = await registerAccount({ nickname: nickname.trim(), email: email.trim(), password });
    await persistSession(nextSession);
    queryClient.clear();
    setSession(nextSession);
    setRegistrationOpen(false);
    setStatusError(null);
  }, [queryClient]);

  const signOut = useCallback(async () => {
    try {
      await logoutAccount();
    } catch (error) {
      console.warn('revoke local session', error);
    } finally {
      await clearSession().catch((error) => console.warn('clear local session', error));
      queryClient.clear();
      setSession(null);
      await refreshStatus();
    }
  }, [queryClient, refreshStatus]);

  const value = useMemo(
    () => ({
      loading,
      session,
      userID: session?.user.id ?? null,
      registrationOpen,
      statusError,
      refreshStatus,
      signIn,
      register,
      signOut,
    }),
    [loading, refreshStatus, register, registrationOpen, session, signIn, signOut, statusError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
