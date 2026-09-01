import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useWeeklyReport } from '@/features/groups/hooks';
import { useTheme } from '@/hooks/use-theme';

function durationLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

export default function WeeklyReportScreen() {
  const theme = useTheme();
  const report = useWeeklyReport();
  const item = report.data;
  const cards = [
    { value: `${item?.connectedReadingDays ?? 0}일`, label: '함께 책을 펼친 날' },
    { value: `${item?.activeFriends ?? 0}명`, label: '이번 주 읽은 친구' },
    { value: `${item?.friendUpdates ?? 0}개`, label: '이어진 독서 소식' },
    { value: `${(item?.reactionsSent ?? 0) + (item?.reactionsReceived ?? 0)}개`, label: '주고받은 응원' },
  ];
  return (
    <Screen>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>WEEKLY TOGETHER</Text>
        <Text style={[styles.title, { color: theme.text }]}>우리의 독서 한 주</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>{item ? `${item.weekStart} – ${item.weekEnd}` : '이번 주 기록을 모으는 중…'}</Text>
      </View>
      {report.isError ? (
        <FeedbackBanner title="이번 주 리포트를 불러오지 못했어요" error={report.error} onAction={() => void report.refetch()} />
      ) : null}
      <View style={[styles.hero, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
        <Text style={[styles.heroLabel, { color: theme.primary }]}>나의 독서 시간</Text>
        <Text style={[styles.heroValue, { color: theme.text }]}>{durationLabel(item?.myDurationSeconds ?? 0)}</Text>
        <Text style={[styles.heroCopy, { color: theme.textSecondary }]}>{item?.myFinishedBooks ? `이번 주 ${item.myFinishedBooks}권을 완독했어요.` : '완독하지 않아도 함께 펼친 시간이 남아요.'}</Text>
      </View>
      <View style={styles.grid}>{cards.map((card) => <View key={card.label} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={[styles.value, { color: theme.text }]}>{card.value}</Text><Text style={[styles.label, { color: theme.textSecondary }]}>{card.label}</Text></View>)}</View>
      <View style={[styles.note, { backgroundColor: theme.backgroundElement }]}><Text style={[styles.noteTitle, { color: theme.text }]}>비교보다 동행</Text><Text style={[styles.noteCopy, { color: theme.textSecondary }]}>책결은 순위를 만들지 않습니다. 친구와 같은 날 책을 펼치고 작은 응원을 나눈 순간만 남겨요.</Text></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5 }, eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 }, title: { fontSize: 30, lineHeight: 38, fontWeight: '900', letterSpacing: -1 }, copy: { fontSize: 13 },
  hero: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.four, gap: 5 }, heroLabel: { fontSize: 11, fontWeight: '900' }, heroValue: { fontSize: 34, fontWeight: '900' }, heroCopy: { fontSize: 12, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, card: { width: '48%', minHeight: 104, borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three, justifyContent: 'center' }, value: { fontSize: 23, fontWeight: '900' }, label: { marginTop: 6, fontSize: 11, lineHeight: 16 },
  note: { borderRadius: Radius.medium, padding: Spacing.three, gap: 5 }, noteTitle: { fontSize: 14, fontWeight: '900' }, noteCopy: { fontSize: 12, lineHeight: 18 },
});
