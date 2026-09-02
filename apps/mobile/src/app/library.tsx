import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BookCover } from '@/components/product/book-cover';
import { ProgressBar } from '@/components/product/progress-bar';
import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useFeedback } from '@/features/feedback/feedback-provider';
import { useReadingRuns, useUpdateReadingRun } from '@/features/reading/hooks';
import { useTheme } from '@/hooks/use-theme';
import { nextReadingSelectionRequest } from '@/lib/navigation';
import type { ReadingRun } from '@/types/domain';

const filters: { value: 'all' | ReadingRun['status']; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'reading', label: '읽는 중' },
  { value: 'want_to_read', label: '읽고 싶음' },
  { value: 'finished', label: '완독' },
  { value: 'paused', label: '잠시 멈춤' },
  { value: 'dnf', label: '중단' },
];

const statusLabel: Record<ReadingRun['status'], string> = {
  want_to_read: '읽고 싶음',
  reading: '읽는 중',
  paused: '잠시 멈춤',
  finished: '완독',
  dnf: '중단',
};

type SortOrder = 'recent' | 'title' | 'progress';

const sortOptions: { value: SortOrder; label: string }[] = [
  { value: 'recent', label: '최근 기록순' },
  { value: 'title', label: '제목순' },
  { value: 'progress', label: '진척순' },
];

export default function LibraryScreen() {
  const theme = useTheme();
  const feedback = useFeedback();
  const params = useLocalSearchParams<{ status?: ReadingRun['status'] }>();
  const initial = Array.isArray(params.status) ? params.status[0] : params.status;
  const [filter, setFilter] = useState<'all' | ReadingRun['status']>(initial ?? 'all');
  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const runs = useReadingRuns();
  const update = useUpdateReadingRun();
  const items = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
    return (runs.data ?? [])
      .filter((run) => filter === 'all' || run.status === filter)
      .filter((run) => !normalizedQuery || `${run.title} ${run.author}`.toLocaleLowerCase('ko-KR').includes(normalizedQuery))
      .sort((left, right) => {
        if (sortOrder === 'title') return left.title.localeCompare(right.title, 'ko-KR');
        if (sortOrder === 'progress') return right.normalizedProgress - left.normalizedProgress || right.updatedAt.localeCompare(left.updatedAt);
        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }, [filter, query, runs.data, sortOrder]);

  const openRecord = async (run: ReadingRun) => {
    try {
      if (run.status === 'want_to_read' || run.status === 'paused') {
        await update.mutateAsync({ readingRunID: run.id, input: { status: 'reading' } });
      }
      router.push({ pathname: '/record', params: { runID: run.id, selectionRequest: nextReadingSelectionRequest() } });
    } catch (error) {
      feedback.showError('읽기를 시작하지 못했어요', error, {
        label: '다시 시도',
        onPress: () => void openRecord(run),
      });
    }
  };

  return (
    <Screen>
      <View style={styles.headingRow}>
        <View style={styles.heading}>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>MY LIBRARY</Text>
          <Text style={[styles.title, { color: theme.text }]}>내 책장</Text>
          <Text style={[styles.copy, { color: theme.textSecondary }]}>읽고 싶은 책부터 완독한 책까지 한곳에서 관리해요.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="책 검색해서 추가"
          onPress={() => router.push('/book-search')}
          style={({ pressed }) => [styles.headerAdd, { backgroundColor: theme.primary, opacity: pressed ? 0.72 : 1 }]}>
          <Text style={[styles.headerAddText, { color: theme.inverse }]}>＋ 추가</Text>
        </Pressable>
      </View>

      {runs.syncError ? (
        <FeedbackBanner
          compact
          tone="warning"
          title="저장된 책장을 표시하고 있어요"
          error={runs.syncError}
          actionLabel="다시 연결"
          onAction={() => void runs.refetch()}
        />
      ) : null}
      {runs.isError ? (
        <FeedbackBanner
          title="책장을 불러오지 못했어요"
          error={runs.error}
          actionLabel="다시 시도"
          onAction={() => void runs.refetch()}
        />
      ) : null}

      <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Text style={[styles.searchIcon, { color: theme.textSecondary }]}>⌕</Text>
        <TextInput
          accessibilityLabel="내 책장 검색"
          value={query}
          onChangeText={setQuery}
          placeholder="제목 또는 저자 검색"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="search"
          style={[styles.searchInput, { color: theme.text }]}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="책장 검색어 지우기" onPress={() => setQuery('')}>
            <Text style={[styles.clear, { color: theme.textSecondary }]}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.map((item) => {
          const selected = filter === item.value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setFilter(item.value)}
              style={[styles.filter, { backgroundColor: selected ? theme.primary : theme.card, borderColor: selected ? theme.primary : theme.border }]}>
              <Text style={[styles.filterText, { color: selected ? theme.inverse : theme.textSecondary }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.sortSection}>
        <Text style={[styles.resultCount, { color: theme.textSecondary }]}>{items.length}권</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
          {sortOptions.map((item) => {
            const selected = sortOrder === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setSortOrder(item.value)}
                style={[styles.sort, { backgroundColor: selected ? theme.primarySoft : theme.card, borderColor: selected ? theme.primary : theme.border }]}>
                <Text style={[styles.sortText, { color: selected ? theme.primary : theme.textSecondary }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.list}>
        {items.map((run) => (
          <View key={run.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${run.title} 상세 보기`}
              onPress={() => router.push({ pathname: '/book/[runID]', params: { runID: run.id } })}
              style={({ pressed }) => [styles.cardMain, { opacity: pressed ? 0.68 : 1 }]}>
              <BookCover title={run.title} color={run.coverColor} coverUrl={run.coverUrl} />
              <View style={styles.bookInfo}>
                <View style={styles.statusRow}>
                  <Text style={[styles.status, { color: theme.primary }]}>{statusLabel[run.status]}</Text>
                  {run.runNumber > 1 ? <Text style={[styles.reread, { color: theme.textSecondary }]}>{run.runNumber}번째 독서</Text> : null}
                </View>
                <Text numberOfLines={2} style={[styles.bookTitle, { color: theme.text }]}>{run.title}</Text>
                <Text numberOfLines={1} style={[styles.author, { color: theme.textSecondary }]}>{run.author}</Text>
                <ProgressBar value={run.normalizedProgress / 100} />
                <Text style={[styles.progress, { color: theme.textSecondary }]}>{Math.round(run.normalizedProgress / 100)}% · {run.currentValue}/{run.totalValue}</Text>
              </View>
              <Text style={[styles.chevron, { color: theme.textSecondary }]}>›</Text>
            </Pressable>
            {run.status === 'want_to_read' || run.status === 'reading' || run.status === 'paused' ? (
              <View style={styles.cardActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${run.title} ${run.status === 'want_to_read' ? '읽기 시작' : run.status === 'paused' ? '계속 읽기' : '기록하기'}`}
                  accessibilityState={{ disabled: update.isPending && update.variables?.readingRunID === run.id }}
                  disabled={update.isPending && update.variables?.readingRunID === run.id}
                  onPress={() => void openRecord(run)}
                  style={({ pressed }) => [
                    styles.cardQuickAction,
                    { backgroundColor: theme.primarySoft, opacity: pressed ? 0.58 : 1 },
                  ]}>
                  <Text style={[styles.cardQuickActionText, { color: theme.primary }]}>
                    {update.isPending && update.variables?.readingRunID === run.id
                      ? '처리 중'
                      : run.status === 'want_to_read'
                        ? '시작'
                        : run.status === 'paused'
                          ? '계속'
                          : '기록'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
        {runs.isFetching && !runs.data ? <ActivityIndicator accessibilityLabel="책장 불러오는 중" color={theme.primary} style={styles.loader} /> : null}
        {!items.length && !runs.isFetching && !runs.isError ? (
          <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{query.trim() ? '검색 결과가 없어요' : '이 책장에는 아직 책이 없어요'}</Text>
            <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>{query.trim() ? '제목이나 저자 검색어를 줄여보세요.' : '읽고 싶은 책을 한 권 추가해 보세요.'}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => query.trim() ? setQuery('') : router.push('/book-search')}
              style={[styles.addButton, { backgroundColor: theme.primary }]}>
              <Text style={[styles.addButtonText, { color: theme.inverse }]}>{query.trim() ? '검색어 지우기' : '책 추가하기'}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heading: { flex: 1, gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 32, lineHeight: 40, fontWeight: '900', letterSpacing: -1 },
  copy: { fontSize: 14, lineHeight: 21 },
  headerAdd: { minHeight: 44, borderRadius: Radius.medium, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  headerAddText: { fontSize: 13, fontWeight: '900' },
  searchBox: { minHeight: 52, borderWidth: 1, borderRadius: Radius.medium, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 9 },
  searchIcon: { fontSize: 22, fontWeight: '800' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15 },
  clear: { fontSize: 26, paddingHorizontal: 3 },
  filters: { gap: 8, paddingRight: Spacing.four },
  filter: { minHeight: 44, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 12, fontWeight: '900' },
  sortSection: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultCount: { minWidth: 28, fontSize: 12, fontWeight: '900' },
  sorts: { gap: 7, paddingRight: Spacing.four },
  sort: { minHeight: 38, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  sortText: { fontSize: 11, fontWeight: '800' },
  list: { gap: 10 },
  card: { minHeight: 132, borderWidth: 1, borderRadius: Radius.large, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 13 },
  bookInfo: { flex: 1, gap: 5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: 11, fontWeight: '900' },
  reread: { fontSize: 10, fontWeight: '700' },
  bookTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900' },
  author: { fontSize: 12 },
  progress: { fontSize: 10, fontWeight: '700' },
  chevron: { fontSize: 25 },
  cardActions: { gap: 7 },
  cardQuickAction: { minWidth: 48, minHeight: 44, borderRadius: Radius.small, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  cardQuickActionText: { fontSize: 11, fontWeight: '900' },
  empty: { borderRadius: Radius.large, padding: Spacing.five, alignItems: 'center', gap: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center' },
  emptyCopy: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  addButton: { minHeight: 48, borderRadius: Radius.medium, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { fontSize: 13, fontWeight: '900' },
  loader: { paddingVertical: Spacing.five },
});
