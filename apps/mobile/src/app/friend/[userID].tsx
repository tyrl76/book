import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { BookCover } from '@/components/product/book-cover';
import { ProgressBar } from '@/components/product/progress-bar';
import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useFeedback } from '@/features/feedback/feedback-provider';
import { useFeed } from '@/features/feed/hooks';
import { useReadingRuns } from '@/features/reading/hooks';
import { useBlockUser, useFeedReaction, useFriends, useRemoveFriend } from '@/features/social/hooks';
import { useTheme } from '@/hooks/use-theme';
import type { FeedEvent } from '@/types/domain';

const activityCopy: Record<FeedEvent['type'], string> = {
  started: '읽기 시작',
  milestone_25: '25% 도착',
  milestone_50: '절반 도착',
  milestone_75: '75% 도착',
  finished: '완독',
  shared_note: '감상 공유',
};

function activityDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(value));
}

export default function FriendDetailScreen() {
  const { userID = '' } = useLocalSearchParams<{ userID: string }>();
  const theme = useTheme();
  const feedback = useFeedback();
  const friends = useFriends();
  const feed = useFeed();
  const runs = useReadingRuns();
  const reaction = useFeedReaction();
  const remove = useRemoveFriend();
  const block = useBlockUser();
  const friend = friends.data?.find((item) => item.userId === userID);
  const activities = (feed.data ?? []).filter((item) => item.actorId === userID);
  const sharedBookCount = new Set(activities.map((item) => `${item.title}\u0000${item.author}`)).size;
  const finishedCount = activities.filter((item) => item.type === 'finished').length;
  const reactionCount = activities.reduce((sum, item) => sum + item.reactionCount, 0);
  const sharedCurrentRun = friend?.currentTitle
    ? (runs.data ?? []).find((item) => item.title.trim().toLocaleLowerCase() === friend.currentTitle?.trim().toLocaleLowerCase())
    : undefined;

  const confirmRelationship = (action: 'remove' | 'block') => {
    if (!friend) return;
    Alert.alert(
      action === 'block' ? `${friend.nickname}님을 차단할까요?` : `${friend.nickname}님과의 연결을 끊을까요?`,
      action === 'block' ? '서로의 피드와 댓글이 보이지 않게 됩니다.' : '다시 연결하려면 새 초대가 필요합니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: action === 'block' ? '차단' : '연결 끊기',
          style: 'destructive',
          onPress: () => {
            const options = {
              onSuccess: () => {
                feedback.showSuccess(action === 'block' ? `${friend.nickname}님을 차단했어요` : `${friend.nickname}님과의 연결을 끊었어요`);
                router.replace('/people');
              },
              onError: (error: Error) => feedback.showError(action === 'block' ? '차단하지 못했어요' : '연결을 끊지 못했어요', error),
            };
            if (action === 'block') block.mutate({ userID: friend.userId, active: true }, options);
            else remove.mutate(friend.userId, options);
          },
        },
      ],
    );
  };

  if ((friends.isFetching && !friends.data) || (feed.isFetching && !feed.data)) {
    return (
      <Screen contentContainerStyle={styles.centered}>
        <ActivityIndicator color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>친구의 독서 흐름을 불러오는 중…</Text>
      </Screen>
    );
  }

  if (!friend) {
    return (
      <Screen contentContainerStyle={styles.centered}>
        <Stack.Screen options={{ title: '친구 독서 프로필' }} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>연결된 친구를 찾을 수 없어요</Text>
        <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>친구 관계가 변경됐거나 목록이 아직 갱신되지 않았을 수 있어요.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/people')} style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
          <Text style={[styles.primaryButtonText, { color: theme.inverse }]}>친구 탭으로 이동</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen
      refreshing={friends.isRefetching || feed.isRefetching || runs.isRefetching}
      onRefresh={() => { void Promise.all([friends.refetch(), feed.refetch(), runs.refetch()]); }}>
      <Stack.Screen options={{ title: `${friend.nickname}님의 독서 프로필` }} />

      {friends.isError ? <FeedbackBanner compact title="친구 정보를 새로 불러오지 못했어요" error={friends.error} onAction={() => void friends.refetch()} /> : null}
      {feed.isError ? <FeedbackBanner compact title="최근 독서 소식을 불러오지 못했어요" error={feed.error} onAction={() => void feed.refetch()} /> : null}

      <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.avatarText, { color: theme.primary }]}>{friend.nickname.slice(0, 1)}</Text>
          {friend.readingNow ? <View style={[styles.liveDot, { backgroundColor: theme.accent, borderColor: theme.card }]} /> : null}
        </View>
        <View style={styles.profileCopy}>
          <Text style={[styles.name, { color: theme.text }]}>{friend.nickname}</Text>
          <Text style={[styles.bio, { color: theme.textSecondary }]}>{friend.bio || '함께 읽는 독서 친구예요.'}</Text>
          <Text style={[styles.visibility, { color: theme.primary }]}>친구에게 공개한 정보만 표시돼요</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>지금 읽는 책</Text>
          {friend.readingNow ? <Text style={[styles.liveText, { color: theme.accent }]}>● 지금 읽는 중</Text> : null}
        </View>
        {friend.currentTitle ? (
          <View style={[styles.currentBook, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
            <BookCover title={friend.currentTitle} color={theme.primary} small />
            <View style={styles.currentBookCopy}>
              <Text numberOfLines={2} style={[styles.currentTitle, { color: theme.text }]}>{friend.currentTitle}</Text>
              {friend.normalizedProgress !== undefined ? (
                <>
                  <ProgressBar value={friend.normalizedProgress / 100} />
                  <Text style={[styles.progressText, { color: theme.primary }]}>{Math.round(friend.normalizedProgress / 100)}%까지 읽었어요</Text>
                </>
              ) : (
                <Text style={[styles.progressText, { color: theme.textSecondary }]}>진척도는 공개하지 않았어요</Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={sharedCurrentRun ? `${friend.currentTitle} 내 기록 열기` : `${friend.currentTitle} 검색하기`}
                onPress={() => sharedCurrentRun
                  ? router.push({ pathname: '/book/[runID]', params: { runID: sharedCurrentRun.id } })
                  : router.push({ pathname: '/book-search', params: { q: friend.currentTitle } })}
                style={[styles.bookAction, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.bookActionText, { color: theme.primary }]}>{sharedCurrentRun ? '내 기록과 함께 보기' : '이 책 찾아보기'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>현재 친구에게 공개한 읽는 책이 없어요.</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>최근 함께 본 기록</Text>
          <Text style={[styles.sectionMeta, { color: theme.textSecondary }]}>최근 피드 기준</Text>
        </View>
        <View style={[styles.statsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.statItem}><Text style={[styles.statValue, { color: theme.text }]}>{sharedBookCount}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>공유한 책</Text></View>
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <View style={styles.statItem}><Text style={[styles.statValue, { color: theme.text }]}>{finishedCount}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>완독 소식</Text></View>
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <View style={styles.statItem}><Text style={[styles.statValue, { color: theme.text }]}>{reactionCount}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>받은 응원</Text></View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>공개한 독서 소식</Text>
          <Text style={[styles.sectionMeta, { color: theme.textSecondary }]}>{activities.length}개</Text>
        </View>
        {activities.length ? activities.map((item) => (
          <View key={item.id} style={[styles.activityCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.activityTop}>
              <View style={[styles.activityBadge, { backgroundColor: theme.primarySoft }]}>
                <Text style={[styles.activityBadgeText, { color: theme.primary }]}>{activityCopy[item.type]}</Text>
              </View>
              <Text style={[styles.activityDate, { color: theme.textSecondary }]}>{activityDate(item.occurredAt)}</Text>
            </View>
            <View style={styles.bookRow}>
              <BookCover title={item.title} color={item.coverColor} small />
              <View style={styles.bookCopy}>
                <Text numberOfLines={2} style={[styles.bookTitle, { color: theme.text }]}>{item.title}</Text>
                <Text numberOfLines={1} style={[styles.author, { color: theme.textSecondary }]}>{item.author}</Text>
                <ProgressBar value={item.normalizedProgress / 100} />
                <Text style={[styles.progressText, { color: theme.primary }]}>{Math.round(item.normalizedProgress / 100)}%</Text>
              </View>
            </View>
            {item.note ? <Text style={[styles.note, { color: theme.text, backgroundColor: theme.backgroundElement }]}>“{item.note}”</Text> : null}
            <View style={[styles.activityActions, { borderTopColor: theme.border }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.reactedByViewer, disabled: reaction.isPending }}
                disabled={reaction.isPending}
                onPress={() => {
                  const input = { eventID: item.id, active: !item.reactedByViewer };
                  reaction.mutate(input, { onError: (error) => feedback.showError('응원을 반영하지 못했어요', error) });
                }}
                style={styles.actionButton}>
                <Text style={[styles.actionText, { color: theme.primary }]}>{item.reactedByViewer ? '♥' : '♡'} 응원 {item.reactionCount}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/comments/[eventID]', params: { eventID: item.id, title: item.title } })}
                style={styles.actionButton}>
                <Text style={[styles.actionText, { color: theme.textSecondary }]}>한마디 {item.commentCount}</Text>
              </Pressable>
            </View>
          </View>
        )) : (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>아직 공개한 독서 소식이 없어요</Text>
            <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>친구가 마일스톤이나 감상을 공유하면 여기에 모여요.</Text>
          </View>
        )}
      </View>

      <View style={styles.manageSection}>
        <Pressable accessibilityRole="button" onPress={() => confirmRelationship('remove')} style={[styles.manageButton, { borderColor: theme.border }]}>
          <Text style={[styles.manageText, { color: theme.textSecondary }]}>친구 연결 끊기</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => confirmRelationship('block')} style={[styles.manageButton, { borderColor: theme.border }]}>
          <Text style={[styles.manageText, { color: theme.accent }]}>차단하기</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13, fontWeight: '700' },
  profileCard: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.four, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarText: { fontSize: 27, fontWeight: '900' },
  liveDot: { position: 'absolute', right: 3, bottom: 4, width: 17, height: 17, borderRadius: 9, borderWidth: 3 },
  profileCopy: { flex: 1, gap: 5 },
  name: { fontSize: 25, fontWeight: '900', letterSpacing: -0.7 },
  bio: { fontSize: 13, lineHeight: 19 },
  visibility: { marginTop: 3, fontSize: 10, fontWeight: '800' },
  section: { gap: 11 },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  sectionMeta: { fontSize: 11, fontWeight: '700' },
  liveText: { fontSize: 11, fontWeight: '900' },
  currentBook: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  currentBookCopy: { flex: 1, gap: 7 },
  currentTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900' },
  progressText: { fontSize: 11, fontWeight: '800' },
  bookAction: { alignSelf: 'flex-start', minHeight: 42, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  bookActionText: { fontSize: 11, fontWeight: '900' },
  statsCard: { minHeight: 98, borderWidth: 1, borderRadius: Radius.large, flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  statItem: { flex: 1, alignItems: 'center', gap: 5 },
  statValue: { fontSize: 23, fontWeight: '900' },
  statLabel: { fontSize: 10, fontWeight: '800' },
  statDivider: { width: 1, height: 42 },
  activityCard: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, gap: 13 },
  activityTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityBadge: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  activityBadgeText: { fontSize: 10, fontWeight: '900' },
  activityDate: { fontSize: 11, fontWeight: '700' },
  bookRow: { flexDirection: 'row', gap: Spacing.three },
  bookCopy: { flex: 1, justifyContent: 'center', gap: 5 },
  bookTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900' },
  author: { fontSize: 11 },
  note: { borderRadius: Radius.small, padding: 12, fontSize: 13, lineHeight: 19 },
  activityActions: { borderTopWidth: 1, paddingTop: 7, flexDirection: 'row', gap: 4 },
  actionButton: { minHeight: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 11, fontWeight: '900' },
  emptyCard: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.four, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '900', textAlign: 'center' },
  emptyCopy: { maxWidth: 320, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  primaryButton: { marginTop: 6, minHeight: 48, borderRadius: Radius.medium, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontSize: 13, fontWeight: '900' },
  manageSection: { flexDirection: 'row', gap: 8 },
  manageButton: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  manageText: { fontSize: 12, fontWeight: '800' },
});
