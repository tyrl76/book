import type { AuthSession } from '@/types/domain';

const sessionKey = 'bookgyeol.local-auth-session.v1';
let currentSession: AuthSession | null = null;
const listeners = new Set<() => void>();

export function getCurrentSession() {
  return currentSession;
}

export async function restoreSession(): Promise<AuthSession | null> {
  try {
    const raw = globalThis.localStorage?.getItem(sessionKey);
    currentSession = raw ? (JSON.parse(raw) as AuthSession) : null;
    return currentSession;
  } catch {
    globalThis.localStorage?.removeItem(sessionKey);
    return null;
  }
}

export async function persistSession(session: AuthSession) {
  globalThis.localStorage?.setItem(sessionKey, JSON.stringify(session));
  currentSession = session;
}

export async function clearSession() {
  currentSession = null;
  globalThis.localStorage?.removeItem(sessionKey);
  listeners.forEach((listener) => listener());
}

export function onSessionCleared(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
