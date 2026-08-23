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

function demoRuns(): ReadingRun[] {
  const now = new Date();
  return [
    {
      id: 'a1111111-1111-4111-8111-111111111111',
      title: '아무튼, 메모',
      author: '정혜윤',
      coverColor: '#B65D48',
      status: 'reading',
      progressBasis: 'pages',
      currentValue: 86,
      totalValue: 272,
      normalizedProgress: 3162,
      visibility: 'friends',
      progressPrecision: 'milestone',
      autoShare: true,
      runNumber: 1,
      startedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: now.toISOString(),
    },
  ];
}

function demoFeed(): FeedEvent[] {
  const now = Date.now();
  return [
    {
      id: 'b2222222-2222-4222-8222-222222222222',
      actorId: '22222222-2222-4222-8222-222222222222',
      actorNickname: '지우',
      title: '불편한 편의점',
      author: '김호연',
      coverColor: '#406B62',
      type: 'milestone_50',
      normalizedProgress: 5000,
      note: '이제야 서로의 마음이 조금 보이는 것 같아.',
      reactionCount: 1,
      reactedByViewer: false,
      commentCount: 0,
      occurredAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'b3333333-3333-4333-8333-333333333333',
      actorId: '33333333-3333-4333-8333-333333333333',
      actorNickname: '현우',
      title: '물고기는 존재하지 않는다',
      author: '룰루 밀러',
      coverColor: '#304D75',
      type: 'milestone_75',
      normalizedProgress: 7500,
      reactionCount: 0,
      reactedByViewer: false,
      commentCount: 0,
      occurredAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

export async function migrateDatabase(_db: AppDatabase) {}

export async function saveReadingRuns(_db: AppDatabase, ownerID: string, items: ReadingRun[]) {
  writeJSON(storageKey('reading-runs', ownerID), items);
}

export async function loadReadingRuns(_db: AppDatabase, ownerID: string): Promise<ReadingRun[]> {
  return readJSON(storageKey('reading-runs', ownerID), demoRuns());
}

export async function saveFeed(_db: AppDatabase, ownerID: string, items: FeedEvent[]) {
  writeJSON(storageKey('feed', ownerID), items);
}

export async function loadFeed(_db: AppDatabase, ownerID: string): Promise<FeedEvent[]> {
  return readJSON(storageKey('feed', ownerID), demoFeed());
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
  const runs = readJSON<ReadingRun[]>(runsKey, demoRuns());
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
