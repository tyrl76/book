import { SQLiteProvider, type SQLiteDatabase, useSQLiteContext } from 'expo-sqlite';
import type { PropsWithChildren } from 'react';

import { migrateDatabase } from '@/lib/database';

export type AppDatabase = SQLiteDatabase;

export function AppDatabaseProvider({ children }: PropsWithChildren) {
  return (
    <SQLiteProvider databaseName="bookgyeol.db" onInit={migrateDatabase}>
      {children}
    </SQLiteProvider>
  );
}

export function useAppDatabase(): AppDatabase {
  return useSQLiteContext();
}
