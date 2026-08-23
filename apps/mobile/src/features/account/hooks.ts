import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteUserData,
  exportUserData,
  fetchNotificationPreferences,
  fetchProfile,
  fetchReadingStats,
  setAnnualGoal,
  updateNotificationPreferences,
  updateProfile,
} from '@/lib/api';

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: fetchProfile });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (profile) => queryClient.setQueryData(['profile'], profile),
  });
}

export function useReadingStats(year = new Date().getFullYear()) {
  return useQuery({ queryKey: ['reading-stats', year], queryFn: () => fetchReadingStats(year) });
}

export function useAnnualGoal(year = new Date().getFullYear()) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetBooks: number) => setAnnualGoal(year, targetBooks),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reading-stats', year] }),
  });
}

export function useNotificationPreferences() {
  return useQuery({ queryKey: ['notification-preferences'], queryFn: fetchNotificationPreferences });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: (preferences) => queryClient.setQueryData(['notification-preferences'], preferences),
  });
}

export function useExportUserData() {
  return useMutation({ mutationFn: exportUserData });
}

export function useDeleteUserData() {
  return useMutation({ mutationFn: deleteUserData });
}
