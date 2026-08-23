import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  acceptGroupInvite,
  createGroup,
  createGroupInvite,
  fetchGroupMembers,
  fetchGroups,
  fetchWeeklyReport,
  leaveGroup,
  setReadingPresence,
} from '@/lib/api';

export function useGroups() {
  return useQuery({ queryKey: ['groups'], queryFn: fetchGroups });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createGroup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  });
}

export function useGroupMembers(groupID: string) {
  return useQuery({
    queryKey: ['groups', groupID, 'members'],
    queryFn: () => fetchGroupMembers(groupID),
    enabled: Boolean(groupID),
    refetchInterval: 30_000,
  });
}

export function useCreateGroupInvite(groupID: string) {
  return useMutation({ mutationFn: () => createGroupInvite(groupID) });
}

export function useAcceptGroupInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptGroupInvite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leaveGroup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  });
}

export function useReadingPresence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ readingRunID, active }: { readingRunID: string; active: boolean }) => setReadingPresence(readingRunID, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends'] }),
  });
}

export function useWeeklyReport() {
  return useQuery({ queryKey: ['weekly-report'], queryFn: fetchWeeklyReport });
}
