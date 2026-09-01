import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { fetchFeed } from '@/lib/api';
import { loadFeed, saveFeed } from '@/lib/database';
import { useAppDatabase } from '@/lib/database-provider';
import { asError } from '@/lib/error-message';

export function useFeed() {
  const db = useAppDatabase();
  const { userID } = useAuth();
  const [syncError, setSyncError] = useState<Error | null>(null);
  const query = useQuery({
    queryKey: ['feed', userID],
    enabled: Boolean(userID),
    queryFn: async () => {
      try {
        const remote = await fetchFeed();
        await saveFeed(db, userID!, remote);
        setSyncError(null);
        return remote;
      } catch (error) {
        const cached = await loadFeed(db, userID!);
        if (!cached.length) throw error;
        setSyncError(asError(error));
        return cached;
      }
    },
  });
  return { ...query, syncError };
}
