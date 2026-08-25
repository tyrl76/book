import type { AppDatabase } from '@/lib/database-provider';
import type { FeedEvent, PendingProgressOperation, ReadingRun } from '@/types/domain';

type StoredPendingOperation = PendingProgressOperation & {
  status: 'pending' | 'failed';
  createdAt: string;
  lastError?: string;
};

const memoryFallback = new Map<string, string>();

function storageKey(kind: string, ownerID: string) {
  return `bookgyeol.${kind}.${ownerID}`;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key) ?? memoryFallback.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  try {
    globalThis.localStorage?.setItem(key, serialized);
    if (!globalThis.localStorage) memoryFallback.set(key, serialized);
  } catch {
    memoryFallback.set(key, serialized);
  }
}

export async function migrateDatabase(_db: AppDatabase) {}

export async function saveReadingRuns(_db: AppDatabase, ownerID: string, items: ReadingRun[]) {
  writeJSON(storageKey('reading-runs', ownerID), items);
}

export async function loadReadingRuns(_db: AppDatabase, ownerID: string): Promise<ReadingRun[]> {
  return readJSON(storageKey('reading-runs', ownerID), []);
}

export async function saveFeed(_db: AppDatabase, ownerID: string, items: FeedEvent[]) {
  writeJSON(storageKey('feed', ownerID), items);
}

export async function loadFeed(_db: AppDatabase, ownerID: string): Promise<FeedEvent[]> {
  return readJSON(storageKey('feed', ownerID), []);
}

export async function enqueueProgress(
  _db: AppDatabase,
  ownerID: string,
  operation: PendingProgressOperation,
) {
  const key = storageKey('pending', ownerID);
  const items = readJSON<StoredPendingOperation[]>(key, []);
  if (!items.some((item) => item.clientOperationId === operation.clientOperationId)) {
    items.push({ ...operation, status: 'pending', createdAt: operation.recordedAt });
    writeJSON(key, items);
  }

  const runsKey = storageKey('reading-runs', ownerID);
  const runs = readJSON<ReadingRun[]>(runsKey, []);
  const updatedRuns = runs.map((run) =>
    run.id === operation.readingRunId
      ? {
          ...run,
          currentValue: operation.currentValue,
          normalizedProgress: Math.min(
            10_000,
            Math.round((operation.currentValue / run.totalValue) * 10_000),
          ),
          updatedAt: operation.recordedAt,
        }
      : run,
  );
  writeJSON(runsKey, updatedRuns);
}

export async function loadPendingOperations(
  _db: AppDatabase,
  ownerID: string,
): Promise<PendingProgressOperation[]> {
  return readJSON<StoredPendingOperation[]>(storageKey('pending', ownerID), [])
    .filter((item) => item.status === 'pending')
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map(({ status: _status, createdAt: _createdAt, lastError: _lastError, ...operation }) => operation);
}

export async function pendingOperationCount(_db: AppDatabase, ownerID: string): Promise<number> {
  return readJSON<StoredPendingOperation[]>(storageKey('pending', ownerID), []).filter(
    (item) => item.status === 'pending',
  ).length;
}

export async function failedOperationCount(_db: AppDatabase, ownerID: string): Promise<number> {
  return readJSON<StoredPendingOperation[]>(storageKey('pending', ownerID), []).filter(
    (item) => item.status === 'failed',
  ).length;
}

export async function retryFailedOperations(_db: AppDatabase, ownerID: string) {
  const key = storageKey('pending', ownerID);
  const items = readJSON<StoredPendingOperation[]>(key, []).map((item) =>
    item.status === 'failed' ? { ...item, status: 'pending' as const, lastError: undefined } : item,
  );
  writeJSON(key, items);
}

export async function deletePendingOperation(
  _db: AppDatabase,
  ownerID: string,
  operationID: string,
) {
  const key = storageKey('pending', ownerID);
  const items = readJSON<StoredPendingOperation[]>(key, []).filter(
    (item) => item.clientOperationId !== operationID,
  );
  writeJSON(key, items);
}

export async function markPendingOperationFailed(
  _db: AppDatabase,
  ownerID: string,
  operationID: string,
  message: string,
) {
  const key = storageKey('pending', ownerID);
  const items = readJSON<StoredPendingOperation[]>(key, []).map((item) =>
    item.clientOperationId === operationID
      ? { ...item, status: 'failed' as const, attempts: item.attempts + 1, lastError: message }
      : item,
  );
  writeJSON(key, items);
}

export async function incrementPendingAttempt(
  _db: AppDatabase,
  ownerID: string,
  operationID: string,
) {
  const key = storageKey('pending', ownerID);
  const items = readJSON<StoredPendingOperation[]>(key, []).map((item) =>
    item.clientOperationId === operationID ? { ...item, attempts: item.attempts + 1 } : item,
  );
  writeJSON(key, items);
}
