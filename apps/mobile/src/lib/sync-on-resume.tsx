import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/auth-provider';
import { useAppDatabase } from '@/lib/database-provider';
import { syncPendingOperations } from '@/lib/sync';

export function SyncOnResume() {
  const db = useAppDatabase();
  const queryClient = useQueryClient();
  const { userID } = useAuth();

  useEffect(() => {
    const sync = async () => {
      if (!userID) return;
      const summary = await syncPendingOperations(db, userID);
      if (summary.synced > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['reading-runs'] }),
          queryClient.invalidateQueries({ queryKey: ['feed'] }),
          queryClient.invalidateQueries({ queryKey: ['pending-count'] }),
        ]);
      }
    };

    sync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => subscription.remove();
  }, [db, queryClient, userID]);

  return null;
}
