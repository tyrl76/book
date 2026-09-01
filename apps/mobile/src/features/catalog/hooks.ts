import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createManualReadingRun, createReadingRun, lookupBook, searchBooks } from '@/lib/api';

export function useBookSearch(query: string) {
  const normalized = query.trim();
  return useInfiniteQuery({
    queryKey: ['catalog', 'search', normalized],
    queryFn: ({ pageParam }) => searchBooks(normalized, pageParam, 20),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    enabled: normalized.length >= 1,
  });
}

export function useBookByISBN(isbn: string | null) {
  return useQuery({
    queryKey: ['catalog', 'isbn', isbn],
    queryFn: () => lookupBook(isbn!),
    enabled: Boolean(isbn),
    retry: false,
  });
}

export function useCreateReadingRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createReadingRun,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reading-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
      ]);
    },
  });
}

export function useCreateManualReadingRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createManualReadingRun,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reading-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['reading-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
      ]);
    },
  });
}
