import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { fetchFeed } from '@/lib/api';
import { loadFeed, saveFeed } from '@/lib/database';
import { useAppDatabase } from '@/lib/database-provider';

export function useFeed() {
  const db = useAppDatabase();
  const { userID } = useAuth();
  return useQuery({
    queryKey: ['feed', userID],
    enabled: Boolean(userID),
    queryFn: async () => {
      try {
        const remote = await fetchFeed();
        await saveFeed(db, userID!, remote);
        return remote;
      } catch {
        return loadFeed(db, userID!);
      }
    },
  });
}
