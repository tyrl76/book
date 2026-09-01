import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { ProgressBar } from '@/components/product/progress-bar';
import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useFeedback } from '@/features/feedback/feedback-provider';
import {
  useAcceptFriendInvite,
  useBlockUser,
  useCreateFriendInvite,
  useFriends,
  useRemoveFriend,
} from '@/features/social/hooks';
import { useTheme } from '@/hooks/use-theme';

function inviteToken(value: string) {
  return value.trim().split('/').filter(Boolean).at(-1) ?? '';
}

export default function FriendsScreen() {
  const theme = useTheme();
  const feedback = useFeedback();
  const friends = useFriends();
  const createInvite = useCreateFriendInvite();
  const acceptInvite = useAcceptFriendInvite();
  const remove = useRemoveFriend();
  const block = useBlockUser();
  const [inviteInput, setInviteInput] = useState('');

  const shareInvite = async () => {
    try {
      const invite = await createInvite.mutateAsync();
      await Share.share({
        title: '책결 친구 초대',
        message: `책결에서 서로의 독서 근황을 나눠요.\n${invite.deepLink}\n초대 코드: ${invite.token}`,
      });
    } catch (error) {
      feedback.showError('초대를 만들지 못했어요', error, { label: '다시 시도', onPress: () => void shareInvite() });
    }
  };

  const accept = async () => {
    const token = inviteToken(inviteInput);
    if (!token) return;
    try {
      const friend = await acceptInvite.mutateAsync(token);
      setInviteInput('');
      feedback.showSuccess(`${friend.nickname}님과 연결됐어요`, '이제 서로의 독서 마일스톤을 볼 수 있어요.');
    } catch (error) {
      feedback.showError('초대를 수락하지 못했어요', error, { label: '다시 시도', onPress: () => void accept() });
    }
  };

  const confirmRelationship = (userID: string, nickname: string, action: 'remove' | 'block') => {
    Alert.alert(
      action === 'block' ? `${nickname}님을 차단할까요?` : `${nickname}님과의 연결을 끊을까요?`,
      action === 'block'
        ? '서로의 피드와 댓글이 즉시 보이지 않게 됩니다.'
        : '다시 연결하려면 새 초대가 필요합니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: action === 'block' ? '차단' : '연결 끊기',
          style: 'destructive',
          onPress: () => {
            const options = {
              onSuccess: () => feedback.showSuccess(action === 'block' ? `${nickname}님을 차단했어요` : `${nickname}님과의 연결을 끊었어요`),
              onError: (error: Error) => feedback.showError(action === 'block' ? '차단하지 못했어요' : '연결을 끊지 못했어요', error),
            };
            if (action === 'block') block.mutate({ userID, active: true }, options);
            else remove.mutate(userID, options);
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>READING TOGETHER</Text>
        <Text style={[styles.title, { color: theme.text }]}>친구와 연결하기</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>연락처를 올리지 않고 초대 링크나 코드로만 연결해요.</Text>
      </View>

      <View style={[styles.inviteCard, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>내 초대 보내기</Text>
        <Text style={[styles.cardCopy, { color: theme.textSecondary }]}>초대는 7일 동안 한 번만 사용할 수 있어요.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="친구 초대 링크 공유"
          disabled={createInvite.isPending}
          onPress={shareInvite}
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
          <Text style={[styles.primaryButtonText, { color: theme.inverse }]}>{createInvite.isPending ? '초대 만드는 중…' : '초대 링크 공유'}</Text>
        </Pressable>
      </View>

      {friends.isError ? (
        <FeedbackBanner title="친구 목록을 불러오지 못했어요" error={friends.error} onAction={() => void friends.refetch()} />
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="비공개 독서 그룹 관리"
        onPress={() => router.push('/groups')}
        style={[styles.groupLink, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.groupLinkCopy}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>비공개 독서 그룹</Text>
          <Text style={[styles.cardCopy, { color: theme.textSecondary }]}>최대 20명과 느슨하게 함께 읽어요.</Text>
        </View>
        <Text style={[styles.groupLinkArrow, { color: theme.primary }]}>›</Text>
      </Pressable>

      <View style={styles.acceptSection}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>받은 초대 코드</Text>
        <View style={styles.acceptRow}>
          <TextInput
            accessibilityLabel="받은 친구 초대 코드 또는 링크"
            autoCapitalize="none"
            autoCorrect={false}
            value={inviteInput}
            onChangeText={setInviteInput}
            placeholder="코드 또는 링크 붙여넣기"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="친구 초대 수락"
            disabled={!inviteInput.trim() || acceptInvite.isPending}
            onPress={accept}
            style={[styles.acceptButton, { backgroundColor: inviteInput.trim() ? theme.primary : theme.backgroundElement }]}>
            <Text style={[styles.acceptButtonText, { color: inviteInput.trim() ? theme.inverse : theme.textSecondary }]}>수락</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>연결된 친구</Text>
          <Text style={[styles.sectionMeta, { color: theme.textSecondary }]}>{friends.data?.length ?? 0}명</Text>
        </View>
        {friends.data?.length ? friends.data.map((friend) => (
          <View key={friend.userId} style={[styles.friendCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
              <Text style={[styles.avatarText, { color: theme.primary }]}>{friend.nickname.slice(0, 1)}</Text>
            </View>
            <View style={styles.friendCopy}>
              <Text style={[styles.friendName, { color: theme.text }]}>{friend.nickname}</Text>
              {friend.readingNow ? <Text style={[styles.liveText, { color: theme.accent }]}>● 지금 읽는 중</Text> : null}
              <Text numberOfLines={1} style={[styles.friendBio, { color: theme.textSecondary }]}>{friend.currentTitle || friend.bio || '아직 읽는 책이 없어요'}</Text>
              {friend.normalizedProgress !== undefined ? <ProgressBar value={friend.normalizedProgress / 100} /> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${friend.nickname} 친구 관리`}
              onPress={() => Alert.alert(`${friend.nickname}님 관리`, undefined, [
                { text: '취소', style: 'cancel' },
                { text: '연결 끊기', onPress: () => confirmRelationship(friend.userId, friend.nickname, 'remove') },
                { text: '차단', style: 'destructive', onPress: () => confirmRelationship(friend.userId, friend.nickname, 'block') },
              ])}
              style={[styles.moreButton, { backgroundColor: theme.backgroundElement }]}>
              <Text style={[styles.moreText, { color: theme.textSecondary }]}>•••</Text>
            </Pressable>
          </View>
        )) : !friends.isFetching && !friends.isError ? (
          <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>첫 독서 친구를 초대해 보세요</Text>
            <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>친구 한 명만 연결돼도 서로의 독서 흐름을 이어볼 수 있어요.</Text>
          </View>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
        <Text style={[styles.backText, { color: theme.textSecondary }]}>돌아가기</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 31, lineHeight: 39, fontWeight: '900', letterSpacing: -1 },
  copy: { fontSize: 14, lineHeight: 21 },
  inviteCard: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.four, gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '900' },
  cardCopy: { fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 50, marginTop: 7, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontSize: 14, fontWeight: '900' },
  acceptSection: { gap: 10 },
  groupLink: { minHeight: 82, borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupLinkCopy: { flex: 1 },
  groupLinkArrow: { fontSize: 28, fontWeight: '500' },
  acceptRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 14 },
  acceptButton: { minWidth: 72, minHeight: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  acceptButtonText: { fontSize: 14, fontWeight: '900' },
  section: { gap: 11 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  sectionMeta: { fontSize: 12, fontWeight: '800' },
  friendCard: { minHeight: 86, borderWidth: 1, borderRadius: Radius.medium, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '900' },
  friendCopy: { flex: 1, gap: 4 },
  friendName: { fontSize: 15, fontWeight: '900' },
  liveText: { fontSize: 10, fontWeight: '900' },
  friendBio: { fontSize: 12 },
  moreButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  empty: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.five, alignItems: 'center', gap: 7 },
  emptyTitle: { fontSize: 17, fontWeight: '900', textAlign: 'center' },
  emptyCopy: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  backButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 13, fontWeight: '800' },
});
