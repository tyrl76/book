import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { BookCover } from '@/components/product/book-cover';
import { ProgressBar } from '@/components/product/progress-bar';
import { Screen } from '@/components/product/screen';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useFeedback } from '@/features/feedback/feedback-provider';
import {
  useFailedCount,
  usePendingCount,
  useReadingRuns,
  useRecordProgress,
  useRetryFailedOperations,
} from '@/features/reading/hooks';
import { useReadingPresence } from '@/features/groups/hooks';
import { useTheme } from '@/hooks/use-theme';

const maxTimerSeconds = 24 * 60 * 60;

type StoredReadingTimer = {
  readingRunID: string;
  startedAt: number | null;
  accumulatedSeconds: number;
};

type RecordConfirmation =
  | { type: 'reset_timer' }
  | { type: 'switch_run'; nextRunID: string };

function formatTimer(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function restoreReadingTimer(userID: string | null): StoredReadingTimer | null {
  if (!userID) return null;
  const storageKey = `bookgyeol.reading-timer.${userID}`;
  try {
    const raw = globalThis.localStorage?.getItem(storageKey);
    if (!raw) return null;
    const saved = JSON.parse(raw) as StoredReadingTimer;
    const validStartedAt = saved.startedAt === null || (Number.isFinite(saved.startedAt) && saved.startedAt <= Date.now());
    const validAccumulated = Number.isFinite(saved.accumulatedSeconds) && saved.accumulatedSeconds >= 0;
    const runningSeconds = saved.startedAt === null ? 0 : Math.floor((Date.now() - saved.startedAt) / 1000);
    if (typeof saved.readingRunID === 'string' && validStartedAt && validAccumulated && saved.accumulatedSeconds + runningSeconds <= maxTimerSeconds) {
      return { ...saved, accumulatedSeconds: Math.floor(saved.accumulatedSeconds) };
    }
  } catch {
    // Invalid or unavailable storage is handled by starting with an empty timer.
  }
  try {
    globalThis.localStorage?.removeItem(storageKey);
  } catch {
    // Nothing else is required when storage cannot be cleaned up.
  }
  return null;
}

export default function RecordScreen() {
  const theme = useTheme();
  const feedback = useFeedback();
  const params = useLocalSearchParams<{ runID?: string }>();
  const requestedRunID = Array.isArray(params.runID) ? params.runID[0] : params.runID;
  const { width } = useWindowDimensions();
  const compact = width < 520;
  const { userID } = useAuth();
  const runs = useReadingRuns();
  const pending = usePendingCount();
  const failed = useFailedCount();
  const retryFailed = useRetryFailedOperations();
  const presence = useReadingPresence();
  const record = useRecordProgress();
  const [restoredTimer] = useState<StoredReadingTimer | null>(() => restoreReadingTimer(userID));
  const activeRuns = (runs.data ?? []).filter((run) => run.status === 'reading' || run.status === 'paused');
  const [selectedRunID, setSelectedRunID] = useState<string | null>(restoredTimer?.readingRunID ?? requestedRunID ?? null);
  const currentRun = activeRuns.find((run) => run.id === selectedRunID) ?? activeRuns[0];
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [timerRunID, setTimerRunID] = useState<string | null>(restoredTimer?.readingRunID ?? null);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(restoredTimer?.startedAt ?? null);
  const [timerAccumulated, setTimerAccumulated] = useState(restoredTimer?.accumulatedSeconds ?? 0);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [confirmation, setConfirmation] = useState<RecordConfirmation | null>(null);
  const timerAppliesToCurrentRun = Boolean(currentRun && currentRun.id === timerRunID);
  const activeTimerStartedAt = timerAppliesToCurrentRun ? timerStartedAt : null;
  const activeTimerAccumulated = timerAppliesToCurrentRun ? timerAccumulated : 0;

  useEffect(() => {
    if (!userID || !runs.data) return;
    const storageKey = `bookgyeol.reading-timer.${userID}`;
    try {
      const timerRunExists = timerRunID && runs.data.some(
        (run) => run.id === timerRunID && (run.status === 'reading' || run.status === 'paused'),
      );
      if (!timerRunExists || (timerStartedAt === null && timerAccumulated === 0)) {
        globalThis.localStorage?.removeItem(storageKey);
        return;
      }
      globalThis.localStorage?.setItem(storageKey, JSON.stringify({
        readingRunID: timerRunID,
        startedAt: timerStartedAt,
        accumulatedSeconds: timerAccumulated,
      } satisfies StoredReadingTimer));
    } catch {
      // Timer still works for this session if local storage is unavailable.
    }
  }, [runs.data, timerAccumulated, timerRunID, timerStartedAt, userID]);

  useEffect(() => {
    if (activeTimerStartedAt === null) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const nextElapsed = activeTimerAccumulated + Math.max(0, Math.floor((now - activeTimerStartedAt) / 1000));
      setTimerNow(now);
      if (nextElapsed >= maxTimerSeconds) {
        setTimerAccumulated(maxTimerSeconds);
        setTimerStartedAt(null);
        if (timerRunID) presence.mutate({ readingRunID: timerRunID, active: false });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeTimerAccumulated, activeTimerStartedAt, presence, timerRunID]);

  const elapsedSeconds = Math.min(
    maxTimerSeconds,
    activeTimerAccumulated + (activeTimerStartedAt === null ? 0 : Math.max(0, Math.floor((timerNow - activeTimerStartedAt) / 1000))),
  );
  const timerLabel = formatTimer(elapsedSeconds);

  const value = draftValue ?? (currentRun ? String(currentRun.currentValue) : '');
  const numericValue = Number(value);
  const unit = currentRun?.progressBasis === 'pages' ? '쪽' : currentRun?.progressBasis === 'audio_seconds' ? '초' : '%';
  const step = currentRun?.progressBasis === 'pages' ? 10 : currentRun?.progressBasis === 'audio_seconds' ? 60 : 5;
  const isValid = Boolean(
    currentRun && value.trim() !== '' && Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= currentRun.totalValue,
  );
  const validationError = !currentRun || value.trim() === ''
    ? null
    : !Number.isFinite(numericValue)
      ? '숫자로 입력해 주세요.'
      : numericValue < 0 || numericValue > currentRun.totalValue
        ? `0부터 ${currentRun.totalValue}${unit} 사이로 입력해 주세요.`
        : null;
  const draftPercent = currentRun && Number.isFinite(numericValue) && currentRun.totalValue > 0
    ? Math.round((numericValue / currentRun.totalValue) * 100)
    : 0;
  const hasMeaningfulEntry = Boolean(
    currentRun && (
      numericValue !== currentRun.currentValue ||
      note.trim().length > 0 ||
      elapsedSeconds > 0
    ),
  );
  const canSave = isValid && hasMeaningfulEntry;
  const sharingCopy = !currentRun?.autoShare
    ? '자동 공유 꺼짐 · 이 메모는 내 기록에만 저장돼요'
    : currentRun.visibility === 'private'
      ? '나만 공개 · 이 메모는 내 기록에만 저장돼요'
      : currentRun.visibility === 'group'
        ? '선택한 독서 모임 공개 · 마일스톤을 넘을 때 공유돼요'
        : currentRun.visibility === 'public'
          ? '책결 전체 공개 · 마일스톤을 넘을 때 공유돼요'
          : '친구 공개 · 마일스톤을 넘을 때 공유돼요';

  const save = async () => {
    if (!currentRun || !canSave) return;
    try {
      const summary = await record.mutateAsync({
        readingRunId: currentRun.id,
        currentValue: numericValue,
        previousValue: currentRun.currentValue,
        note,
        durationSeconds: elapsedSeconds,
      });
      setDraftValue(null);
      setNote('');
      setTimerRunID(null);
      setTimerStartedAt(null);
      setTimerAccumulated(0);
      presence.mutate({ readingRunID: currentRun.id, active: false });
      feedback.showSuccess(
        summary.synced > 0 ? '기록했어요' : '기기에 안전하게 저장했어요',
        summary.synced > 0 ? '친구 피드에도 곧 반영됩니다.' : '연결이 돌아오면 자동으로 동기화합니다.',
      );
    } catch (error) {
      feedback.showError('기록을 저장하지 못했어요', error, { label: '다시 시도', onPress: () => void save() });
    }
  };

  const retrySync = async () => {
    try {
      const summary = await retryFailed.mutateAsync();
      feedback.showSuccess(
        summary.failed > 0 ? '일부 기록은 아직 보내지 못했어요' : '동기화를 완료했어요',
        summary.failed > 0 ? `실패한 기록 ${summary.failed}개는 다음 연결 때 다시 시도합니다.` : '저장한 기록이 서버에 반영됐어요.',
      );
    } catch (error) {
      feedback.showError('동기화를 다시 시작하지 못했어요', error, { label: '다시 시도', onPress: () => void retrySync() });
    }
  };

  const confirmTimerReset = () => {
    if (!currentRun || elapsedSeconds === 0) return;
    setConfirmation({ type: 'reset_timer' });
  };

  const resetTimer = () => {
    if (currentRun) presence.mutate({ readingRunID: currentRun.id, active: false });
    setTimerRunID(null);
    setTimerStartedAt(null);
    setTimerAccumulated(0);
    setConfirmation(null);
  };

  const applyRunSelection = (nextRunID: string) => {
    if (currentRun && elapsedSeconds > 0) {
      presence.mutate({ readingRunID: currentRun.id, active: false });
      setTimerRunID(null);
      setTimerStartedAt(null);
      setTimerAccumulated(0);
    }
    setSelectedRunID(nextRunID);
    setDraftValue(null);
    setNote('');
    setConfirmation(null);
  };

  const selectRun = (nextRunID: string) => {
    if (nextRunID === currentRun?.id) return;
    if (elapsedSeconds === 0) {
      applyRunSelection(nextRunID);
      return;
    }
    setConfirmation({ type: 'switch_run', nextRunID });
  };

  return (
    <Screen>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>MY READING</Text>
          <Text style={[styles.title, { color: theme.text }]}>오늘의 독서 기록</Text>
          <Text style={[styles.intro, { color: theme.textSecondary }]}>읽은 만큼만 가볍게 남겨보세요.</Text>
        </View>
        <View style={[styles.headerActions, compact && styles.headerActionsCompact]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="책 검색해서 추가"
            onPress={() => router.push('/book-search')}
            style={({ pressed }) => [
              styles.actionButton,
              compact && styles.actionButtonCompact,
              { backgroundColor: theme.primary, opacity: pressed ? 0.72 : 1 },
            ]}>
            <Text style={[styles.primaryActionText, { color: theme.inverse }]}>＋ 책 추가</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ISBN 바코드 스캔"
            onPress={() => router.push('/scan')}
            style={({ pressed }) => [
              styles.actionButton,
              compact && styles.actionButtonCompact,
              { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.72 : 1 },
            ]}>
            <Text style={[styles.secondaryActionText, { color: theme.primary }]}>▣ ISBN</Text>
          </Pressable>
        </View>
      </View>

      {runs.syncError ? (
        <FeedbackBanner
          compact
          tone="warning"
          title="저장된 책 목록을 표시하고 있어요"
          error={runs.syncError}
          actionLabel="다시 연결"
          onAction={() => void runs.refetch()}
        />
      ) : null}
      {runs.isError ? (
        <FeedbackBanner title="기록할 책을 불러오지 못했어요" error={runs.error} onAction={() => void runs.refetch()} />
      ) : null}

      {(pending.data ?? 0) > 0 ? (
        <View style={[styles.syncBanner, { backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.syncText, { color: theme.primary }]}>↻ 연결되면 동기화할 기록 {pending.data}개</Text>
        </View>
      ) : null}

      {(failed.data ?? 0) > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`동기화 실패 기록 ${failed.data}개 다시 시도`}
          onPress={() => void retrySync()}
          style={[styles.failedBanner, { backgroundColor: theme.backgroundElement, borderColor: theme.accent }]}>
          <Text style={[styles.failedText, { color: theme.accent }]}>동기화 실패 {failed.data}개 · 다시 시도</Text>
        </Pressable>
      ) : null}

      {currentRun && activeRuns.length > 1 ? (
        <View style={styles.runPickerSection}>
          <Text style={[styles.label, { color: theme.text }]}>기록할 책</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.runPicker}>
            {activeRuns.map((run) => {
              const selected = run.id === currentRun.id;
              return (
                <Pressable
                  key={run.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${run.title} 선택`}
                  onPress={() => selectRun(run.id)}
                  style={[
                    styles.runChoice,
                    {
                      backgroundColor: selected ? theme.primarySoft : theme.card,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}>
                  <Text numberOfLines={1} style={[styles.runChoiceText, { color: selected ? theme.primary : theme.text }]}>
                    {run.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {currentRun ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.bookPanel, { backgroundColor: theme.primarySoft }]}>
            <View style={styles.bookRow}>
              <BookCover title={currentRun.title} color={currentRun.coverColor} />
              <View style={styles.bookInfo}>
                <View style={styles.readingLabelRow}>
                  <View style={[styles.readingDot, { backgroundColor: theme.accent }]} />
                  <Text style={[styles.readingLabel, { color: theme.primary }]}>
                    {currentRun.status === 'paused' ? '잠시 멈춤' : '읽는 중'}
                  </Text>
                </View>
                <Text numberOfLines={2} style={[styles.bookTitle, { color: theme.text }]}>{currentRun.title}</Text>
                <Text style={[styles.author, { color: theme.textSecondary }]}>{currentRun.author}</Text>
                <ProgressBar value={currentRun.normalizedProgress / 100} />
                <View style={styles.progressMeta}>
                  <Text style={[styles.progressCopy, { color: theme.primary }]}>{Math.round(currentRun.normalizedProgress / 100)}%</Text>
                  <Text style={[styles.progressValue, { color: theme.textSecondary }]}>
                    {currentRun.currentValue}/{currentRun.totalValue}{unit}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={[styles.timerCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View>
                <Text style={[styles.timerEyebrow, { color: theme.textSecondary }]}>독서 타이머</Text>
                <Text accessibilityLiveRegion="polite" style={[styles.timerValue, { color: theme.text }]}>{timerLabel}</Text>
              </View>
              <View style={styles.timerActions}>
                {activeTimerStartedAt === null && elapsedSeconds > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="독서 타이머 초기화"
                    onPress={confirmTimerReset}
                    style={[styles.timerResetButton, { borderColor: theme.border }]}>
                    <Text style={[styles.timerResetText, { color: theme.textSecondary }]}>초기화</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={activeTimerStartedAt === null ? '독서 타이머 시작' : '독서 타이머 일시 정지'}
                  onPress={() => {
                    if (activeTimerStartedAt === null) {
                      const now = Date.now();
                      if (!timerAppliesToCurrentRun) setTimerAccumulated(0);
                      setTimerRunID(currentRun.id);
                      setTimerNow(now);
                      setTimerStartedAt(now);
                      presence.mutate({ readingRunID: currentRun.id, active: true });
                    } else {
                      setTimerAccumulated(elapsedSeconds);
                      setTimerStartedAt(null);
                      presence.mutate({ readingRunID: currentRun.id, active: false });
                    }
                  }}
                  style={[
                    styles.timerButton,
                    {
                      backgroundColor: activeTimerStartedAt === null ? theme.primary : theme.card,
                      borderColor: theme.border,
                    },
                  ]}>
                  <Text style={[styles.timerButtonText, { color: activeTimerStartedAt === null ? theme.inverse : theme.primary }]}>
                    {activeTimerStartedAt === null ? (elapsedSeconds > 0 ? '계속' : '시작') : '일시 정지'}
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.text }]}>어디까지 읽었나요?</Text>
              <Text style={[styles.labelHint, { color: theme.textSecondary }]}>최대 {currentRun.totalValue}{unit}</Text>
            </View>
            <View style={styles.valueRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${step}${unit} 줄이기`}
                onPress={() => setDraftValue(String(Math.max(0, (numericValue || 0) - step)))}
                style={({ pressed }) => [styles.stepButton, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={[styles.stepText, { color: theme.text }]}>−{step}</Text>
              </Pressable>
              <View style={[styles.valueInputWrap, { borderColor: validationError ? theme.accent : theme.border, backgroundColor: theme.background }]}>
                <TextInput
                  accessibilityLabel="현재 읽은 분량"
                  value={value}
                  onChangeText={setDraftValue}
                  keyboardType="numeric"
                  selectTextOnFocus
                  style={[styles.valueInput, { color: theme.text }]}
                />
                <Text style={[styles.unit, { color: theme.textSecondary }]}>{unit}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${step}${unit} 늘리기`}
                onPress={() => setDraftValue(String(Math.min(currentRun.totalValue, (numericValue || 0) + step)))}
                style={({ pressed }) => [styles.stepButton, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={[styles.stepText, { color: theme.text }]}>+{step}</Text>
              </Pressable>
            </View>
            {validationError ? (
              <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: theme.accent }]}>{validationError}</Text>
            ) : null}

            <View style={styles.quickRow}>
              {[25, 50, 75, 100].map((percent) => {
                const selected = draftPercent === percent;
                return (
                  <Pressable
                    key={percent}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`전체의 ${percent}%로 설정`}
                    onPress={() => setDraftValue(String(Math.round((currentRun.totalValue * percent) / 100)))}
                    style={({ pressed }) => [
                      styles.quick,
                      {
                        borderColor: selected ? theme.primary : theme.border,
                        backgroundColor: selected ? theme.primarySoft : theme.card,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <Text style={[styles.quickText, { color: selected ? theme.primary : theme.textSecondary }]}>{percent}%</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.text }]}>한 줄 메모 <Text style={{ color: theme.textSecondary }}>· 선택</Text></Text>
              <Text style={[styles.labelHint, { color: theme.textSecondary }]}>{note.length}/280</Text>
            </View>
            <TextInput
              accessibilityLabel="독서 한 줄 메모"
              value={note}
              onChangeText={setNote}
              maxLength={280}
              multiline
              placeholder="지금 떠오른 생각을 가볍게 남겨보세요"
              placeholderTextColor={theme.textSecondary}
              style={[styles.noteInput, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            />
            <Text style={[styles.privacy, { color: theme.textSecondary }]}>{sharingCopy}</Text>
          </View>

          {isValid && !hasMeaningfulEntry ? (
            <Text accessibilityLiveRegion="polite" style={[styles.saveHint, { color: theme.textSecondary }]}>
              진척을 바꾸거나 메모 또는 독서 시간을 남기면 저장할 수 있어요.
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave || record.isPending }}
            disabled={!canSave || record.isPending}
            onPress={save}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: canSave ? theme.primary : theme.backgroundElement, opacity: pressed ? 0.76 : 1 },
            ]}>
            <Text style={[styles.saveText, { color: canSave ? theme.inverse : theme.textSecondary }]}>
              {record.isPending ? '저장 중…' : '오늘의 기록 저장'}
            </Text>
          </Pressable>
        </View>
      ) : runs.isFetching ? (
        <ActivityIndicator accessibilityLabel="기록할 책 불러오는 중" color={theme.primary} style={styles.loader} />
      ) : !runs.isError ? (
        <View style={[styles.emptyWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>지금 읽는 책을 추가해 보세요</Text>
          <Text style={[styles.empty, { color: theme.textSecondary }]}>제목으로 찾거나 ISBN 바코드를 스캔할 수 있어요.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/book-search')}
            style={[styles.emptyButton, { backgroundColor: theme.primary }]}>
            <Text style={[styles.saveText, { color: theme.inverse }]}>책 찾기</Text>
          </Pressable>
        </View>
      ) : null}
      <ConfirmDialog
        visible={Boolean(confirmation)}
        title={confirmation?.type === 'switch_run' ? '타이머를 초기화하고 책을 바꿀까요?' : '타이머를 초기화할까요?'}
        message={
          confirmation?.type === 'switch_run'
            ? '현재 측정한 독서 시간은 아직 기록되지 않았어요. 취소하면 이 책에서 계속 기록할 수 있습니다.'
            : '측정한 독서 시간만 0으로 돌아가며 진척값과 메모는 유지됩니다.'
        }
        confirmLabel={confirmation?.type === 'switch_run' ? '초기화하고 전환' : '초기화'}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation?.type === 'switch_run') applyRunSelection(confirmation.nextRunID);
          else resetTimer();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.three },
  headerCompact: { flexDirection: 'column' },
  headerCopy: { flex: 1, gap: 4 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { fontSize: 32, lineHeight: 40, fontWeight: '900', letterSpacing: -1.1 },
  intro: { fontSize: 13, lineHeight: 19 },
  headerActions: { flexDirection: 'row', gap: 7 },
  headerActionsCompact: { width: '100%' },
  actionButton: { minHeight: 46, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  actionButtonCompact: { flex: 1 },
  primaryActionText: { fontSize: 13, fontWeight: '900' },
  secondaryActionText: { fontSize: 13, fontWeight: '900' },
  syncBanner: { padding: 12, borderRadius: Radius.small },
  syncText: { fontSize: 13, fontWeight: '800' },
  failedBanner: { borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 14, paddingVertical: 12 },
  failedText: { fontSize: 13, fontWeight: '900' },
  runPickerSection: { gap: 9 },
  runPicker: { gap: 8, paddingRight: Spacing.four },
  runChoice: { minHeight: 44, maxWidth: 210, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 16, justifyContent: 'center' },
  runChoiceText: { fontSize: 13, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: Radius.large, padding: 10, gap: Spacing.four },
  bookPanel: { padding: Spacing.three, borderRadius: Radius.medium },
  bookRow: { flexDirection: 'row', gap: Spacing.three },
  bookInfo: { flex: 1, justifyContent: 'center', gap: 6 },
  readingLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readingDot: { width: 6, height: 6, borderRadius: 3 },
  readingLabel: { fontSize: 11, fontWeight: '900' },
  bookTitle: { fontSize: 20, lineHeight: 25, fontWeight: '900', letterSpacing: -0.5 },
  author: { fontSize: 13 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  progressCopy: { fontSize: 12, fontWeight: '900' },
  progressValue: { fontSize: 11, fontWeight: '700' },
  formSection: { gap: 10, paddingHorizontal: 6 },
  timerCard: { minHeight: 82, borderWidth: 1, borderRadius: Radius.medium, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timerEyebrow: { fontSize: 11, fontWeight: '800' },
  timerValue: { marginTop: 3, fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  timerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  timerResetButton: { minHeight: 42, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  timerResetText: { fontSize: 11, fontWeight: '800' },
  timerButton: { minWidth: 92, minHeight: 46, borderWidth: 1, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  timerButtonText: { fontSize: 14, fontWeight: '900' },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  label: { flex: 1, fontSize: 15, fontWeight: '900' },
  labelHint: { fontSize: 11, fontWeight: '700' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: { minWidth: 60, height: 54, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  stepText: { fontSize: 14, fontWeight: '900' },
  valueInputWrap: { flex: 1, minWidth: 0, height: 58, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center' },
  valueInput: { flex: 1, minWidth: 0, textAlign: 'right', fontSize: 24, fontWeight: '900', paddingHorizontal: 8 },
  unit: { paddingRight: 14, fontSize: 14 },
  errorText: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  quickRow: { flexDirection: 'row', gap: 7 },
  quick: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: Radius.small, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 12, fontWeight: '800' },
  noteInput: { minHeight: 102, borderWidth: 1, borderRadius: 16, padding: 14, textAlignVertical: 'top', fontSize: 15, lineHeight: 22 },
  privacy: { fontSize: 12, lineHeight: 17 },
  saveHint: { marginTop: -4, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  saveButton: { height: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center', margin: 6 },
  saveText: { fontSize: 15, fontWeight: '900' },
  emptyWrap: { alignItems: 'center', borderWidth: 1, borderRadius: Radius.large, paddingVertical: 60, paddingHorizontal: Spacing.four, gap: 9 },
  emptyTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  empty: { textAlign: 'center', fontSize: 14, lineHeight: 21 },
  emptyButton: { marginTop: 10, minHeight: 48, paddingHorizontal: 24, borderRadius: 14, justifyContent: 'center' },
  loader: { paddingVertical: 64 },
});
