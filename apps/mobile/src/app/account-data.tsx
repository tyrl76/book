import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/product/screen';
import { Radius, Spacing } from '@/constants/theme';
import { useDeleteUserData, useExportUserData } from '@/features/account/hooks';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';

export default function AccountDataScreen() {
  const theme = useTheme();
  const auth = useAuth();
  const exportData = useExportUserData();
  const deleteData = useDeleteUserData();
  const [confirmation, setConfirmation] = useState('');

  const shareExport = async () => {
    try {
      const payload = await exportData.mutateAsync();
      await Share.share({ title: '책결 데이터 내보내기', message: payload });
    } catch (error) {
      Alert.alert('데이터를 내보내지 못했어요', error instanceof Error ? error.message : '다시 시도해 주세요');
    }
  };

  const removeAccount = () => {
    if (confirmation !== '계정 삭제') return;
    Alert.alert('정말 계정을 삭제할까요?', '책결 서버의 프로필, 독서 기록, 댓글과 친구 관계가 삭제되며 복구할 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '영구 삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteData.mutateAsync();
            await auth.signOut();
            router.replace('/sign-in');
          } catch (error) {
            Alert.alert('계정을 삭제하지 못했어요', error instanceof Error ? error.message : '다시 시도해 주세요');
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>YOUR DATA</Text>
        <Text style={[styles.title, { color: theme.text }]}>내 기록을 직접 관리해요</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>언제든 독서 기록을 내려받거나 책결 서버에서 삭제할 수 있어요.</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>데이터 내보내기</Text>
        <Text style={[styles.cardCopy, { color: theme.textSecondary }]}>프로필, 독서 회차, 진척 기록과 내가 작성한 댓글을 JSON 형식으로 준비합니다.</Text>
        <Pressable accessibilityRole="button" disabled={exportData.isPending} onPress={shareExport} style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
          <Text style={[styles.primaryButtonText, { color: theme.inverse }]}>{exportData.isPending ? '내보내는 중…' : '내 데이터 공유·저장'}</Text>
        </Pressable>
      </View>

      <View style={[styles.dangerCard, { backgroundColor: theme.card, borderColor: theme.accent }]}>
        <Text style={[styles.cardTitle, { color: theme.accent }]}>계정 영구 삭제</Text>
        <Text style={[styles.cardCopy, { color: theme.textSecondary }]}>삭제 전에 데이터를 내보내는 것을 권장합니다. 요청 즉시 로그아웃되며 서버가 서비스 데이터와 로그인 계정을 함께 삭제합니다. 계속하려면 아래에 “계정 삭제”를 입력하세요.</Text>
        <TextInput
          accessibilityLabel="계정 삭제 확인 문구"
          value={confirmation}
          onChangeText={setConfirmation}
          placeholder="계정 삭제"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: confirmation !== '계정 삭제' || deleteData.isPending }}
          disabled={confirmation !== '계정 삭제' || deleteData.isPending}
          onPress={removeAccount}
          style={[styles.deleteButton, { backgroundColor: confirmation === '계정 삭제' ? theme.accent : theme.backgroundElement }]}>
          <Text style={[styles.deleteText, { color: confirmation === '계정 삭제' ? theme.inverse : theme.textSecondary }]}>{deleteData.isPending ? '삭제 중…' : '계정 영구 삭제'}</Text>
        </Pressable>
      </View>

      <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}>
        <Text style={[styles.noticeTitle, { color: theme.text }]}>소셜 로그인 계정</Text>
        <Text style={[styles.noticeCopy, { color: theme.textSecondary }]}>운영 환경에서는 Supabase Auth 삭제와 서비스 데이터 삭제를 함께 처리합니다. 외부 인증 서비스가 일시적으로 실패하면 계정 접근을 막고 Worker가 삭제를 재시도합니다.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 29, lineHeight: 37, fontWeight: '900', letterSpacing: -0.9 },
  copy: { fontSize: 14, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.four, gap: 9 },
  dangerCard: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.four, gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: '900' },
  cardCopy: { fontSize: 12, lineHeight: 19 },
  primaryButton: { minHeight: 50, marginTop: 6, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontSize: 14, fontWeight: '900' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 14, fontSize: 14 },
  deleteButton: { minHeight: 50, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 14, fontWeight: '900' },
  notice: { borderRadius: Radius.medium, padding: Spacing.three, gap: 5 },
  noticeTitle: { fontSize: 14, fontWeight: '900' },
  noticeCopy: { fontSize: 12, lineHeight: 18 },
});
