import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BookCover } from '@/components/product/book-cover';
import { ProgressBar } from '@/components/product/progress-bar';
import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useFeedback } from '@/features/feedback/feedback-provider';
import { useFeed } from '@/features/feed/hooks';
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
  const reaction = useFeedReaction();
  const events = feed.data ?? [];
  const liveFriends = (friends.data ?? []).filter((item) => item.readingNow);

  return (
    <Screen>
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
          onPress={() => router.push('/friends')}
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

      <View style={[styles.summary, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
        <View style={styles.summaryCopy}>
          <View style={styles.summaryTitleRow}>
            <View style={[styles.liveDot, { backgroundColor: theme.accent }]} />
            <Text style={[styles.summaryTitle, { color: theme.text }]}>지금 이어지는 독서</Text>
          </View>
          <Text style={[styles.summaryText, { color: theme.textSecondary }]}>
            {liveFriends.length ? `친구 ${liveFriends.length}명이 지금 책을 펼치고 있어요.` : '친구가 독서를 시작하면 여기에 바로 보여요.'}
          </Text>
        </View>
        <View style={[styles.summaryBadge, { backgroundColor: theme.card }]}>
          <Text style={[styles.summaryBadgeText, { color: theme.primary }]}>{events.length}개 소식</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="이번 주 함께 읽은 리포트 열기"
        onPress={() => router.push('/weekly-report')}
        style={[styles.weeklyLink, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.weeklyCopy}>
          <Text style={[styles.weeklyEyebrow, { color: theme.primary }]}>WEEKLY TOGETHER</Text>
          <Text style={[styles.weeklyTitle, { color: theme.text }]}>이번 주 함께 읽은 순간</Text>
          <Text style={[styles.weeklyMeta, { color: theme.textSecondary }]}>순위 없이 서로 이어진 시간만 돌아봐요.</Text>
        </View>
        <Text style={[styles.weeklyArrow, { color: theme.primary }]}>›</Text>
      </Pressable>

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
            {liveFriends.map((item) => (
              <Pressable
                key={item.userId}
                accessibilityRole="button"
                accessibilityLabel={`${item.nickname}님 독서 프로필 열기`}
                onPress={() => router.push({ pathname: '/friend/[userID]', params: { userID: item.userId } })}
                style={styles.friend}>
                <View style={styles.friendCover}>
                  <BookCover title={item.currentTitle ?? '독서 중'} color={theme.primary} small />
                  <View style={[styles.progressBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.progressBadgeText, { color: theme.primary }]}>
                      {Math.round((item.normalizedProgress ?? 0) / 100)}%
                    </Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={[styles.friendName, { color: theme.text }]}>{item.nickname}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.emptyInline, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.emptyInlineText, { color: theme.textSecondary }]}>지금 책을 펼친 친구는 없어요. 기록은 아래에서 볼 수 있어요.</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>독서 근황</Text>
          <Text style={[styles.sectionMeta, { color: theme.textSecondary }]}>최근 소식</Text>
        </View>

        <View style={styles.feedList}>
          {events.map((item) => (
            <View key={item.id} style={[styles.feedCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <View style={[styles.tinyAvatar, { backgroundColor: theme.primarySoft }]}>
                  <Text style={[styles.tinyAvatarText, { color: theme.primary }]}>{item.actorNickname[0]}</Text>
                </View>
                <View style={styles.cardIdentity}>
                  <Text style={[styles.actor, { color: theme.text }]}>{item.actorNickname}</Text>
                  <Text style={[styles.caption, { color: theme.textSecondary }]}>{relativeTime(item.occurredAt)}</Text>
                </View>
                <View style={[styles.percentPill, { backgroundColor: theme.backgroundElement }]}>
                  <Text style={[styles.percentPillText, { color: theme.primary }]}>{Math.round(item.normalizedProgress / 100)}%</Text>
                </View>
              </View>

              <View style={styles.bookRow}>
                <BookCover title={item.title} color={item.coverColor} small />
                <View style={styles.bookInfo}>
                  <Text style={[styles.eventCopy, { color: theme.text }]}>{milestoneCopy[item.type]}</Text>
                  <Text numberOfLines={2} style={[styles.bookTitle, { color: theme.text }]}>{item.title}</Text>
                  <Text style={[styles.caption, { color: theme.textSecondary }]}>{item.author}</Text>
                  <ProgressBar value={item.normalizedProgress / 100} />
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
                    accessibilityState={{ selected: item.reactedByViewer, disabled: reaction.isPending }}
                    accessibilityLabel={`${item.actorNickname}님에게 응원 ${item.reactedByViewer ? '취소' : '보내기'}`}
                    disabled={reaction.isPending}
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
                <Text style={[styles.footerMeta, { color: theme.textSecondary }]}>친구에게 공개됨</Text>
              </View>
            </View>
          ))}

          {!events.length && !feed.isFetching && !feed.isError ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>아직 새 독서 소식이 없어요</Text>
              <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>친구를 초대하면 서로의 첫 기록부터 이어볼 수 있어요.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/friends')}
                style={[styles.emptyButton, { backgroundColor: theme.primary }]}>
                <Text style={[styles.emptyButtonText, { color: theme.inverse }]}>친구 초대하기</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {feed.isFetching && feed.data ? (
        <Text style={[styles.refreshing, { color: theme.textSecondary }]}>새 소식을 확인하는 중…</Text>
      ) : null}
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
  summary: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryCopy: { flex: 1, gap: 4 },
  summaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  summaryTitle: { fontSize: 15, fontWeight: '900' },
  summaryText: { fontSize: 12, lineHeight: 17 },
  summaryBadge: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 7 },
  summaryBadgeText: { fontSize: 10, fontWeight: '900' },
  weeklyLink: { minHeight: 88, borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: 12 },
  weeklyCopy: { flex: 1 },
  weeklyEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  weeklyTitle: { marginTop: 3, fontSize: 15, fontWeight: '900' },
  weeklyMeta: { marginTop: 4, fontSize: 11 },
  weeklyArrow: { fontSize: 29, fontWeight: '500' },
  section: { gap: Spacing.three },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 21, fontWeight: '900', letterSpacing: -0.5 },
  sectionMeta: { fontSize: 12, fontWeight: '700' },
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
  emptyButton: { marginTop: 8, minHeight: 48, borderRadius: Radius.medium, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  emptyButtonText: { fontSize: 13, fontWeight: '900' },
  refreshing: { textAlign: 'center', fontSize: 12 },
});
