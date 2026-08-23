import '@/lib/install-local-storage';

import { createContext, type PropsWithChildren, useCallback, useContext, useSyncExternalStore } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';

export type ThemePreference = 'system' | 'light' | 'dark';
type ResolvedScheme = Exclude<ThemePreference, 'system'>;

type ThemeSelection = {
  preference: ThemePreference;
  resolvedScheme: ResolvedScheme;
  setPreference: (preference: ThemePreference) => void;
};

const STORAGE_KEY = 'bookgyeol.theme';
const listeners = new Set<() => void>();
let cachedPreference: ThemePreference | undefined;

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function getPreferenceSnapshot(): ThemePreference {
  if (cachedPreference) return cachedPreference;

  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    cachedPreference = isThemePreference(stored) ? stored : 'system';
  } catch {
    cachedPreference = 'system';
  }

  return cachedPreference;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function persistPreference(preference: ThemePreference) {
  cachedPreference = preference;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, preference);
  } catch {
    // The selected theme still works for this session if storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

const ThemeSelectionContext = createContext<ThemeSelection | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const preference = useSyncExternalStore<ThemePreference>(
    subscribe,
    getPreferenceSnapshot,
    () => 'system',
  );
  const resolvedScheme: ResolvedScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const setPreference = useCallback((next: ThemePreference) => persistPreference(next), []);

  return (
    <ThemeSelectionContext.Provider value={{ preference, resolvedScheme, setPreference }}>
      {children}
    </ThemeSelectionContext.Provider>
  );
}

export function useThemeSelection() {
  const value = useContext(ThemeSelectionContext);
  if (!value) throw new Error('useThemeSelection must be used inside AppThemeProvider');
  return value;
}
