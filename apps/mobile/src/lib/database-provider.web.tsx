import type { PropsWithChildren } from 'react';

export type AppDatabase = { readonly platform: 'web' };

const webDatabase: AppDatabase = { platform: 'web' };

export function AppDatabaseProvider({ children }: PropsWithChildren) {
  return children;
}

export function useAppDatabase(): AppDatabase {
  return webDatabase;
}
