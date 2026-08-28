import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { BookCover } from '@/components/product/book-cover';
import { ProgressBar } from '@/components/product/progress-bar';
import { Screen } from '@/components/product/screen';
import { Radius, Spacing } from '@/constants/theme';
import { useGroups } from '@/features/groups/hooks';
import { useDeleteReadingRun, useProgressEntries, useReadingRuns, useUpdateReadingRun } from '@/features/reading/hooks';
import { useTheme } from '@/hooks/use-theme';
import type { ReadingRun } from '@/types/domain';

const statuses: { value: ReadingRun['status']; label: string }[] = [
  { value: 'want_to_read', label: '읽고 싶음' },
  { value: 'reading', label: '읽는 중' },
  { value: 'paused', label: '잠시 멈춤' },
  { value: 'finished', label: '완독' },
  { value: 'dnf', label: '중단' },
];

const visibilities: { value: ReadingRun['visibility']; label: string }[] = [
  { value: 'private', label: '나만' },
  { value: 'friends', label: '친구' },
  { value: 'public', label: '전체 공개' },
];

const precisions: { value: ReadingRun['progressPrecision']; label: string }[] = [
  { value: 'hidden', label: '진척 숨김' },
  { value: 'milestone', label: '마일스톤만' },
  { value: 'exact', label: '정확히' },
];

function durationLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

export default function BookDetailScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ runID: string }>();
  const runID = Array.isArray(params.runID) ? params.runID[0] : params.runID;
  const runs = useReadingRuns();
  const run = (runs.data ?? []).find((item) => item.id === runID);
  const entries = useProgressEntries(runID ?? '');
  const groups = useGroups();
  const update = useUpdateReadingRun();
  const remove = useDeleteReadingRun();

  const change = (input: Partial<Pick<ReadingRun, 'status' | 'visibility' | 'shareGroupId' | 'progressPrecision' | 'autoShare'>>) => {
    if (!runID) return;
    update.mutate({ readingRunID: runID, input }, {
      onError: (error) => Alert.alert('책 설정을 바꾸지 못했어요', error.message),
    });
  };

  const confirmRemove = () => {
    if (!runID || !run) return;
    Alert.alert(
      '책장에서 제거할까요?',
      `「${run.title}」의 진척 기록과 공유된 독서 소식이 함께 삭제됩니다. 이 작업은 되돌릴 수 없어요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '제거',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove.mutateAsync(runID);
              router.dismissTo('/library');
            } catch (error) {
              Alert.alert('책을 제거하지 못했어요', error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.');
            }
          },
        },
      ],
    );
  };

  if (!run) {
    return (
      <Screen contentContainerStyle={styles.center}>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>{runs.isFetching ? '책을 불러오는 중…' : '책을 찾을 수 없어요'}</Text>
      </Screen>
    );
  }

  const unit = run.progressBasis === 'pages' ? '쪽' : run.progressBasis === 'audio_seconds' ? '초' : '%';

  return (
    <Screen>
      <Stack.Screen options={{ title: run.title }} />
      <View style={[styles.hero, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
        <BookCover title={run.title} color={run.coverColor} />
        <View style={styles.heroCopy}>
          <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{run.title}</Text>
          <Text style={[styles.author, { color: theme.textSecondary }]}>{run.author}</Text>
          <ProgressBar value={run.normalizedProgress / 100} />
          <Text style={[styles.progress, { color: theme.primary }]}>{Math.round(run.normalizedProgress / 100)}% · {run.currentValue}/{run.totalValue}{unit}</Text>
        </View>
      </View>

      <ChoiceSection title="독서 상태" items={statuses} selected={run.status} onSelect={(status) => change({ status })} />
      <ChoiceSection title="공개 범위" items={visibilities} selected={run.visibility} onSelect={(visibility) => change({ visibility })} />
      {(groups.data?.length ?? 0) > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>독서 모임에만 공유</Text>
          <Text style={[styles.sectionCopy, { color: theme.textSecondary }]}>선택한 모임 구성원에게만 다음 마일스톤이 보여요.</Text>
          <View style={styles.choices}>
            {groups.data?.map((group) => {
              const active = run.visibility === 'group' && run.shareGroupId === group.id;
              return (
                <Pressable
                  key={group.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => change({ visibility: 'group', shareGroupId: group.id })}
                  style={[styles.choice, { backgroundColor: active ? theme.primarySoft : theme.card, borderColor: active ? theme.primary : theme.border }]}>
                  <Text style={[styles.choiceText, { color: active ? theme.primary : theme.textSecondary }]}>{group.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <ChoiceSection title="진척 공개" items={precisions} selected={run.progressPrecision} onSelect={(progressPrecision) => change({ progressPrecision })} />

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: run.autoShare }}
        onPress={() => change({ autoShare: !run.autoShare })}
        style={[styles.switchRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.switchCopy}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>마일스톤 자동 공유</Text>
          <Text style={[styles.sectionCopy, { color: theme.textSecondary }]}>25·50·75%와 완독 소식을 선택한 범위에 공유해요.</Text>
        </View>
        <View style={[styles.switchTrack, { backgroundColor: run.autoShare ? theme.primary : theme.backgroundElement }]}>
          <View style={[styles.switchThumb, { backgroundColor: theme.inverse, transform: [{ translateX: run.autoShare ? 18 : 0 }] }]} />
        </View>
      </Pressable>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>기록 타임라인</Text>
          <Text style={[styles.sectionMeta, { color: theme.textSecondary }]}>{entries.data?.length ?? 0}개</Text>
        </View>
        {entries.data?.map((entry) => (
          <View key={entry.id} style={[styles.entry, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.entryTop}>
              <Text style={[styles.entryValue, { color: theme.text }]}>{entry.newValue}{unit} · {Math.round(entry.normalizedProgress / 100)}%</Text>
              <Text style={[styles.entryDate, { color: theme.textSecondary }]}>{new Date(entry.recordedAt).toLocaleDateString('ko-KR')}</Text>
            </View>
            {entry.note ? <Text style={[styles.entryNote, { color: theme.text }]}>{entry.note}</Text> : null}
            <Text style={[styles.entryMeta, { color: theme.textSecondary }]}>
              {entry.correction ? '수정 기록' : '독서 기록'}{entry.durationSeconds > 0 ? ` · ${durationLabel(entry.durationSeconds)}` : ''}
            </Text>
          </View>
        ))}
        {!entries.data?.length && !entries.isFetching ? <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>아직 남긴 기록이 없어요.</Text> : null}
      </View>

      <View style={[styles.dangerZone, { borderColor: theme.border }]}>
        <View style={styles.switchCopy}>
          <Text style={[styles.dangerTitle, { color: theme.accent }]}>책장에서 제거</Text>
          <Text style={[styles.sectionCopy, { color: theme.textSecondary }]}>잘못 추가한 책이나 더 이상 보관하지 않을 회차를 기록과 함께 지워요.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${run.title} 책장에서 제거`}
          accessibilityState={{ disabled: remove.isPending }}
          disabled={remove.isPending}
          onPress={confirmRemove}
          style={({ pressed }) => [styles.removeButton, { borderColor: theme.accent, opacity: pressed || remove.isPending ? 0.55 : 1 }]}>
          <Text style={[styles.removeButtonText, { color: theme.accent }]}>{remove.isPending ? '제거 중…' : '제거'}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function ChoiceSection<T extends string>({
  title,
  items,
  selected,
  onSelect,
}: {
  title: string;
  items: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={styles.choices}>
        {items.map((item) => {
          const active = selected === item.value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => onSelect(item.value)}
              style={[styles.choice, { backgroundColor: active ? theme.primarySoft : theme.card, borderColor: active ? theme.primary : theme.border }]}>
              <Text style={[styles.choiceText, { color: active ? theme.primary : theme.textSecondary }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  hero: { minHeight: 145, borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  heroCopy: { flex: 1, gap: 7 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  author: { fontSize: 13 },
  progress: { fontSize: 11, fontWeight: '900' },
  section: { gap: 11 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontSize: 17, fontWeight: '900' },
  sectionCopy: { marginTop: 4, fontSize: 12, lineHeight: 18 },
  sectionMeta: { fontSize: 11, fontWeight: '800' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 44, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  choiceText: { fontSize: 12, fontWeight: '900' },
  switchRow: { minHeight: 82, borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: 14 },
  switchCopy: { flex: 1 },
  switchTrack: { width: 46, height: 28, borderRadius: 14, padding: 3 },
  switchThumb: { width: 22, height: 22, borderRadius: 11 },
  entry: { borderWidth: 1, borderRadius: Radius.medium, padding: 13, gap: 7 },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  entryValue: { fontSize: 14, fontWeight: '900' },
  entryDate: { fontSize: 11 },
  entryNote: { fontSize: 13, lineHeight: 20 },
  entryMeta: { fontSize: 10, fontWeight: '700' },
  emptyTitle: { fontSize: 18, fontWeight: '900' },
  emptyCopy: { fontSize: 13, textAlign: 'center' },
  dangerZone: { minHeight: 92, borderTopWidth: 1, paddingTop: Spacing.four, flexDirection: 'row', alignItems: 'center', gap: 14 },
  dangerTitle: { fontSize: 15, fontWeight: '900' },
  removeButton: { minWidth: 76, minHeight: 44, borderWidth: 1, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  removeButtonText: { fontSize: 13, fontWeight: '900' },
});
