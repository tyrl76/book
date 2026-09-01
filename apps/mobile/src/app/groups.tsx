import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useFeedback } from '@/features/feedback/feedback-provider';
import { useAcceptGroupInvite, useCreateGroup, useGroups } from '@/features/groups/hooks';
import { useTheme } from '@/hooks/use-theme';

function inviteToken(value: string) {
  return value.trim().split('/').filter(Boolean).at(-1) ?? '';
}

export default function GroupsScreen() {
  const theme = useTheme();
  const feedback = useFeedback();
  const groups = useGroups();
  const create = useCreateGroup();
  const accept = useAcceptGroupInvite();
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');

  const createNew = async () => {
    if (!name.trim()) return;
    try {
      const group = await create.mutateAsync(name.trim());
      setName('');
      router.push({ pathname: '/group/[groupID]', params: { groupID: group.id, name: group.name } });
    } catch (error) {
      feedback.showError('그룹을 만들지 못했어요', error, { label: '다시 시도', onPress: () => void createNew() });
    }
  };

  const acceptInvite = async () => {
    const token = inviteToken(invite);
    if (!token) return;
    try {
      const group = await accept.mutateAsync(token);
      setInvite('');
      router.push({ pathname: '/group/[groupID]', params: { groupID: group.id, name: group.name } });
    } catch (error) {
      feedback.showError('그룹 초대를 수락하지 못했어요', error, { label: '다시 시도', onPress: () => void acceptInvite() });
    }
  };

  return (
    <Screen>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>SMALL CIRCLES</Text>
        <Text style={[styles.title, { color: theme.text }]}>우리만의 독서 그룹</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>공개 커뮤니티 대신 최대 20명의 가까운 사람과 함께해요.</Text>
      </View>

      {groups.isError ? (
        <FeedbackBanner title="그룹 목록을 불러오지 못했어요" error={groups.error} onAction={() => void groups.refetch()} />
      ) : null}

      <View style={[styles.createCard, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>새 그룹 만들기</Text>
        <View style={styles.inputRow}>
          <TextInput accessibilityLabel="새 독서 그룹 이름" value={name} onChangeText={setName} maxLength={60} placeholder="예: 토요일의 책장" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]} />
          <Pressable accessibilityRole="button" disabled={!name.trim() || create.isPending} onPress={createNew} style={[styles.action, { backgroundColor: name.trim() ? theme.primary : theme.backgroundElement }]}>
            <Text style={[styles.actionText, { color: name.trim() ? theme.inverse : theme.textSecondary }]}>만들기</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.acceptSection}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>받은 그룹 초대</Text>
        <View style={styles.inputRow}>
          <TextInput accessibilityLabel="받은 그룹 초대 코드 또는 링크" value={invite} onChangeText={setInvite} autoCapitalize="none" autoCorrect={false} placeholder="코드 또는 링크" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]} />
          <Pressable accessibilityRole="button" disabled={!invite.trim() || accept.isPending} onPress={acceptInvite} style={[styles.action, { backgroundColor: invite.trim() ? theme.primary : theme.backgroundElement }]}>
            <Text style={[styles.actionText, { color: invite.trim() ? theme.inverse : theme.textSecondary }]}>참여</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>참여 중인 그룹</Text>
          <Text style={[styles.sectionMeta, { color: theme.textSecondary }]}>{groups.data?.length ?? 0}개</Text>
        </View>
        {groups.data?.map((group) => (
          <Pressable key={group.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/group/[groupID]', params: { groupID: group.id, name: group.name } })} style={[styles.groupCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.groupMark, { backgroundColor: theme.primarySoft }]}><Text style={[styles.groupMarkText, { color: theme.primary }]}>함</Text></View>
            <View style={styles.groupCopy}>
              <Text style={[styles.groupName, { color: theme.text }]}>{group.name}</Text>
              <Text style={[styles.groupMeta, { color: theme.textSecondary }]}>{group.memberCount}명 · {group.role === 'owner' ? '내가 만든 그룹' : '참여 중'}</Text>
            </View>
            <Text style={[styles.chevron, { color: theme.textSecondary }]}>›</Text>
          </Pressable>
        ))}
        {!groups.data?.length && !groups.isFetching && !groups.isError ? <Text style={[styles.empty, { color: theme.textSecondary }]}>아직 참여 중인 그룹이 없어요.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 29, lineHeight: 37, fontWeight: '900', letterSpacing: -0.9 },
  copy: { fontSize: 14, lineHeight: 21 },
  createCard: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '900' },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 13, fontSize: 14 },
  action: { minWidth: 72, minHeight: 50, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 13, fontWeight: '900' },
  acceptSection: { gap: 9 },
  section: { gap: 10 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  sectionMeta: { fontSize: 11, fontWeight: '800' },
  groupCard: { minHeight: 78, borderWidth: 1, borderRadius: Radius.medium, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupMark: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  groupMarkText: { fontSize: 16, fontWeight: '900' },
  groupCopy: { flex: 1 },
  groupName: { fontSize: 15, fontWeight: '900' },
  groupMeta: { marginTop: 4, fontSize: 11 },
  chevron: { fontSize: 25 },
  empty: { paddingVertical: 28, textAlign: 'center', fontSize: 13 },
});
