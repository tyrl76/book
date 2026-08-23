import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import type { FeedEvent, PendingProgressOperation, ReadingRun } from '@/types/domain';

const databaseVersion = 3;
const devUserID = '11111111-1111-4111-8111-111111111111';

async function withWriteTransaction(
  db: SQLiteDatabase,
  task: (transaction: SQLiteDatabase) => Promise<void>,
) {
  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => task(db));
    return;
  }
  await db.withExclusiveTransactionAsync(task);
}

const demoRuns: ReadingRun[] = [
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
    startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const demoFeed: FeedEvent[] = [
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
    occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
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
    occurredAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

export async function migrateDatabase(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion < 1) {
    await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS reading_runs_cache (
      id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_id, id)
    );
    CREATE TABLE IF NOT EXISTS feed_cache (
      id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      PRIMARY KEY (owner_id, id)
    );
    CREATE TABLE IF NOT EXISTS pending_operations (
      client_operation_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      reading_run_id TEXT NOT NULL,
      current_value REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (owner_id, client_operation_id)
    );
    CREATE INDEX IF NOT EXISTS pending_operations_created_idx
      ON pending_operations(status, created_at);
  `);
  } else if (currentVersion < 2) {
    await db.execAsync(`
      ALTER TABLE reading_runs_cache RENAME TO reading_runs_cache_v1;
      CREATE TABLE reading_runs_cache (
        id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, id)
      );
      INSERT INTO reading_runs_cache (id, owner_id, payload, updated_at)
        SELECT id, '${devUserID}', payload, updated_at FROM reading_runs_cache_v1;
      DROP TABLE reading_runs_cache_v1;

      ALTER TABLE feed_cache RENAME TO feed_cache_v1;
      CREATE TABLE feed_cache (
        id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, id)
      );
      INSERT INTO feed_cache (id, owner_id, payload, occurred_at)
        SELECT id, '${devUserID}', payload, occurred_at FROM feed_cache_v1;
      DROP TABLE feed_cache_v1;

      ALTER TABLE pending_operations RENAME TO pending_operations_v1;
      CREATE TABLE pending_operations (
        client_operation_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        reading_run_id TEXT NOT NULL,
        current_value REAL NOT NULL,
        recorded_at TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, client_operation_id)
      );
      INSERT INTO pending_operations (
        client_operation_id, owner_id, reading_run_id, current_value, recorded_at,
        note, status, attempts, last_error, created_at
      ) SELECT client_operation_id, '${devUserID}', reading_run_id, current_value, recorded_at,
               note, status, attempts, last_error, created_at
          FROM pending_operations_v1;
      DROP TABLE pending_operations_v1;
    `);
  }

  if (currentVersion < 3) {
    await db.execAsync(`
      ALTER TABLE pending_operations ADD COLUMN correction INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE pending_operations ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 0;
    `);
  }

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS reading_runs_cache_owner_idx ON reading_runs_cache(owner_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS feed_cache_owner_idx ON feed_cache(owner_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS pending_operations_owner_idx ON pending_operations(owner_id, status, created_at);
  `);

  const runCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM reading_runs_cache WHERE owner_id = ?',
    devUserID,
  );
  if ((runCount?.count ?? 0) === 0) await saveReadingRuns(db, devUserID, demoRuns);

  const feedCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM feed_cache WHERE owner_id = ?',
    devUserID,
  );
  if ((feedCount?.count ?? 0) === 0) await saveFeed(db, devUserID, demoFeed);

  await db.execAsync(`PRAGMA user_version = ${databaseVersion}`);
}

export async function saveReadingRuns(db: SQLiteDatabase, ownerID: string, items: ReadingRun[]) {
  await withWriteTransaction(db, async (transaction) => {
    await transaction.runAsync('DELETE FROM reading_runs_cache WHERE owner_id = ?', ownerID);
    for (const item of items) {
      await transaction.runAsync(
        'INSERT INTO reading_runs_cache (id, owner_id, payload, updated_at) VALUES (?, ?, ?, ?)',
        item.id,
        ownerID,
        JSON.stringify(item),
        item.updatedAt,
      );
    }
  });
}

export async function loadReadingRuns(db: SQLiteDatabase, ownerID: string): Promise<ReadingRun[]> {
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM reading_runs_cache WHERE owner_id = ? ORDER BY updated_at DESC',
    ownerID,
  );
  return rows.map((row) => JSON.parse(row.payload) as ReadingRun);
}

export async function saveFeed(db: SQLiteDatabase, ownerID: string, items: FeedEvent[]) {
  await withWriteTransaction(db, async (transaction) => {
    await transaction.runAsync('DELETE FROM feed_cache WHERE owner_id = ?', ownerID);
    for (const item of items) {
      await transaction.runAsync(
        'INSERT INTO feed_cache (id, owner_id, payload, occurred_at) VALUES (?, ?, ?, ?)',
        item.id,
        ownerID,
        JSON.stringify(item),
        item.occurredAt,
      );
    }
  });
}

export async function loadFeed(db: SQLiteDatabase, ownerID: string): Promise<FeedEvent[]> {
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM feed_cache WHERE owner_id = ? ORDER BY occurred_at DESC',
    ownerID,
  );
  return rows.map((row) => JSON.parse(row.payload) as FeedEvent);
}

export async function enqueueProgress(db: SQLiteDatabase, ownerID: string, operation: PendingProgressOperation) {
  await withWriteTransaction(db, async (transaction) => {
    await transaction.runAsync(
      `INSERT OR IGNORE INTO pending_operations
       (client_operation_id, owner_id, reading_run_id, current_value, recorded_at, note, correction, duration_seconds, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      operation.clientOperationId,
      ownerID,
      operation.readingRunId,
      operation.currentValue,
      operation.recordedAt,
      operation.note,
      operation.correction ? 1 : 0,
      operation.durationSeconds,
      operation.recordedAt,
    );

    const row = await transaction.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM reading_runs_cache WHERE id = ? AND owner_id = ?',
      operation.readingRunId,
      ownerID,
    );
    if (row) {
      const run = JSON.parse(row.payload) as ReadingRun;
      const updated: ReadingRun = {
        ...run,
        currentValue: operation.currentValue,
        normalizedProgress: Math.min(
          10_000,
          Math.round((operation.currentValue / run.totalValue) * 10_000),
        ),
        updatedAt: operation.recordedAt,
      };
      await transaction.runAsync(
        'UPDATE reading_runs_cache SET payload = ?, updated_at = ? WHERE id = ? AND owner_id = ?',
        JSON.stringify(updated),
        updated.updatedAt,
        updated.id,
        ownerID,
      );
    }
  });
}

export async function loadPendingOperations(db: SQLiteDatabase, ownerID: string): Promise<PendingProgressOperation[]> {
  const rows = await db.getAllAsync<{
    client_operation_id: string;
    reading_run_id: string;
    current_value: number;
    recorded_at: string;
    note: string;
    correction: number;
    duration_seconds: number;
    attempts: number;
  }>(
    `SELECT client_operation_id, reading_run_id, current_value, recorded_at, note, correction, duration_seconds, attempts
     FROM pending_operations WHERE owner_id = ? AND status = 'pending' ORDER BY created_at`,
    ownerID,
  );
  return rows.map((row) => ({
    clientOperationId: row.client_operation_id,
    readingRunId: row.reading_run_id,
    currentValue: row.current_value,
    recordedAt: row.recorded_at,
    note: row.note,
    correction: row.correction === 1,
    durationSeconds: row.duration_seconds,
    attempts: row.attempts,
  }));
}

export async function pendingOperationCount(db: SQLiteDatabase, ownerID: string): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM pending_operations WHERE owner_id = ? AND status = 'pending'`,
    ownerID,
  );
  return row?.count ?? 0;
}

export async function failedOperationCount(db: SQLiteDatabase, ownerID: string): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM pending_operations WHERE owner_id = ? AND status = 'failed'`,
    ownerID,
  );
  return row?.count ?? 0;
}

export async function retryFailedOperations(db: SQLiteDatabase, ownerID: string) {
  await db.runAsync(
    `UPDATE pending_operations SET status = 'pending', last_error = NULL
     WHERE owner_id = ? AND status = 'failed'`,
    ownerID,
  );
}

export async function deletePendingOperation(db: SQLiteDatabase, ownerID: string, operationID: string) {
  await db.runAsync('DELETE FROM pending_operations WHERE client_operation_id = ? AND owner_id = ?', operationID, ownerID);
}

export async function markPendingOperationFailed(
  db: SQLiteDatabase,
  ownerID: string,
  operationID: string,
  message: string,
) {
  await db.runAsync(
    `UPDATE pending_operations
     SET status = 'failed', attempts = attempts + 1, last_error = ?
     WHERE client_operation_id = ? AND owner_id = ?`,
    message,
    operationID,
    ownerID,
  );
}

export async function incrementPendingAttempt(db: SQLiteDatabase, ownerID: string, operationID: string) {
  await db.runAsync(
    'UPDATE pending_operations SET attempts = attempts + 1 WHERE client_operation_id = ? AND owner_id = ?',
    operationID,
    ownerID,
  );
}
