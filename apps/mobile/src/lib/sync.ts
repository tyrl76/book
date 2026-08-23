import { ApiError, postProgress } from '@/lib/api';
import {
  deletePendingOperation,
  incrementPendingAttempt,
  loadPendingOperations,
  markPendingOperationFailed,
} from '@/lib/database';
import type { AppDatabase } from '@/lib/database-provider';

export type SyncSummary = { synced: number; failed: number; waiting: number };

export async function syncPendingOperations(db: AppDatabase, ownerID: string): Promise<SyncSummary> {
  const operations = await loadPendingOperations(db, ownerID);
  const summary: SyncSummary = { synced: 0, failed: 0, waiting: operations.length };

  for (const operation of operations) {
    try {
      await postProgress(operation);
      await deletePendingOperation(db, ownerID, operation.clientOperationId);
      summary.synced += 1;
      summary.waiting -= 1;
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
        await markPendingOperationFailed(db, ownerID, operation.clientOperationId, error.message);
        summary.failed += 1;
        summary.waiting -= 1;
        continue;
      }
      await incrementPendingAttempt(db, ownerID, operation.clientOperationId);
      break;
    }
  }

  return summary;
}
