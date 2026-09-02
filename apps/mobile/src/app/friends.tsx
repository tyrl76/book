import * as Clipboard from 'expo-clipboard';
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { ProgressBar } from '@/components/product/progress-bar';
import { Screen } from '@/components/product/screen';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
import type { FriendInvite } from '@/types/domain';

function inviteToken(value: string) {
  return value.trim().split('/').filter(Boolean).at(-1) ?? '';
}

export default function FriendsScreen() {
  const theme = useTheme();
  const pathname = usePathname();
  const feedback = useFeedback();
  const friends = useFriends();
  const createInvite = useCreateFriendInvite();
  const acceptInvite = useAcceptFriendInvite();
  const remove = useRemoveFriend();
  const block = useBlockUser();
  const [inviteInput, setInviteInput] = useState('');
  const [activeInvite, setActiveInvite] = useState<FriendInvite | null>(null);
  const [connectionToolsOpen, setConnectionToolsOpen] = useState(false);
  const [managedFriendID, setManagedFriendID] = useState<string | null>(null);
  const [relationshipConfirmation, setRelationshipConfirmation] = useState<{
    userID: string;
    nickname: string;
    action: 'remove' | 'block';
  } | null>(null);
  const isTabRoute = pathname === '/people';
  const liveFriendCount = (friends.data ?? []).filter((friend) => friend.readingNow).length;
  const hasFriends = Boolean(friends.data?.length);
  const showConnectionTools = connectionToolsOpen || friends.data?.length === 0;
  const refresh = () => {
    void friends.refetch();
  };

  const getInvite = async (fresh = false) => {
    if (activeInvite && !fresh) return activeInvite;
    const invite = await createInvite.mutateAsync();
    setActiveInvite(invite);
    return invite;
  };

  const copyInvite = async (fresh = false) => {
    try {
      const invite = await getInvite(fresh);
      await Clipboard.setStringAsync(invite.deepLink);
      feedback.showSuccess('초대 링크를 복사했어요', '메신저나 문자 입력창에 붙여넣어 전달하세요.');
    } catch (error) {
      feedback.showError('초대 링크를 복사하지 못했어요', error, { label: '다시 시도', onPress: () => void copyInvite(fresh) });
    }
  };

  const shareInvite = async () => {
    try {
      const invite = await getInvite();
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

  const applyRelationshipAction = async () => {
    if (!relationshipConfirmation || remove.isPending || block.isPending) return;
    const { userID, nickname, action } = relationshipConfirmation;
    try {
      if (action === 'block') await block.mutateAsync({ userID, active: true });
      else await remove.mutateAsync(userID);
      setRelationshipConfirmation(null);
      setManagedFriendID(null);
      feedback.showSuccess(action === 'block' ? `${nickname}님을 차단했어요` : `${nickname}님과의 연결을 끊었어요`);
    } catch (error) {
      setRelationshipConfirmation(null);
      feedback.showError(action === 'block' ? '차단하지 못했어요' : '연결을 끊지 못했어요', error);
    }
  };

  return (
    <Screen refreshing={friends.isRefetching} onRefresh={refresh}>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>READING TOGETHER</Text>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text }]}>내 독서 친구</Text>
          {hasFriends ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showConnectionTools }}
              accessibilityLabel={showConnectionTools ? '친구 추가 도구 닫기' : '친구 추가 도구 열기'}
              onPress={() => setConnectionToolsOpen((current) => !current)}
              style={({ pressed }) => [
                styles.addFriendButton,
                {
                  backgroundColor: showConnectionTools ? theme.backgroundElement : theme.primary,
                  borderColor: showConnectionTools ? theme.border : theme.primary,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}>
              <Text style={[styles.addFriendText, { color: showConnectionTools ? theme.primary : theme.inverse }]}>
                {showConnectionTools ? '닫기' : '＋ 친구 추가'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>친구의 현재 책과 공개한 독서 흐름을 한곳에서 확인해요.</Text>
      </View>

      <View style={[styles.overview, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.overviewItem}>
          <Text style={[styles.overviewValue, { color: theme.text }]}>{friends.data?.length ?? 0}</Text>
          <Text style={[styles.overviewLabel, { color: theme.textSecondary }]}>연결된 친구</Text>
        </View>
        <View style={[styles.overviewDivider, { backgroundColor: theme.border }]} />
        <View style={styles.overviewItem}>
          <Text style={[styles.overviewValue, { color: liveFriendCount ? theme.accent : theme.text }]}>{liveFriendCount}</Text>
          <Text style={[styles.overviewLabel, { color: theme.textSecondary }]}>지금 읽는 중</Text>
        </View>
      </View>

      {friends.isError ? (
        <FeedbackBanner title="친구 목록을 불러오지 못했어요" error={friends.error} onAction={() => void friends.refetch()} />
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>연결된 친구</Text>
          <Text style={[styles.sectionMeta, { color: theme.textSecondary }]}>친구를 눌러 자세히 보기</Text>
        </View>
        {friends.data?.length ? friends.data.map((friend) => (
          <View key={friend.userId} style={[styles.friendCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.friendCardMain}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${friend.nickname}님 독서 프로필 열기`}
                onPress={() => router.push({ pathname: '/friend/[userID]', params: { userID: friend.userId } })}
                style={styles.friendProfile}>
                <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
                  <Text style={[styles.avatarText, { color: theme.primary }]}>{friend.nickname.slice(0, 1)}</Text>
                </View>
                <View style={styles.friendCopy}>
                  <View style={styles.friendNameRow}>
                    <Text style={[styles.friendName, { color: theme.text }]}>{friend.nickname}</Text>
                    {friend.readingNow ? <Text style={[styles.liveText, { color: theme.accent }]}>● 읽는 중</Text> : null}
                  </View>
                  <Text numberOfLines={1} style={[styles.friendBio, { color: theme.textSecondary }]}>{friend.currentTitle || friend.bio || '공개한 독서 근황이 아직 없어요'}</Text>
                  {friend.normalizedProgress !== undefined ? <ProgressBar value={friend.normalizedProgress / 100} /> : null}
                  <Text style={[styles.detailHint, { color: theme.primary }]}>독서 프로필 보기 ›</Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: managedFriendID === friend.userId }}
                accessibilityLabel={`${friend.nickname} 친구 관리 ${managedFriendID === friend.userId ? '닫기' : '열기'}`}
                onPress={() => setManagedFriendID((current) => current === friend.userId ? null : friend.userId)}
                style={[styles.moreButton, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.moreText, { color: theme.textSecondary }]}>{managedFriendID === friend.userId ? '×' : '•••'}</Text>
              </Pressable>
            </View>
            {managedFriendID === friend.userId ? (
              <View style={[styles.friendManageActions, { borderTopColor: theme.border }]}>
                <Text style={[styles.friendManageLabel, { color: theme.textSecondary }]}>{friend.nickname}님 관리</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${friend.nickname}님과의 연결 끊기`}
                  onPress={() => setRelationshipConfirmation({ userID: friend.userId, nickname: friend.nickname, action: 'remove' })}
                  style={[styles.friendManageButton, { backgroundColor: theme.backgroundElement }]}>
                  <Text style={[styles.friendManageButtonText, { color: theme.textSecondary }]}>연결 끊기</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${friend.nickname}님 차단`}
                  onPress={() => setRelationshipConfirmation({ userID: friend.userId, nickname: friend.nickname, action: 'block' })}
                  style={[styles.friendManageButton, { backgroundColor: theme.backgroundElement }]}>
                  <Text style={[styles.friendManageButtonText, { color: theme.accent }]}>차단</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )) : !friends.isFetching && !friends.isError ? (
          <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>첫 독서 친구를 초대해 보세요</Text>
            <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>연결되면 이곳에서 서로의 책과 독서 소식을 확인할 수 있어요.</Text>
          </View>
        ) : null}
      </View>

      {showConnectionTools ? (
        <View style={styles.connectionTools}>
          <View style={[styles.inviteCard, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>새 친구 초대하기</Text>
            <Text style={[styles.cardCopy, { color: theme.textSecondary }]}>초대는 7일 동안 한 번만 사용할 수 있어요.</Text>
            {activeInvite ? (
              <View style={[styles.inviteLinkBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text selectable numberOfLines={2} style={[styles.inviteLink, { color: theme.text }]}>{activeInvite.deepLink}</Text>
              </View>
            ) : null}
            <View style={styles.inviteActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="친구 초대 링크 복사"
                disabled={createInvite.isPending}
                onPress={() => void copyInvite()}
                style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
                <Text style={[styles.primaryButtonText, { color: theme.inverse }]}>{createInvite.isPending ? '초대 만드는 중…' : '링크 복사'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="친구 초대 링크 다른 앱으로 공유"
                disabled={createInvite.isPending}
                onPress={() => void shareInvite()}
                style={[styles.secondaryInviteButton, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.secondaryInviteText, { color: theme.primary }]}>공유하기</Text>
              </Pressable>
            </View>
            {activeInvite ? (
              <Pressable accessibilityRole="button" accessibilityLabel="새 친구 초대 링크 만들어 복사" disabled={createInvite.isPending} onPress={() => void copyInvite(true)} style={styles.newInviteButton}>
                <Text style={[styles.newInviteText, { color: theme.textSecondary }]}>새 링크 만들어 복사</Text>
              </Pressable>
            ) : null}
          </View>

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
        </View>
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

      {!isTabRoute ? (
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backText, { color: theme.textSecondary }]}>돌아가기</Text>
        </Pressable>
      ) : null}
      <ConfirmDialog
        visible={Boolean(relationshipConfirmation)}
        title={relationshipConfirmation?.action === 'block'
          ? `${relationshipConfirmation.nickname}님을 차단할까요?`
          : `${relationshipConfirmation?.nickname ?? ''}님과의 연결을 끊을까요?`}
        message={relationshipConfirmation?.action === 'block'
          ? '서로의 피드와 댓글이 즉시 보이지 않게 됩니다.'
          : '다시 연결하려면 새 초대가 필요합니다.'}
        confirmLabel={relationshipConfirmation?.action === 'block' ? '차단' : '연결 끊기'}
        pending={remove.isPending || block.isPending}
        pendingLabel={relationshipConfirmation?.action === 'block' ? '차단 중…' : '연결 끊는 중…'}
        onCancel={() => setRelationshipConfirmation(null)}
        onConfirm={() => void applyRelationshipAction()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 31, lineHeight: 39, fontWeight: '900', letterSpacing: -1 },
  copy: { fontSize: 14, lineHeight: 21 },
  addFriendButton: { minHeight: 44, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  addFriendText: { fontSize: 12, fontWeight: '900' },
  overview: { minHeight: 92, borderWidth: 1, borderRadius: Radius.large, flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  overviewItem: { flex: 1, alignItems: 'center', gap: 4 },
  overviewValue: { fontSize: 27, fontWeight: '900' },
  overviewLabel: { fontSize: 11, fontWeight: '800' },
  overviewDivider: { width: 1, height: 44 },
  inviteCard: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.four, gap: 8 },
  connectionTools: { gap: Spacing.three },
  cardTitle: { fontSize: 17, fontWeight: '900' },
  cardCopy: { fontSize: 12, lineHeight: 18 },
  inviteLinkBox: { marginTop: 5, minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9, justifyContent: 'center' },
  inviteLink: { fontSize: 11, lineHeight: 15 },
  inviteActions: { flexDirection: 'row', gap: 8, marginTop: 7 },
  primaryButton: { flex: 1, minHeight: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontSize: 14, fontWeight: '900' },
  secondaryInviteButton: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  secondaryInviteText: { fontSize: 14, fontWeight: '900' },
  newInviteButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  newInviteText: { fontSize: 11, fontWeight: '800' },
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
  friendCard: { minHeight: 104, borderWidth: 1, borderRadius: Radius.medium, padding: 13, gap: 8 },
  friendCardMain: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  friendProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '900' },
  friendCopy: { flex: 1, gap: 4 },
  friendNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  friendName: { fontSize: 15, fontWeight: '900' },
  liveText: { fontSize: 10, fontWeight: '900' },
  friendBio: { fontSize: 12 },
  detailHint: { marginTop: 2, fontSize: 10, fontWeight: '900' },
  moreButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  friendManageActions: { borderTopWidth: 1, paddingTop: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
  friendManageLabel: { flex: 1, fontSize: 11, fontWeight: '800' },
  friendManageButton: { minHeight: 40, borderRadius: Radius.small, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  friendManageButtonText: { fontSize: 11, fontWeight: '900' },
  empty: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.five, alignItems: 'center', gap: 7 },
  emptyTitle: { fontSize: 17, fontWeight: '900', textAlign: 'center' },
  emptyCopy: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  backButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 13, fontWeight: '800' },
});
