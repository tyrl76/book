import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  acceptFriendInvite,
  createFeedComment,
  createFriendInvite,
  createReport,
  fetchFeedComments,
  fetchFriends,
  removeFriend,
  setFeedReaction,
  setUserBlocked,
} from '@/lib/api';
import type { FeedComment, FeedEvent } from '@/types/domain';

export function useFriends() {
  return useQuery({ queryKey: ['friends'], queryFn: fetchFriends });
}

export function useCreateFriendInvite() {
  return useMutation({ mutationFn: createFriendInvite });
}

export function useAcceptFriendInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptFriendInvite,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['friends'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
      ]);
    },
  });
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeFriend,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['friends'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
      ]);
    },
  });
}

export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userID, active }: { userID: string; active: boolean }) => setUserBlocked(userID, active),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['friends'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
      ]);
    },
  });
}

export function useFeedReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['feed-reaction'],
    mutationFn: ({ eventID, active }: { eventID: string; active: boolean }) => setFeedReaction(eventID, active),
    onMutate: async ({ eventID, active }) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const snapshots = queryClient.getQueriesData<FeedEvent[]>({ queryKey: ['feed'] });
      queryClient.setQueriesData<FeedEvent[]>({ queryKey: ['feed'] }, (events) => events?.map((event) => {
        if (event.id !== eventID || event.reactedByViewer === active) return event;
        return {
          ...event,
          reactedByViewer: active,
          reactionCount: Math.max(0, event.reactionCount + (active ? 1 : -1)),
        };
      }));
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      for (const [queryKey, events] of context?.snapshots ?? []) {
        queryClient.setQueryData(queryKey, events);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });
}

export function useFeedComments(eventID: string) {
  return useQuery({
    queryKey: ['feed-comments', eventID],
    queryFn: () => fetchFeedComments(eventID),
    enabled: Boolean(eventID),
  });
}

export function useCreateFeedComment(eventID: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; revealPolicy: FeedComment['revealPolicy']; parentId?: string }) =>
      createFeedComment(eventID, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feed-comments', eventID] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
      ]);
    },
  });
}

export function useCreateReport() {
  return useMutation({ mutationFn: createReport });
}
