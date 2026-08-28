import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { useAuth } from '@/features/auth/auth-provider';
import { deleteReadingRun, fetchProgressEntries, fetchReadingRuns, updateReadingRun } from '@/lib/api';
import type { ReadingRun } from '@/types/domain';
import {
  discardReadingRunLocalData,
  enqueueProgress,
  failedOperationCount,
  loadReadingRuns,
  pendingOperationCount,
  retryFailedOperations,
  saveReadingRuns,
} from '@/lib/database';
import { useAppDatabase } from '@/lib/database-provider';
import { syncPendingOperations } from '@/lib/sync';

export function useReadingRuns() {
  const db = useAppDatabase();
  const { userID } = useAuth();
  return useQuery({
    queryKey: ['reading-runs', userID],
    enabled: Boolean(userID),
    queryFn: async () => {
      try {
        const remote = await fetchReadingRuns();
        await saveReadingRuns(db, userID!, remote);
        return remote;
      } catch {
        return loadReadingRuns(db, userID!);
      }
    },
  });
}

export function usePendingCount() {
  const db = useAppDatabase();
  const { userID } = useAuth();
  return useQuery({
    queryKey: ['pending-count', userID],
    enabled: Boolean(userID),
    queryFn: () => pendingOperationCount(db, userID!),
  });
}

export function useFailedCount() {
  const db = useAppDatabase();
  const { userID } = useAuth();
  return useQuery({
    queryKey: ['failed-count', userID],
    enabled: Boolean(userID),
    queryFn: () => failedOperationCount(db, userID!),
  });
}

export function useRetryFailedOperations() {
  const db = useAppDatabase();
  const { userID } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!userID) throw new Error('로그인이 필요합니다');
      await retryFailedOperations(db, userID);
      return syncPendingOperations(db, userID);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reading-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['pending-count'] }),
        queryClient.invalidateQueries({ queryKey: ['failed-count'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
      ]);
    },
  });
}

export function useProgressEntries(readingRunID: string) {
  return useQuery({
    queryKey: ['progress-entries', readingRunID],
    queryFn: () => fetchProgressEntries(readingRunID),
    enabled: Boolean(readingRunID),
  });
}

export function useUpdateReadingRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      readingRunID,
      input,
    }: {
      readingRunID: string;
      input: Partial<Pick<ReadingRun, 'status' | 'visibility' | 'shareGroupId' | 'progressPrecision' | 'autoShare'>>;
    }) => updateReadingRun(readingRunID, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reading-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['reading-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
      ]);
    },
  });
}

export function useDeleteReadingRun() {
  const db = useAppDatabase();
  const { userID } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (readingRunID: string) => {
      if (!userID) throw new Error('로그인이 필요합니다');
      await deleteReadingRun(readingRunID);
      await discardReadingRunLocalData(db, userID, readingRunID).catch((error) => {
        console.warn('discard deleted reading run cache', error);
      });
      return readingRunID;
    },
    onSuccess: async (readingRunID) => {
      queryClient.removeQueries({ queryKey: ['progress-entries', readingRunID] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reading-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['reading-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
        queryClient.invalidateQueries({ queryKey: ['pending-count'] }),
        queryClient.invalidateQueries({ queryKey: ['failed-count'] }),
      ]);
    },
  });
}

export function useRecordProgress() {
  const db = useAppDatabase();
  const { userID } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      readingRunId: string;
      currentValue: number;
      previousValue: number;
      note: string;
      durationSeconds?: number;
    }) => {
      if (!userID) throw new Error('로그인이 필요합니다');
      const recordedAt = new Date().toISOString();
      await enqueueProgress(db, userID, {
        clientOperationId: Crypto.randomUUID(),
        readingRunId: input.readingRunId,
        currentValue: input.currentValue,
        recordedAt,
        note: input.note,
        correction: input.currentValue < input.previousValue,
        durationSeconds: input.durationSeconds ?? 0,
        attempts: 0,
      });
      await queryClient.invalidateQueries({ queryKey: ['reading-runs'] });
      await queryClient.invalidateQueries({ queryKey: ['pending-count'] });
      return syncPendingOperations(db, userID);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reading-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['pending-count'] }),
        queryClient.invalidateQueries({ queryKey: ['failed-count'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
      ]);
    },
  });
}
