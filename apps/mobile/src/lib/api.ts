import { Platform } from 'react-native';
import { z } from 'zod';

import { clearSession, getCurrentSession } from '@/lib/session-storage';
import type {
  AuthSession,
  Book,
  FeedComment,
  FeedEvent,
  Friend,
  FriendInvite,
  GroupMember,
  NotificationPreferences,
  PendingProgressOperation,
  Profile,
  ProgressEntry,
  ReadingRun,
  ReadingGroup,
  ReadingStats,
  StorageStatus,
  WeeklyReport,
} from '@/types/domain';

const readingRunSchema = z.object({
  id: z.string(),
  isbn: z.string().optional(),
  title: z.string(),
  author: z.string(),
  coverUrl: z.string().optional(),
  coverColor: z.string(),
  status: z.enum(['want_to_read', 'reading', 'paused', 'finished', 'dnf']),
  progressBasis: z.enum(['pages', 'percent', 'audio_seconds']),
  currentValue: z.number(),
  totalValue: z.number(),
  normalizedProgress: z.number(),
  visibility: z.enum(['private', 'friends', 'group', 'public']),
  shareGroupId: z.string().optional(),
  progressPrecision: z.enum(['hidden', 'milestone', 'exact']),
  autoShare: z.boolean(),
  runNumber: z.number().int().positive(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  updatedAt: z.string(),
});

const feedEventSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  actorNickname: z.string(),
  title: z.string(),
  author: z.string(),
  coverUrl: z.string().optional(),
  coverColor: z.string(),
  type: z.enum(['started', 'milestone_25', 'milestone_50', 'milestone_75', 'finished', 'shared_note']),
  normalizedProgress: z.number(),
  note: z.string().optional(),
  reactionCount: z.number(),
  reactedByViewer: z.boolean(),
  commentCount: z.number().int().nonnegative(),
  groupId: z.string().optional(),
  occurredAt: z.string(),
});

const bookSchema = z.object({
  isbn: z.string(),
  title: z.string(),
  author: z.string(),
  publisher: z.string().optional(),
  publishedAt: z.string().optional(),
  description: z.string().optional(),
  coverUrl: z.string().optional(),
  detailUrl: z.string().optional(),
  source: z.string(),
  pageCount: z.number().int().positive().optional(),
});

const friendSchema = z.object({
  userId: z.string(),
  nickname: z.string(),
  avatarUrl: z.string().optional(),
  bio: z.string(),
  currentTitle: z.string().optional(),
  normalizedProgress: z.number().int().optional(),
  readingNow: z.boolean(),
});

const friendInviteSchema = z.object({
  token: z.string(),
  deepLink: z.string(),
  expiresAt: z.string(),
});

const feedCommentSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  authorNickname: z.string(),
  parentId: z.string().optional(),
  normalizedAnchor: z.number().int(),
  revealPolicy: z.enum(['always', 'after_position', 'finished']),
  body: z.string().optional(),
  locked: z.boolean(),
  createdAt: z.string(),
});

const profileSchema = z.object({
  userId: z.string(),
  nickname: z.string(),
  avatarUrl: z.string().optional(),
  bio: z.string(),
  defaultVisibility: z.enum(['private', 'friends', 'public']),
  progressPrecision: z.enum(['hidden', 'milestone', 'exact']),
  friendCount: z.number().int().nonnegative(),
});

const progressEntrySchema = z.object({
  id: z.string(),
  previousValue: z.number(),
  newValue: z.number(),
  normalizedProgress: z.number().int(),
  note: z.string().optional(),
  durationSeconds: z.number().int().nonnegative(),
  correction: z.boolean(),
  recordedAt: z.string(),
});

const dailyReadingSchema = z.object({
  date: z.string(),
  pages: z.number(),
  durationSeconds: z.number().int().nonnegative(),
  entries: z.number().int().nonnegative(),
});

const readingStatsSchema = z.object({
  year: z.number().int(),
  reading: z.number().int().nonnegative(),
  wantToRead: z.number().int().nonnegative(),
  paused: z.number().int().nonnegative(),
  finished: z.number().int().nonnegative(),
  dnf: z.number().int().nonnegative(),
  pagesRead: z.number().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  currentStreakDays: z.number().int().nonnegative(),
  longestStreakDays: z.number().int().nonnegative(),
  annualGoalBooks: z.number().int().nonnegative(),
  annualFinishedBooks: z.number().int().nonnegative(),
  calendar: z.array(dailyReadingSchema),
});

const notificationPreferencesSchema = z.object({
  pushEnabled: z.boolean(),
  friendRequests: z.boolean(),
  comments: z.boolean(),
  milestones: z.boolean(),
  dailyDigest: z.boolean(),
  quietStart: z.string().optional(),
  quietEnd: z.string().optional(),
});

const readingGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['owner', 'member']),
  memberCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});

const groupMemberSchema = z.object({
  userId: z.string(),
  nickname: z.string(),
  role: z.enum(['owner', 'member']),
  currentTitle: z.string().optional(),
  normalizedProgress: z.number().int().optional(),
  readingNow: z.boolean(),
});

const weeklyReportSchema = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  connectedReadingDays: z.number().int().nonnegative(),
  activeFriends: z.number().int().nonnegative(),
  friendUpdates: z.number().int().nonnegative(),
  reactionsSent: z.number().int().nonnegative(),
  reactionsReceived: z.number().int().nonnegative(),
  myDurationSeconds: z.number().int().nonnegative(),
  myFinishedBooks: z.number().int().nonnegative(),
});

const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  nickname: z.string(),
});

const authSessionSchema = z.object({
  token: z.string().min(32),
  expiresAt: z.string(),
  user: authUserSchema,
});

const storageStatusSchema = z.object({
  database: z.string(),
  connected: z.boolean(),
  readingRuns: z.number().int().nonnegative(),
  progressEntries: z.number().int().nonnegative(),
  feedEvents: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  lastSavedAt: z.string(),
  checkedAt: z.string(),
});

const defaultBaseURL = Platform.select({
  android: 'http://10.0.2.2:8080',
  default: 'http://127.0.0.1:8080',
});

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? defaultBaseURL;
export const apiBaseURL = baseURL;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit, authenticated = true): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authenticated) {
    const session = getCurrentSession();
    if (!session?.token) throw new ApiError(401, '로그인이 필요합니다');
    headers.Authorization = `Bearer ${session.token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await fetch(`${baseURL}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...init?.headers,
      },
      signal: init?.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(408, '서버 응답이 늦어 요청을 중단했어요. 다시 시도해 주세요.');
    }
    throw new ApiError(0, '서버에 연결하지 못했어요. 네트워크 상태를 확인해 주세요.');
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error?: { message?: string } }).error?.message ?? '요청에 실패했습니다')
        : '요청에 실패했습니다';
    if (authenticated && response.status === 401) await clearSession().catch(() => undefined);
    throw new ApiError(response.status, message);
  }
  return body;
}

export async function fetchAuthStatus(): Promise<{ registrationOpen: boolean }> {
  return z.object({ registrationOpen: z.boolean() }).parse(await request('/v1/auth/status', undefined, false));
}

export async function registerAccount(input: { email: string; password: string; nickname: string }): Promise<AuthSession> {
  return authSessionSchema.parse(await request('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  }, false));
}

export async function loginAccount(input: { email: string; password: string }): Promise<AuthSession> {
  return authSessionSchema.parse(await request('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  }, false));
}

export async function logoutAccount(): Promise<void> {
  await request('/v1/auth/logout', { method: 'POST' });
}

export async function fetchReadingRuns(): Promise<ReadingRun[]> {
  const body = await request('/v1/reading-runs');
  return z.object({ items: z.array(readingRunSchema) }).parse(body).items;
}

export async function fetchFeed(): Promise<FeedEvent[]> {
  const body = await request('/v1/feed');
  return z.object({ items: z.array(feedEventSchema) }).parse(body).items;
}

export type BookSearchPage = {
  items: Book[];
  page: number;
  limit: number;
  hasNextPage: boolean;
};

export async function suggestBooks(query: string, limit = 6): Promise<string[]> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  const body = await request(`/v1/catalog/book-suggestions?${params.toString()}`);
  return z.object({ items: z.array(z.string().min(1)) }).parse(body).items;
}

export async function searchBooks(query: string, page = 1, limit = 20): Promise<BookSearchPage> {
  const params = new URLSearchParams({ query, page: String(page), limit: String(limit) });
  const body = await request(`/v1/catalog/books?${params.toString()}`);
  return z
    .object({
      items: z.array(bookSchema),
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      hasNextPage: z.boolean(),
    })
    .parse(body);
}

export async function lookupBook(isbn: string): Promise<Book> {
  const body = await request(`/v1/catalog/books/${encodeURIComponent(isbn)}`);
  return bookSchema.parse(body);
}

export async function createReadingRun(input: {
  isbn: string;
  totalValue: number;
  progressBasis: ReadingRun['progressBasis'];
  status: Extract<ReadingRun['status'], 'reading' | 'want_to_read'>;
}): Promise<ReadingRun> {
  const body = await request('/v1/reading-runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return readingRunSchema.parse(body);
}

export async function createManualReadingRun(input: {
  title: string;
  author: string;
  totalValue: number;
  progressBasis: ReadingRun['progressBasis'];
  status: Extract<ReadingRun['status'], 'reading' | 'want_to_read'>;
}): Promise<ReadingRun> {
  const body = await request('/v1/reading-runs/manual', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return readingRunSchema.parse(body);
}

export async function bootstrapUser(nickname?: string): Promise<void> {
  await request('/v1/me/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ nickname: nickname ?? '' }),
  });
}

export async function postProgress(operation: PendingProgressOperation): Promise<void> {
  await request(`/v1/reading-runs/${operation.readingRunId}/progress`, {
    method: 'POST',
    body: JSON.stringify({
      clientOperationId: operation.clientOperationId,
      currentValue: operation.currentValue,
      recordedAt: operation.recordedAt,
      note: operation.note,
      correction: operation.correction,
      durationSeconds: operation.durationSeconds,
    }),
  });
}

export async function fetchFriends(): Promise<Friend[]> {
  const body = await request('/v1/friends');
  return z.object({ items: z.array(friendSchema) }).parse(body).items;
}

export async function createFriendInvite(): Promise<FriendInvite> {
  const body = await request('/v1/friend-invites', { method: 'POST' });
  return friendInviteSchema.parse(body);
}

export async function acceptFriendInvite(token: string): Promise<Friend> {
  const body = await request(`/v1/friend-invites/${encodeURIComponent(token)}/accept`, { method: 'POST' });
  return friendSchema.parse(body);
}

export async function removeFriend(userID: string): Promise<void> {
  await request(`/v1/friends/${encodeURIComponent(userID)}`, { method: 'DELETE' });
}

export async function setUserBlocked(userID: string, active: boolean): Promise<void> {
  await request(`/v1/blocks/${encodeURIComponent(userID)}`, { method: active ? 'POST' : 'DELETE' });
}

export async function setFeedReaction(eventID: string, active: boolean): Promise<void> {
  await request(`/v1/feed-events/${encodeURIComponent(eventID)}/reaction`, { method: active ? 'PUT' : 'DELETE' });
}

export async function fetchFeedComments(eventID: string): Promise<FeedComment[]> {
  const body = await request(`/v1/feed-events/${encodeURIComponent(eventID)}/comments`);
  return z.object({ items: z.array(feedCommentSchema) }).parse(body).items;
}

export async function createFeedComment(
  eventID: string,
  input: { body: string; revealPolicy: FeedComment['revealPolicy']; parentId?: string },
): Promise<FeedComment> {
  const body = await request(`/v1/feed-events/${encodeURIComponent(eventID)}/comments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return feedCommentSchema.parse(body);
}

export async function createReport(input: {
  targetType: 'user' | 'feed_event' | 'comment';
  targetId: string;
  reason: 'spoiler' | 'harassment' | 'spam' | 'privacy' | 'other';
  detail?: string;
}): Promise<void> {
  await request('/v1/reports', { method: 'POST', body: JSON.stringify(input) });
}

export async function fetchProfile(): Promise<Profile> {
  return profileSchema.parse(await request('/v1/me'));
}

export async function fetchStorageStatus(): Promise<StorageStatus> {
  return storageStatusSchema.parse(await request('/v1/me/storage-status'));
}

export async function updateProfile(input: Partial<Pick<Profile, 'nickname' | 'bio' | 'defaultVisibility' | 'progressPrecision'>>): Promise<Profile> {
  return profileSchema.parse(await request('/v1/me', { method: 'PATCH', body: JSON.stringify(input) }));
}

export async function updateReadingRun(
  readingRunID: string,
  input: Partial<Pick<ReadingRun, 'status' | 'visibility' | 'shareGroupId' | 'progressPrecision' | 'autoShare'>>,
): Promise<ReadingRun> {
  return readingRunSchema.parse(await request(`/v1/reading-runs/${encodeURIComponent(readingRunID)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }));
}

export async function deleteReadingRun(readingRunID: string): Promise<void> {
  await request(`/v1/reading-runs/${encodeURIComponent(readingRunID)}`, { method: 'DELETE' });
}

export async function fetchProgressEntries(readingRunID: string): Promise<ProgressEntry[]> {
  const body = await request(`/v1/reading-runs/${encodeURIComponent(readingRunID)}/entries`);
  return z.object({ items: z.array(progressEntrySchema) }).parse(body).items;
}

export async function fetchReadingStats(year = new Date().getFullYear()): Promise<ReadingStats> {
  return readingStatsSchema.parse(await request(`/v1/me/stats?year=${year}`));
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  return notificationPreferencesSchema.parse(await request('/v1/me/notifications'));
}

export async function updateNotificationPreferences(input: NotificationPreferences): Promise<NotificationPreferences> {
  return notificationPreferencesSchema.parse(await request('/v1/me/notifications', {
    method: 'PUT',
    body: JSON.stringify(input),
  }));
}

export async function registerPushToken(platform: 'ios' | 'android' | 'web', token: string): Promise<void> {
  await request('/v1/me/push-tokens', {
    method: 'POST',
    body: JSON.stringify({ platform, token }),
  });
}

export async function disablePushTokens(): Promise<void> {
  await request('/v1/me/push-tokens', { method: 'DELETE' });
}

export async function setAnnualGoal(year: number, targetBooks: number): Promise<void> {
  await request('/v1/me/annual-goal', { method: 'PUT', body: JSON.stringify({ year, targetBooks }) });
}

export async function exportUserData(): Promise<string> {
  return JSON.stringify(await request('/v1/me/export'), null, 2);
}

export async function deleteUserData(): Promise<void> {
  await request('/v1/me', { method: 'DELETE' });
}

export async function fetchGroups(): Promise<ReadingGroup[]> {
  const body = await request('/v1/groups');
  return z.object({ items: z.array(readingGroupSchema) }).parse(body).items;
}

export async function createGroup(name: string): Promise<ReadingGroup> {
  return readingGroupSchema.parse(await request('/v1/groups', { method: 'POST', body: JSON.stringify({ name }) }));
}

export async function fetchGroupMembers(groupID: string): Promise<GroupMember[]> {
  const body = await request(`/v1/groups/${encodeURIComponent(groupID)}/members`);
  return z.object({ items: z.array(groupMemberSchema) }).parse(body).items;
}

export async function createGroupInvite(groupID: string): Promise<FriendInvite> {
  return friendInviteSchema.parse(await request(`/v1/groups/${encodeURIComponent(groupID)}/invites`, { method: 'POST' }));
}

export async function acceptGroupInvite(token: string): Promise<ReadingGroup> {
  return readingGroupSchema.parse(await request(`/v1/group-invites/${encodeURIComponent(token)}/accept`, { method: 'POST' }));
}

export async function leaveGroup(groupID: string): Promise<void> {
  await request(`/v1/groups/${encodeURIComponent(groupID)}/membership`, { method: 'DELETE' });
}

export async function setReadingPresence(readingRunID: string, active: boolean): Promise<void> {
  await request('/v1/me/reading-presence', active
    ? { method: 'PUT', body: JSON.stringify({ readingRunId: readingRunID }) }
    : { method: 'DELETE' });
}

export async function fetchWeeklyReport(): Promise<WeeklyReport> {
  return weeklyReportSchema.parse(await request('/v1/me/weekly-report'));
}
