import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BookCover } from '@/components/product/book-cover';
import { ProgressBar } from '@/components/product/progress-bar';
import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useFeedback } from '@/features/feedback/feedback-provider';
import { useFeed } from '@/features/feed/hooks';
import { useReadingRuns } from '@/features/reading/hooks';
import { useFeedReaction, useFriends } from '@/features/social/hooks';
import { useTheme } from '@/hooks/use-theme';
import type { FeedEvent } from '@/types/domain';

const milestoneCopy: Record<FeedEvent['type'], string> = {
  started: '새 책을 읽기 시작했어요',
  milestone_25: '첫 고비를 지나 25% 읽었어요',
  milestone_50: '책의 절반을 읽었어요',
  milestone_75: '완독을 향해 75% 읽었어요',
  finished: '책을 끝까지 읽었어요',
  shared_note: '한 줄 감상을 남겼어요',
};

function eventCopy(item: FeedEvent) {
  if (item.normalizedProgress >= 0) return milestoneCopy[item.type];
  if (item.type === 'started') return '새 책을 읽기 시작했어요';
  if (item.type === 'finished') return '책을 끝까지 읽었어요';
  if (item.type === 'shared_note') return '한 줄 감상을 남겼어요';
  return '독서를 이어가고 있어요';
}

type FeedFilter = 'all' | 'friends' | 'finished' | 'notes';

const feedFilters: { value: FeedFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'friends', label: '친구 소식' },
  { value: 'finished', label: '완독' },
  { value: 'notes', label: '감상' },
];

function relativeTime(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

export default function TogetherScreen() {
  const theme = useTheme();
  const feedback = useFeedback();
  const feed = useFeed();
  const friends = useFriends();
  const runs = useReadingRuns();
  const reaction = useFeedReaction();
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const events = useMemo(() => feed.data ?? [], [feed.data]);
  const friendIDs = useMemo(() => new Set((friends.data ?? []).map((friend) => friend.userId)), [friends.data]);
  const filteredEvents = useMemo(() => events.filter((item) => {
    if (feedFilter === 'friends') return friendIDs.has(item.actorId);
    if (feedFilter === 'finished') return item.type === 'finished';
    if (feedFilter === 'notes') return item.type === 'shared_note' || Boolean(item.note);
    return true;
  }), [events, feedFilter, friendIDs]);
  const hasFriends = Boolean(friends.data?.length);
  const hasBooks = Boolean(runs.data?.length);
  const liveFriends = (friends.data ?? []).filter((item) => item.readingNow);
  const refreshing = feed.isRefetching || friends.isRefetching || runs.isRefetching;

  const refresh = () => {
    void Promise.all([feed.refetch(), friends.refetch(), runs.refetch()]);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <View style={styles.brandRow}>
            <View style={[styles.brandDot, { backgroundColor: theme.accent }]} />
            <Text style={[styles.eyebrow, { color: theme.primary }]}>BOOKGYEOL</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>함께 읽는 오늘</Text>
          <Text style={[styles.intro, { color: theme.textSecondary }]}>친구의 속도와 감상을 부담 없이 이어보세요.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="친구 관리 열기"
          onPress={() => router.push('/people')}
          style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <Text style={[styles.avatarText, { color: theme.inverse }]}>결</Text>
        </Pressable>
      </View>

      {feed.syncError ? (
        <FeedbackBanner
          compact
          tone="warning"
          title="저장된 소식을 표시하고 있어요"
          error={feed.syncError}
          actionLabel="다시 연결"
          onAction={() => void feed.refetch()}
        />
      ) : null}
      {feed.isError ? (
        <FeedbackBanner title="독서 근황을 불러오지 못했어요" error={feed.error} onAction={() => void feed.refetch()} />
      ) : null}

      {hasFriends && runs.data && !hasBooks ? (
        <View style={[styles.activationCard, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
          <View style={styles.activationCopy}>
            <Text style={[styles.activationEyebrow, { color: theme.inverse }]}>FRIEND CONNECTED</Text>
            <Text style={[styles.activationTitle, { color: theme.inverse }]}>이제 내 첫 책을 골라볼까요?</Text>
            <Text style={[styles.activationText, { color: theme.inverse }]}>책을 추가하고 기록하면 연결된 친구와 독서 흐름이 자연스럽게 이어져요.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="첫 책 찾기"
            onPress={() => router.push('/book-search')}
            style={[styles.activationButton, { backgroundColor: theme.card }]}>
            <Text style={[styles.activationButtonText, { color: theme.primary }]}>책 찾기</Text>
          </Pressable>
        </View>
      ) : null}

      {liveFriends.length || friends.isFetching || friends.isError ? (
        <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>지금 읽는 친구</Text>
          <Text style={[styles.sectionMeta, { color: theme.textSecondary }]}>{liveFriends.length}명</Text>
        </View>
        {friends.isError ? (
          <FeedbackBanner compact title="친구 상태를 불러오지 못했어요" error={friends.error} onAction={() => void friends.refetch()} />
        ) : friends.isFetching && !friends.data ? (
          <ActivityIndicator color={theme.primary} />
        ) : liveFriends.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendList}>
            {liveFriends.map((item) => {
              const progressLabel = item.normalizedProgress === undefined
                ? '진척도 비공개'
                : `${Math.round(item.normalizedProgress / 100)}%`;
              return (
                <Pressable
                  key={item.userId}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.nickname}님, ${item.currentTitle ?? '독서 중'}, ${progressLabel}, 독서 프로필 열기`}
                  onPress={() => router.push({ pathname: '/friend/[userID]', params: { userID: item.userId } })}
                  style={styles.friend}>
                  <View style={styles.friendCover}>
                    <BookCover title={item.currentTitle ?? '독서 중'} color={theme.primary} small />
                    <View style={[styles.progressBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <Text style={[styles.progressBadgeText, { color: item.normalizedProgress === undefined ? theme.textSecondary : theme.primary }]}>
                        {item.normalizedProgress === undefined ? '비공개' : progressLabel}
                      </Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={[styles.friendName, { color: theme.text }]}>{item.nickname}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <View style={[styles.emptyInline, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.emptyInlineText, { color: theme.textSecondary }]}>지금 책을 펼친 친구는 없어요. 기록은 아래에서 볼 수 있어요.</Text>
          </View>
        )}
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>독서 근황</Text>
          <Text style={[styles.sectionMeta, { color: theme.textSecondary }]}>최근 소식</Text>
        </View>

        {events.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterList}>
            {feedFilters.map((item) => {
              const selected = feedFilter === item.value;
              return (
                <Pressable
                  key={item.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setFeedFilter(item.value)}
                  style={[
                    styles.filterChip,
                    { backgroundColor: selected ? theme.primary : theme.card, borderColor: selected ? theme.primary : theme.border },
                  ]}>
                  <Text style={[styles.filterChipText, { color: selected ? theme.inverse : theme.textSecondary }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.feedList}>
          {filteredEvents.map((item) => (
            <View key={item.id} style={[styles.feedCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <View style={[styles.tinyAvatar, { backgroundColor: theme.primarySoft }]}>
                  <Text style={[styles.tinyAvatarText, { color: theme.primary }]}>{item.actorNickname[0]}</Text>
                </View>
                <View style={styles.cardIdentity}>
                  <Text style={[styles.actor, { color: theme.text }]}>{item.actorNickname}</Text>
                  <Text style={[styles.caption, { color: theme.textSecondary }]}>{relativeTime(item.occurredAt)}</Text>
                </View>
                {item.normalizedProgress >= 0 ? (
                  <View style={[styles.percentPill, { backgroundColor: theme.backgroundElement }]}>
                    <Text style={[styles.percentPillText, { color: theme.primary }]}>{Math.round(item.normalizedProgress / 100)}%</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.bookRow}>
                <BookCover title={item.title} color={item.coverColor} coverUrl={item.coverUrl} small />
                <View style={styles.bookInfo}>
                  <Text style={[styles.eventCopy, { color: theme.text }]}>{eventCopy(item)}</Text>
                  <Text numberOfLines={2} style={[styles.bookTitle, { color: theme.text }]}>{item.title}</Text>
                  <Text style={[styles.caption, { color: theme.textSecondary }]}>{item.author}</Text>
                  {item.normalizedProgress >= 0 ? (
                    <ProgressBar value={item.normalizedProgress / 100} />
                  ) : (
                    <Text style={[styles.hiddenProgress, { color: theme.textSecondary }]}>진척도 비공개</Text>
                  )}
                </View>
              </View>

              {item.note ? (
                <View style={[styles.note, { backgroundColor: theme.backgroundElement, borderLeftColor: theme.accent }]}>
                  <Text style={[styles.noteText, { color: theme.text }]}>“{item.note}”</Text>
                </View>
              ) : null}

              <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                <View style={styles.footerActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: item.reactedByViewer,
                      disabled: reaction.isPending && reaction.variables?.eventID === item.id,
                    }}
                    accessibilityLabel={`${item.actorNickname}님에게 응원 ${item.reactedByViewer ? '취소' : '보내기'}`}
                    disabled={reaction.isPending && reaction.variables?.eventID === item.id}
                    onPress={() => {
                      const input = { eventID: item.id, active: !item.reactedByViewer };
                      reaction.mutate(input, {
                        onError: (error) => feedback.showError('응원을 반영하지 못했어요', error, {
                          label: '다시 시도',
                          onPress: () => reaction.mutate(input),
                        }),
                      });
                    }}
                    style={[styles.footerButton, item.reactedByViewer && { backgroundColor: theme.primarySoft }]}>
                    <Text style={[styles.footerMeta, { color: theme.primary }]}>{item.reactedByViewer ? '♥' : '♡'} 응원 {item.reactionCount}개</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title} 독서 대화 열기`}
                    onPress={() => router.push({ pathname: '/comments/[eventID]', params: { eventID: item.id, title: item.title } })}
                    style={styles.footerButton}>
                    <Text style={[styles.footerMeta, { color: theme.textSecondary }]}>한마디 {item.commentCount ?? 0}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}

          {events.length > 0 && !filteredEvents.length ? (
            <View style={[styles.emptyInline, { backgroundColor: theme.backgroundElement }]}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>이 조건의 소식은 아직 없어요</Text>
              <Text style={[styles.emptyInlineText, { color: theme.textSecondary }]}>다른 항목을 선택하거나 전체 소식을 확인해 보세요.</Text>
              <Pressable accessibilityRole="button" onPress={() => setFeedFilter('all')} style={styles.resetFilterButton}>
                <Text style={[styles.resetFilterText, { color: theme.primary }]}>전체 소식 보기</Text>
              </Pressable>
            </View>
          ) : null}

          {!events.length && !feed.isFetching && !feed.isError ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{hasFriends ? '친구 연결은 완료됐어요' : '아직 새 독서 소식이 없어요'}</Text>
              <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>
                {hasFriends
                  ? hasBooks
                    ? '나나 친구가 공개 기록을 남기면 이곳에 시간순으로 모여요.'
                    : '첫 책을 추가하고 기록하면 친구와 공유할 첫 소식이 만들어져요.'
                  : '친구를 초대하면 서로의 첫 기록부터 이어볼 수 있어요.'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(hasFriends && !hasBooks ? '/book-search' : '/people')}
                style={[styles.emptyButton, { backgroundColor: theme.primary }]}>
                <Text style={[styles.emptyButtonText, { color: theme.inverse }]}>{hasFriends && !hasBooks ? '첫 책 추가하기' : '친구 보기'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {feed.isFetching && feed.data ? (
        <Text style={[styles.refreshing, { color: theme.textSecondary }]}>새 소식을 확인하는 중…</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="이번 주 함께 읽은 리포트 열기"
        onPress={() => router.push('/weekly-report')}
        style={[styles.weeklyLink, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.weeklyCopy}>
          <Text style={[styles.weeklyEyebrow, { color: theme.primary }]}>WEEKLY TOGETHER</Text>
          <Text style={[styles.weeklyTitle, { color: theme.text }]}>이번 주 함께 읽은 순간</Text>
        </View>
        <Text style={[styles.weeklyArrow, { color: theme.primary }]}>›</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  headerCopy: { flex: 1, gap: 5 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandDot: { width: 7, height: 7, borderRadius: 4 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { fontSize: 34, lineHeight: 42, fontWeight: '900', letterSpacing: -1.2 },
  intro: { fontSize: 14, lineHeight: 21 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '900', fontSize: 16 },
  activationCard: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.four, flexDirection: 'row', alignItems: 'center', gap: 14 },
  activationCopy: { flex: 1, gap: 5 },
  activationEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3, opacity: 0.78 },
  activationTitle: { fontSize: 19, lineHeight: 25, fontWeight: '900', letterSpacing: -0.4 },
  activationText: { fontSize: 12, lineHeight: 18, opacity: 0.84 },
  activationButton: { minWidth: 78, minHeight: 46, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 },
  activationButtonText: { fontSize: 13, fontWeight: '900' },
  weeklyLink: { minHeight: 64, borderWidth: 1, borderRadius: Radius.large, paddingHorizontal: Spacing.three, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12 },
  weeklyCopy: { flex: 1 },
  weeklyEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  weeklyTitle: { marginTop: 3, fontSize: 15, fontWeight: '900' },
  weeklyArrow: { fontSize: 29, fontWeight: '500' },
  section: { gap: Spacing.three },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 21, fontWeight: '900', letterSpacing: -0.5 },
  sectionMeta: { fontSize: 12, fontWeight: '700' },
  filterList: { gap: 8, paddingRight: Spacing.four },
  filterChip: { minHeight: 40, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  filterChipText: { fontSize: 12, fontWeight: '900' },
  friendList: { gap: 18, paddingRight: Spacing.four, paddingVertical: 4 },
  friend: { width: 70, alignItems: 'center', gap: 8 },
  friendCover: { position: 'relative' },
  progressBadge: { position: 'absolute', right: -9, bottom: -5, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 6, minHeight: 22, alignItems: 'center', justifyContent: 'center' },
  progressBadgeText: { fontSize: 9, fontWeight: '900' },
  friendName: { width: '100%', textAlign: 'center', fontSize: 13, fontWeight: '800' },
  emptyInline: { borderRadius: Radius.medium, padding: Spacing.three, alignItems: 'center' },
  emptyInlineText: { fontSize: 13 },
  feedList: { gap: Spacing.three },
  feedCard: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, gap: Spacing.three },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  tinyAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tinyAvatarText: { fontSize: 14, fontWeight: '900' },
  cardIdentity: { flex: 1, marginLeft: 10 },
  actor: { fontSize: 15, fontWeight: '900' },
  caption: { fontSize: 12, lineHeight: 17 },
  percentPill: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 7 },
  percentPillText: { fontSize: 11, fontWeight: '900' },
  bookRow: { flexDirection: 'row', gap: Spacing.three },
  bookInfo: { flex: 1, justifyContent: 'center', gap: 5 },
  eventCopy: { fontSize: 14, fontWeight: '700' },
  hiddenProgress: { fontSize: 11, fontWeight: '700' },
  bookTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900', letterSpacing: -0.4 },
  note: { padding: 13, borderRadius: Radius.small, borderLeftWidth: 3 },
  noteText: { fontSize: 14, lineHeight: 21 },
  cardFooter: { borderTopWidth: 1, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerButton: { minHeight: 44, borderRadius: Radius.pill, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  footerMeta: { fontSize: 11, fontWeight: '800' },
  emptyCard: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.five, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '900', textAlign: 'center' },
  emptyCopy: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  resetFilterButton: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  resetFilterText: { fontSize: 12, fontWeight: '900' },
  emptyButton: { marginTop: 8, minHeight: 48, borderRadius: Radius.medium, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  emptyButtonText: { fontSize: 13, fontWeight: '900' },
  refreshing: { textAlign: 'center', fontSize: 12 },
});
