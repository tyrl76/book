export type ReadingRun = {
  id: string;
  isbn?: string;
  title: string;
  author: string;
  coverUrl?: string;
  coverColor: string;
  status: 'want_to_read' | 'reading' | 'paused' | 'finished' | 'dnf';
  progressBasis: 'pages' | 'percent' | 'audio_seconds';
  currentValue: number;
  totalValue: number;
  normalizedProgress: number;
  visibility: 'private' | 'friends' | 'group' | 'public';
  shareGroupId?: string;
  progressPrecision: 'hidden' | 'milestone' | 'exact';
  autoShare: boolean;
  runNumber: number;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
};

export type Book = {
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  publishedAt?: string;
  description?: string;
  coverUrl?: string;
  detailUrl?: string;
  source: string;
  pageCount?: number;
};

export type FeedEvent = {
  id: string;
  actorId: string;
  actorNickname: string;
  title: string;
  author: string;
  coverUrl?: string;
  coverColor: string;
  type: 'started' | 'milestone_25' | 'milestone_50' | 'milestone_75' | 'finished' | 'shared_note';
  normalizedProgress: number;
  note?: string;
  reactionCount: number;
  reactedByViewer: boolean;
  commentCount: number;
  groupId?: string;
  occurredAt: string;
};

export type Friend = {
  userId: string;
  nickname: string;
  avatarUrl?: string;
  bio: string;
  currentTitle?: string;
  normalizedProgress?: number;
  readingNow: boolean;
};

export type FriendInvite = {
  token: string;
  deepLink: string;
  expiresAt: string;
};

export type FeedComment = {
  id: string;
  authorId: string;
  authorNickname: string;
  parentId?: string;
  normalizedAnchor: number;
  revealPolicy: 'always' | 'after_position' | 'finished';
  body?: string;
  locked: boolean;
  createdAt: string;
};

export type Profile = {
  userId: string;
  nickname: string;
  avatarUrl?: string;
  bio: string;
  defaultVisibility: 'private' | 'friends' | 'public';
  progressPrecision: 'hidden' | 'milestone' | 'exact';
  friendCount: number;
};

export type ProgressEntry = {
  id: string;
  previousValue: number;
  newValue: number;
  normalizedProgress: number;
  note?: string;
  durationSeconds: number;
  correction: boolean;
  recordedAt: string;
};

export type DailyReading = {
  date: string;
  pages: number;
  durationSeconds: number;
  entries: number;
};

export type ReadingStats = {
  year: number;
  reading: number;
  wantToRead: number;
  paused: number;
  finished: number;
  dnf: number;
  pagesRead: number;
  durationSeconds: number;
  currentStreakDays: number;
  longestStreakDays: number;
  annualGoalBooks: number;
  annualFinishedBooks: number;
  calendar: DailyReading[];
};

export type NotificationPreferences = {
  pushEnabled: boolean;
  friendRequests: boolean;
  comments: boolean;
  milestones: boolean;
  dailyDigest: boolean;
  quietStart?: string;
  quietEnd?: string;
};

export type ReadingGroup = {
  id: string;
  name: string;
  role: 'owner' | 'member';
  memberCount: number;
  createdAt: string;
};

export type GroupMember = {
  userId: string;
  nickname: string;
  role: 'owner' | 'member';
  currentTitle?: string;
  normalizedProgress?: number;
  readingNow: boolean;
};

export type WeeklyReport = {
  weekStart: string;
  weekEnd: string;
  connectedReadingDays: number;
  activeFriends: number;
  friendUpdates: number;
  reactionsSent: number;
  reactionsReceived: number;
  myDurationSeconds: number;
  myFinishedBooks: number;
};

export type PendingProgressOperation = {
  clientOperationId: string;
  readingRunId: string;
  currentValue: number;
  recordedAt: string;
  note: string;
  correction: boolean;
  durationSeconds: number;
  attempts: number;
};

export type AuthUser = {
  id: string;
  email: string;
  nickname: string;
};

export type AuthSession = {
  token: string;
  expiresAt: string;
  user: AuthUser;
};

export type StorageStatus = {
  database: string;
  connected: boolean;
  readingRuns: number;
  progressEntries: number;
  feedEvents: number;
  comments: number;
  lastSavedAt: string;
  checkedAt: string;
};
