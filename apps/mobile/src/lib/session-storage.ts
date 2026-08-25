import * as SecureStore from 'expo-secure-store';

import type { AuthSession } from '@/types/domain';

const sessionKey = 'bookgyeol.local-auth-session.v1';
let currentSession: AuthSession | null = null;
const listeners = new Set<() => void>();

export function getCurrentSession() {
  return currentSession;
}

export async function restoreSession(): Promise<AuthSession | null> {
  const raw = await SecureStore.getItemAsync(sessionKey);
  if (!raw) return null;
  try {
    currentSession = JSON.parse(raw) as AuthSession;
    return currentSession;
  } catch {
    await SecureStore.deleteItemAsync(sessionKey);
    return null;
  }
}

export async function persistSession(session: AuthSession) {
  await SecureStore.setItemAsync(sessionKey, JSON.stringify(session), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  currentSession = session;
}

export async function clearSession() {
  currentSession = null;
  try {
    await SecureStore.deleteItemAsync(sessionKey);
  } finally {
    listeners.forEach((listener) => listener());
  }
}

export function onSessionCleared(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
