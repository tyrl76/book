import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/product/progress-bar';
import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useFeedback } from '@/features/feedback/feedback-provider';
import { useCreateGroupInvite, useGroupMembers, useGroups, useLeaveGroup } from '@/features/groups/hooks';
import { useTheme } from '@/hooks/use-theme';

export default function GroupDetailScreen() {
  const theme = useTheme();
  const feedback = useFeedback();
  const params = useLocalSearchParams<{ groupID: string; name?: string }>();
  const groupID = Array.isArray(params.groupID) ? params.groupID[0] : params.groupID;
  const routeName = Array.isArray(params.name) ? params.name[0] : params.name;
  const groups = useGroups();
  const group = groups.data?.find((item) => item.id === groupID);
  const name = group?.name ?? routeName ?? '독서 그룹';
  const members = useGroupMembers(groupID ?? '');
  const invite = useCreateGroupInvite(groupID ?? '');
  const leave = useLeaveGroup();

  const shareInvite = async () => {
    try {
      const item = await invite.mutateAsync();
      await Share.share({ title: `${name} 초대`, message: `책결의 “${name}” 그룹에서 함께 읽어요.\n${item.deepLink}\n초대 코드: ${item.token}` });
    } catch (error) {
      feedback.showError('초대를 만들지 못했어요', error, { label: '다시 시도', onPress: () => void shareInvite() });
    }
  };

  const leaveGroup = () => {
    Alert.alert(group?.role === 'owner' ? '그룹을 삭제할까요?' : '그룹에서 나갈까요?', group?.role === 'owner' ? '다른 멤버가 있으면 먼저 그룹을 정리해야 합니다.' : '다시 참여하려면 새 초대가 필요합니다.', [
      { text: '취소', style: 'cancel' },
      { text: group?.role === 'owner' ? '삭제' : '나가기', style: 'destructive', onPress: async () => {
        try { await leave.mutateAsync(groupID ?? ''); router.back(); }
        catch (error) { feedback.showError('그룹을 정리하지 못했어요', error, { label: '다시 확인', onPress: leaveGroup }); }
      } },
    ]);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: name }} />
      {groups.isError ? <FeedbackBanner compact title="그룹 정보를 불러오지 못했어요" error={groups.error} onAction={() => void groups.refetch()} /> : null}
      {members.isError ? <FeedbackBanner compact title="그룹 멤버를 불러오지 못했어요" error={members.error} onAction={() => void members.refetch()} /> : null}
      <View style={[styles.hero, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
        <View style={[styles.mark, { backgroundColor: theme.primary }]}><Text style={[styles.markText, { color: theme.inverse }]}>함</Text></View>
        <View style={styles.heroCopy}><Text style={[styles.title, { color: theme.text }]}>{name}</Text><Text style={[styles.copy, { color: theme.textSecondary }]}>{members.data?.length ?? group?.memberCount ?? 0}명이 각자의 책을 읽고 있어요.</Text></View>
      </View>
      <Pressable accessibilityRole="button" onPress={shareInvite} style={[styles.inviteButton, { backgroundColor: theme.primary }]}><Text style={[styles.inviteText, { color: theme.inverse }]}>{invite.isPending ? '초대 만드는 중…' : '그룹 초대 링크 공유'}</Text></Pressable>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>멤버</Text>
        {members.data?.map((member) => (
          <View key={member.userId} style={[styles.member, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}><Text style={[styles.avatarText, { color: theme.primary }]}>{member.nickname.slice(0, 1)}</Text></View>
            <View style={styles.memberCopy}>
              <View style={styles.nameRow}><Text style={[styles.name, { color: theme.text }]}>{member.nickname}</Text>{member.role === 'owner' ? <Text style={[styles.owner, { color: theme.primary }]}>운영자</Text> : null}{member.readingNow ? <Text style={[styles.live, { color: theme.accent }]}>● 읽는 중</Text> : null}</View>
              <Text numberOfLines={1} style={[styles.book, { color: theme.textSecondary }]}>{member.currentTitle || '아직 읽는 책이 없어요'}</Text>
              {member.normalizedProgress !== undefined ? <ProgressBar value={member.normalizedProgress / 100} /> : null}
            </View>
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={leaveGroup} style={styles.leaveButton}><Text style={[styles.leaveText, { color: theme.accent }]}>{group?.role === 'owner' ? '그룹 삭제' : '그룹 나가기'}</Text></Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 110, borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: 14 },
  mark: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  markText: { fontSize: 20, fontWeight: '900' },
  heroCopy: { flex: 1 },
  title: { fontSize: 22, fontWeight: '900' },
  copy: { marginTop: 5, fontSize: 12, lineHeight: 18 },
  inviteButton: { minHeight: 52, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  inviteText: { fontSize: 14, fontWeight: '900' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  member: { minHeight: 82, borderWidth: 1, borderRadius: Radius.medium, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '900' },
  memberCopy: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { fontSize: 14, fontWeight: '900' },
  owner: { fontSize: 9, fontWeight: '900' },
  live: { fontSize: 9, fontWeight: '900' },
  book: { fontSize: 11 },
  leaveButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  leaveText: { fontSize: 13, fontWeight: '900' },
});
