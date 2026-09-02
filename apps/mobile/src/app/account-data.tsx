import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/product/screen';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useDeleteUserData, useExportUserData, useStorageStatus } from '@/features/account/hooks';
import { useAuth } from '@/features/auth/auth-provider';
import { useFeedback } from '@/features/feedback/feedback-provider';
import { useFailedCount, usePendingCount } from '@/features/reading/hooks';
import { useTheme } from '@/hooks/use-theme';

export default function AccountDataScreen() {
  const theme = useTheme();
  const feedback = useFeedback();
  const auth = useAuth();
  const exportData = useExportUserData();
  const deleteData = useDeleteUserData();
  const storageStatus = useStorageStatus();
  const pendingCount = usePendingCount();
  const failedCount = useFailedCount();
  const [confirmation, setConfirmation] = useState('');
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);

  const shareExport = async () => {
    try {
      const payload = await exportData.mutateAsync();
      await Share.share({ title: '책결 데이터 내보내기', message: payload });
    } catch (error) {
      feedback.showError('데이터를 내보내지 못했어요', error, { label: '다시 시도', onPress: () => void shareExport() });
    }
  };

  const removeAccount = () => {
    if (confirmation !== '계정 삭제') return;
    setDeleteDialogVisible(true);
  };

  const confirmRemoveAccount = async () => {
    if (confirmation !== '계정 삭제' || deleteData.isPending) return;
    try {
      await deleteData.mutateAsync();
      setDeleteDialogVisible(false);
      await auth.signOut();
      router.replace('/sign-in');
    } catch (error) {
      setDeleteDialogVisible(false);
      feedback.showError('계정을 삭제하지 못했어요', error, { label: '다시 확인', onPress: removeAccount });
    }
  };

  return (
    <Screen>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>YOUR DATA</Text>
        <Text style={[styles.title, { color: theme.text }]}>내 기록을 직접 관리해요</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>언제든 독서 기록을 내려받거나 책결 서버에서 삭제할 수 있어요.</Text>
      </View>

      {storageStatus.isError ? (
        <FeedbackBanner compact title="서버 저장 상태를 확인하지 못했어요" error={storageStatus.error} onAction={() => void storageStatus.refetch()} />
      ) : null}

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.statusHeading}>
          <View style={[styles.statusDot, { backgroundColor: storageStatus.data?.connected ? theme.primary : theme.accent }]} />
          <View style={styles.statusCopy}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {storageStatus.data?.connected ? '서버에 안전하게 저장 중' : '저장소 연결 확인 필요'}
            </Text>
            <Text style={[styles.accountEmail, { color: theme.textSecondary }]}>{auth.session?.user.email}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => storageStatus.refetch()} style={[styles.refreshButton, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.refreshText, { color: theme.primary }]}>새로고침</Text>
          </Pressable>
        </View>
        {storageStatus.data ? (
          <>
            <View style={styles.countRow}>
              <StatusCount label="독서 회차" value={storageStatus.data.readingRuns} color={theme.text} secondary={theme.textSecondary} />
              <StatusCount label="진척 기록" value={storageStatus.data.progressEntries} color={theme.text} secondary={theme.textSecondary} />
              <StatusCount label="피드·댓글" value={storageStatus.data.feedEvents + storageStatus.data.comments} color={theme.text} secondary={theme.textSecondary} />
            </View>
            <Text style={[styles.savedAt, { color: theme.textSecondary }]}>최근 DB 반영 {new Date(storageStatus.data.lastSavedAt).toLocaleString('ko-KR')}</Text>
          </>
        ) : (
          <Text style={[styles.cardCopy, { color: theme.textSecondary }]}>
            {storageStatus.isLoading ? '서버 저장 상태를 확인하고 있어요…' : storageStatus.error instanceof Error ? storageStatus.error.message : '서버에 연결하지 못했습니다.'}
          </Text>
        )}
        <View style={[styles.queue, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.queueText, { color: theme.textSecondary }]}>휴대폰 대기 {pendingCount.data ?? 0}건 · 실패 {failedCount.data ?? 0}건</Text>
          <Text style={[styles.queueText, { color: theme.textSecondary }]}>로그인 세션은 Android 보안 저장소에서 보호됩니다.</Text>
        </View>
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
        <Text style={[styles.noticeTitle, { color: theme.text }]}>개인 서버 계정</Text>
        <Text style={[styles.noticeCopy, { color: theme.textSecondary }]}>관리자가 이 개인 서버에 테스트 계정을 추가할 수 있어요. 계정별 비밀번호 원문과 로그인 토큰 원문은 저장하지 않고 검증용 해시만 안전하게 보관합니다.</Text>
      </View>
      <ConfirmDialog
        visible={deleteDialogVisible}
        title="정말 계정을 삭제할까요?"
        message="책결 서버의 프로필, 독서 기록, 댓글과 친구 관계가 삭제되며 복구할 수 없습니다."
        confirmLabel="영구 삭제"
        pending={deleteData.isPending}
        pendingLabel="삭제 중…"
        onCancel={() => setDeleteDialogVisible(false)}
        onConfirm={() => void confirmRemoveAccount()}
      />
    </Screen>
  );
}

function StatusCount({ label, value, color, secondary }: { label: string; value: number; color: string; secondary: string }) {
  return (
    <View style={styles.countItem}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={[styles.countLabel, { color: secondary }]}>{label}</Text>
    </View>
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
  statusHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusCopy: { flex: 1, gap: 2 },
  accountEmail: { fontSize: 11 },
  refreshButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: Radius.small, alignItems: 'center', justifyContent: 'center' },
  refreshText: { fontSize: 11, fontWeight: '900' },
  countRow: { flexDirection: 'row', gap: 8, marginTop: 5 },
  countItem: { flex: 1, gap: 2 },
  countValue: { fontSize: 20, fontWeight: '900' },
  countLabel: { fontSize: 10 },
  savedAt: { fontSize: 10 },
  queue: { borderRadius: Radius.small, padding: 10, gap: 3 },
  queueText: { fontSize: 10, lineHeight: 15 },
});
