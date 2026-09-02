import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ProgressBar } from '@/components/product/progress-bar';
import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useAnnualGoal, useReadingStats } from '@/features/account/hooks';
import { useFeedback } from '@/features/feedback/feedback-provider';
import { useTheme } from '@/hooks/use-theme';
import type { DailyReading } from '@/types/domain';

const recentDayCount = 35;
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const seoulOffsetMilliseconds = 9 * 60 * 60 * 1000;

function durationLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

// The API groups reading activity using Asia/Seoul calendar dates. Building the
// key from the UTC timestamp plus Korea's fixed offset avoids device-timezone
// and local daylight-saving boundaries changing which day is considered today.
function seoulDateKey(value = new Date()) {
  return new Date(value.getTime() + seoulOffsetMilliseconds).toISOString().slice(0, 10);
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * millisecondsPerDay).toISOString().slice(0, 10);
}

function recentCalendarDays(items: DailyReading[], today: string) {
  const activityByDate = new Map<string, DailyReading>();
  for (const item of items) {
    const previous = activityByDate.get(item.date);
    activityByDate.set(item.date, previous ? {
      date: item.date,
      pages: previous.pages + item.pages,
      durationSeconds: previous.durationSeconds + item.durationSeconds,
      entries: previous.entries + item.entries,
    } : item);
  }

  return Array.from({ length: recentDayCount }, (_, index) => {
    const date = shiftDateKey(today, index - recentDayCount + 1);
    return activityByDate.get(date) ?? { date, pages: 0, durationSeconds: 0, entries: 0 };
  });
}

function dayAccessibilityLabel(day: DailyReading) {
  const details: string[] = [];
  if (day.pages > 0) details.push(`${Math.round(day.pages)}쪽`);
  if (day.durationSeconds > 0) details.push(`${Math.max(1, Math.round(day.durationSeconds / 60))}분`);
  if (day.entries > 0) details.push(`${day.entries}번 기록`);
  return `${day.date}, ${details.length ? details.join(', ') : '독서 기록 없음'}`;
}

export default function StatsScreen() {
  const theme = useTheme();
  const feedback = useFeedback();
  const today = seoulDateKey();
  const year = Number(today.slice(0, 4));
  const calendarStartYear = Number(shiftDateKey(today, 1 - recentDayCount).slice(0, 4));
  const crossesYearBoundary = calendarStartYear !== year;
  const stats = useReadingStats(year);
  // React Query shares this request with `stats` unless the 35-day window
  // crosses New Year, when the previous year's final days are also required.
  const boundaryStats = useReadingStats(calendarStartYear);
  const goal = useAnnualGoal(year);
  const [target, setTarget] = useState<string | null>(null);
  const savedTarget = stats.data?.annualGoalBooks ?? 0;
  const displayedTarget = savedTarget > 0 ? savedTarget : 12;
  const targetValue = Number(target ?? displayedTarget);
  const targetValid = Number.isInteger(targetValue) && targetValue >= 1 && targetValue <= 1000;
  const goalProgress = targetValue > 0 ? Math.min(100, ((stats.data?.annualFinishedBooks ?? 0) / targetValue) * 100) : 0;
  const calendarItems = crossesYearBoundary
    ? [...(boundaryStats.data?.calendar ?? []), ...(stats.data?.calendar ?? [])]
    : (stats.data?.calendar ?? []);
  const days = recentCalendarDays(calendarItems, today);
  const hasCalendarActivity = days.some((day) => day.pages > 0 || day.durationSeconds > 0 || day.entries > 0);
  const maxPages = Math.max(1, ...days.map((day) => day.pages));
  const maxDuration = Math.max(1, ...days.map((day) => day.durationSeconds));
  const maxEntries = Math.max(1, ...days.map((day) => day.entries));
  const statsError = stats.error ?? (crossesYearBoundary ? boundaryStats.error : null);

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

      {statsError ? (
        <FeedbackBanner
          title="독서 통계를 불러오지 못했어요"
          error={statsError}
          onAction={() => {
            void stats.refetch();
            if (crossesYearBoundary) void boundaryStats.refetch();
          }}
        />
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
              value={String(target ?? displayedTarget)}
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
          <Text style={[styles.sectionMeta, { color: theme.textSecondary }]}>오늘까지 35일</Text>
        </View>
        <View style={[styles.calendar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {days.map((day) => {
            const active = day.pages > 0 || day.durationSeconds > 0 || day.entries > 0;
            const activityRatio = Math.max(
              day.pages / maxPages,
              day.durationSeconds / maxDuration,
              day.entries / maxEntries,
            );
            const strength = 0.22 + activityRatio * 0.78;
            const isToday = day.date === today;
            return (
              <View key={day.date} accessibilityLabel={dayAccessibilityLabel(day)} style={styles.dayWrap}>
                <View style={[
                  styles.day,
                  {
                    backgroundColor: active ? theme.primary : theme.backgroundElement,
                    borderColor: isToday ? theme.primary : 'transparent',
                    opacity: active ? strength : 1,
                  },
                ]} />
                <Text style={[styles.dayLabel, { color: isToday ? theme.primary : theme.textSecondary }]}>
                  {day.date.slice(5).replace('-', '.')}
                </Text>
              </View>
            );
          })}
        </View>
        {!hasCalendarActivity ? <Text style={[styles.empty, { color: theme.textSecondary }]}>독서 기록을 남기면 여기에 리듬이 쌓여요.</Text> : null}
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
  calendar: { minHeight: 216, borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  dayWrap: { width: '14.285%', alignItems: 'center', gap: 3, paddingVertical: 4 },
  day: { width: 25, height: 25, borderWidth: 1, borderRadius: 7 },
  dayLabel: { fontSize: 8, fontWeight: '700' },
  empty: { width: '100%', textAlign: 'center', fontSize: 12 },
});
