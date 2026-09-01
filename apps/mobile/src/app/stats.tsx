import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ProgressBar } from '@/components/product/progress-bar';
import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useAnnualGoal, useReadingStats } from '@/features/account/hooks';
import { useFeedback } from '@/features/feedback/feedback-provider';
import { useTheme } from '@/hooks/use-theme';

function durationLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

export default function StatsScreen() {
  const theme = useTheme();
  const feedback = useFeedback();
  const year = new Date().getFullYear();
  const stats = useReadingStats(year);
  const goal = useAnnualGoal(year);
  const [target, setTarget] = useState<string | null>(null);
  const targetValue = Number(target ?? stats.data?.annualGoalBooks ?? 12);
  const targetValid = Number.isInteger(targetValue) && targetValue >= 1 && targetValue <= 1000;
  const goalProgress = targetValue > 0 ? Math.min(100, ((stats.data?.annualFinishedBooks ?? 0) / targetValue) * 100) : 0;
  const days = stats.data?.calendar.slice(-35) ?? [];
  const maxPages = Math.max(1, ...days.map((day) => day.pages));

  const saveGoal = async () => {
    if (!targetValid) return;
    try {
      await goal.mutateAsync(targetValue);
      setTarget(null);
      feedback.showSuccess('올해의 독서 목표를 저장했어요');
    } catch (error) {
      feedback.showError('목표를 저장하지 못했어요', error, { label: '다시 시도', onPress: () => void saveGoal() });
    }
  };

  return (
    <Screen>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>{year} READING</Text>
        <Text style={[styles.title, { color: theme.text }]}>숫자보다 흐름을 봐요</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>경쟁 순위 없이 나의 독서 리듬만 차분하게 확인합니다.</Text>
      </View>

      {stats.isError ? (
        <FeedbackBanner title="독서 통계를 불러오지 못했어요" error={stats.error} onAction={() => void stats.refetch()} />
      ) : null}

      <View style={[styles.goalCard, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
        <View style={styles.goalTop}>
          <View>
            <Text style={[styles.cardEyebrow, { color: theme.primary }]}>연간 완독 목표</Text>
            <Text style={[styles.goalTitle, { color: theme.text }]}>{stats.data?.annualFinishedBooks ?? 0}권 완독</Text>
          </View>
          <View style={styles.goalInputRow}>
            <TextInput
              accessibilityLabel="연간 완독 목표 권수"
              keyboardType="numeric"
              selectTextOnFocus
              value={String(target ?? stats.data?.annualGoalBooks ?? 12)}
              onChangeText={setTarget}
              style={[styles.goalInput, { color: theme.text, backgroundColor: theme.card, borderColor: targetValid ? theme.border : theme.accent }]}
            />
            <Text style={[styles.goalUnit, { color: theme.textSecondary }]}>권</Text>
          </View>
        </View>
        {!targetValid ? (
          <Text accessibilityLiveRegion="polite" style={[styles.validation, { color: theme.accent }]}>목표는 1권부터 1,000권 사이의 정수로 입력해 주세요.</Text>
        ) : null}
        <ProgressBar value={goalProgress} />
        <View style={styles.goalBottom}>
          <Text style={[styles.goalMeta, { color: theme.textSecondary }]}>{Math.round(goalProgress)}% 달성</Text>
          <Pressable accessibilityRole="button" disabled={!targetValid || goal.isPending} onPress={saveGoal} style={[styles.goalSave, { backgroundColor: theme.primary }]}>
            <Text style={[styles.goalSaveText, { color: theme.inverse }]}>목표 저장</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <StatCard value={`${Math.round(stats.data?.pagesRead ?? 0)}`} label="올해 읽은 쪽" />
        <StatCard value={durationLabel(stats.data?.durationSeconds ?? 0)} label="기록한 시간" />
        <StatCard value={`${stats.data?.currentStreakDays ?? 0}일`} label="현재 연속" />
        <StatCard value={`${stats.data?.longestStreakDays ?? 0}일`} label="최장 연속" />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>최근 독서 달력</Text>
          <Text style={[styles.sectionMeta, { color: theme.textSecondary }]}>최근 기록 35일</Text>
        </View>
        <View style={[styles.calendar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {days.length ? days.map((day) => {
            const strength = Math.max(0.18, day.pages / maxPages);
            return (
              <View key={day.date} accessibilityLabel={`${day.date}, ${Math.round(day.pages)}쪽`} style={styles.dayWrap}>
                <View style={[styles.day, { backgroundColor: theme.primary, opacity: strength }]} />
                <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>{day.date.slice(8)}</Text>
              </View>
            );
          }) : <Text style={[styles.empty, { color: theme.textSecondary }]}>독서 기록을 남기면 여기에 리듬이 쌓여요.</Text>}
        </View>
      </View>
    </Screen>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 29, lineHeight: 37, fontWeight: '900', letterSpacing: -0.9 },
  copy: { fontSize: 14, lineHeight: 21 },
  goalCard: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.four, gap: 14 },
  goalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  cardEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  goalTitle: { marginTop: 4, fontSize: 20, fontWeight: '900' },
  goalInputRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  goalInput: { width: 70, height: 48, borderWidth: 1, borderRadius: Radius.small, textAlign: 'center', fontSize: 18, fontWeight: '900' },
  goalUnit: { fontSize: 13, fontWeight: '800' },
  goalBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  validation: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  goalMeta: { fontSize: 11, fontWeight: '800' },
  goalSave: { minHeight: 44, borderRadius: Radius.pill, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  goalSaveText: { fontSize: 12, fontWeight: '900' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { width: '48%', minHeight: 92, borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three, justifyContent: 'center' },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { marginTop: 5, fontSize: 11 },
  section: { gap: 11 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  sectionMeta: { fontSize: 11, fontWeight: '700' },
  calendar: { minHeight: 120, borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  dayWrap: { width: 29, alignItems: 'center', gap: 3 },
  day: { width: 25, height: 25, borderRadius: 7 },
  dayLabel: { fontSize: 8, fontWeight: '700' },
  empty: { width: '100%', textAlign: 'center', fontSize: 12 },
});
