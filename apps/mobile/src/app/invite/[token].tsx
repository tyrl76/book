import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useAcceptFriendInvite } from '@/features/social/hooks';
import { useTheme } from '@/hooks/use-theme';

export default function AcceptInviteScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ token: string }>();
  const accept = useAcceptFriendInvite();
  const [friendName, setFriendName] = useState<string | null>(null);
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const acceptInvite = () => {
    if (!token) return;
    accept.mutate(token, { onSuccess: (friend) => setFriendName(friend.nickname) });
  };

  return (
    <Screen contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: '친구 초대' }} />
      <View style={[styles.mark, { backgroundColor: theme.primarySoft }]}>
        <Text style={[styles.markText, { color: theme.primary }]}>책</Text>
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{friendName ? `${friendName}님과 연결됐어요` : '함께 읽을 준비가 됐나요?'}</Text>
      <Text style={[styles.copy, { color: theme.textSecondary }]}>
        {friendName ? '이제 함께 탭에서 서로의 독서 마일스톤을 볼 수 있어요.' : '초대를 수락하면 서로의 공개된 독서 근황을 볼 수 있어요.'}
      </Text>
      {!friendName ? (
        <Pressable
          accessibilityRole="button"
          disabled={!token || accept.isPending}
          onPress={acceptInvite}
          style={[styles.button, { backgroundColor: theme.primary }]}>
          <Text style={[styles.buttonText, { color: theme.inverse }]}>{accept.isPending ? '연결하는 중…' : '초대 수락'}</Text>
        </Pressable>
      ) : null}
      {accept.isError ? <FeedbackBanner title="초대를 수락하지 못했어요" error={accept.error} onAction={acceptInvite} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.five },
  mark: { width: 76, height: 76, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  markText: { fontSize: 28, fontWeight: '900' },
  title: { fontSize: 27, lineHeight: 35, fontWeight: '900', textAlign: 'center' },
  copy: { marginTop: 8, maxWidth: 330, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  button: { marginTop: 24, minWidth: 210, minHeight: 54, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '900' },
});
