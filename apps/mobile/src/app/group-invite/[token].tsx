import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useAcceptGroupInvite } from '@/features/groups/hooks';
import { useTheme } from '@/hooks/use-theme';

export default function AcceptGroupInviteScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ token: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const accept = useAcceptGroupInvite();
  const [groupName, setGroupName] = useState<string | null>(null);
  const acceptInvite = () => {
    if (!token) return;
    accept.mutate(token, { onSuccess: (group) => setGroupName(group.name) });
  };
  return (
    <Screen contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: '그룹 초대' }} />
      <View style={[styles.mark, { backgroundColor: theme.primarySoft }]}><Text style={[styles.markText, { color: theme.primary }]}>함</Text></View>
      <Text style={[styles.title, { color: theme.text }]}>{groupName ? `“${groupName}”에 참여했어요` : '독서 그룹에 함께할까요?'}</Text>
      <Text style={[styles.copy, { color: theme.textSecondary }]}>{groupName ? '그룹 멤버들의 공개된 독서 흐름을 확인해 보세요.' : '초대를 수락하면 최대 20명의 가까운 사람과 느슨하게 함께 읽을 수 있어요.'}</Text>
      {!groupName ? <Pressable accessibilityRole="button" disabled={!token || accept.isPending} onPress={acceptInvite} style={[styles.button, { backgroundColor: theme.primary }]}><Text style={[styles.buttonText, { color: theme.inverse }]}>{accept.isPending ? '참여하는 중…' : '그룹 초대 수락'}</Text></Pressable> : null}
      {accept.isError ? <FeedbackBanner title="그룹 초대를 수락하지 못했어요" error={accept.error} onAction={acceptInvite} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.five },
  mark: { width: 76, height: 76, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  markText: { fontSize: 26, fontWeight: '900' },
  title: { fontSize: 27, lineHeight: 35, fontWeight: '900', textAlign: 'center' },
  copy: { marginTop: 8, maxWidth: 330, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  button: { marginTop: 24, minWidth: 210, minHeight: 54, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '900' },
});
