import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BookAddCard } from '@/components/product/book-add-card';
import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { useAuth } from '@/features/auth/auth-provider';
import { useFeedback } from '@/features/feedback/feedback-provider';
import { useBookSearch, useBookSuggestions, useCreateReadingRun } from '@/features/catalog/hooks';
import { useReadingRuns, useUpdateReadingRun } from '@/features/reading/hooks';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { addRecentSearch, clearRecentSearches, loadRecentSearches, removeRecentSearch } from '@/lib/recent-searches';
import type { Book, ReadingRun } from '@/types/domain';

export default function BookSearchScreen() {
  const theme = useTheme();
  const { userID } = useAuth();
  const feedback = useFeedback();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecentSearches(userID ?? ''));
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const suggestionQuery = useBookSuggestions(debouncedQuery);
  const search = useBookSearch(submittedQuery);
  const create = useCreateReadingRun();
  const runs = useReadingRuns();
  const update = useUpdateReadingRun();
  const waitingForSuggestions = query.trim().length >= 1 && query.trim() !== debouncedQuery;
  const books = useMemo(() => {
    const unique = new Map<string, Book>();
    for (const page of search.data?.pages ?? []) {
      for (const book of page.items) unique.set(book.isbn, book);
    }
    return [...unique.values()];
  }, [search.data]);
  const existingRunsByISBN = useMemo(() => {
    const items = new Map<string, ReadingRun>();
    for (const run of runs.data ?? []) {
      if (run.isbn && (run.status === 'want_to_read' || run.status === 'reading' || run.status === 'paused') && !items.has(run.isbn)) {
        items.set(run.isbn, run);
      }
    }
    return items;
  }, [runs.data]);
  const showSuggestions = suggestionsVisible && !submittedQuery && query.trim().length >= 1;
  const loadNextPage = () => {
    if (submittedQuery && search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
  };
  const submitSearch = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setQuery(normalized);
    setDebouncedQuery(normalized);
    setSubmittedQuery(normalized);
    setSuggestionsVisible(false);
    setRecentSearches(addRecentSearch(userID ?? '', normalized));
    Keyboard.dismiss();
  };
  const openManualRegistration = () => router.push({ pathname: '/manual-book', params: { title: query.trim() } });

  const continueExisting = async (run: ReadingRun) => {
    try {
      if (run.status !== 'reading') {
        await update.mutateAsync({ readingRunID: run.id, input: { status: 'reading' } });
      }
      router.dismissTo({ pathname: '/record', params: { runID: run.id } });
    } catch (error) {
      feedback.showError('읽기를 시작하지 못했어요', error, {
        label: '다시 시도',
        onPress: () => void continueExisting(run),
      });
    }
  };

  const add = async (
    isbn: string,
    totalValue: number,
    progressBasis: ReadingRun['progressBasis'],
    status: Extract<ReadingRun['status'], 'reading' | 'want_to_read'>,
  ) => {
    try {
      await create.mutateAsync({ isbn, totalValue, progressBasis, status });
      feedback.showSuccess(
        status === 'reading' ? '읽는 책에 추가했어요' : '읽고 싶은 책에 담았어요',
        status === 'reading' ? '첫 독서 기록을 바로 남겨보세요.' : '내 책장에서 언제든 읽기를 시작할 수 있어요.',
        { label: status === 'reading' ? '기록하기' : '책장 보기', onPress: () => router.dismissTo(status === 'reading' ? '/record' : '/library') },
      );
    } catch (error) {
      const message = error instanceof ApiError && error.status === 409 ? '이미 읽는 중인 책입니다.' : error instanceof Error ? error.message : '책을 추가하지 못했습니다.';
      feedback.showError('책을 추가하지 못했어요', new Error(message), {
        label: '다시 시도',
        onPress: () => void add(isbn, totalValue, progressBasis, status),
      });
    }
  };

  return (
    <Screen onEndReached={loadNextPage}>
      <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
        <Text style={[styles.searchIcon, { color: theme.textSecondary }]}>⌕</Text>
        <TextInput
          accessibilityLabel="책 검색어"
          autoFocus
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setSubmittedQuery('');
            setSuggestionsVisible(value.trim().length >= 1);
          }}
          onFocus={() => setSuggestionsVisible(query.trim().length >= 1 && !submittedQuery)}
          onSubmitEditing={() => submitSearch(query)}
          maxLength={100}
          placeholder="책 제목, 저자 또는 ISBN"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="search"
          style={[styles.input, { color: theme.text }]}
        />
        {query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="검색어 지우기"
            onPress={() => {
              setQuery('');
              setDebouncedQuery('');
              setSubmittedQuery('');
              setSuggestionsVisible(false);
            }}>
            <Text style={[styles.clear, { color: theme.textSecondary }]}>×</Text>
          </Pressable>
        ) : null}
      </View>

      {showSuggestions ? (
        <View accessibilityLabel="연관 검색어" style={[styles.suggestions, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {waitingForSuggestions || suggestionQuery.isLoading ? (
            <ActivityIndicator color={theme.primary} style={styles.suggestionLoader} />
          ) : suggestionQuery.isError ? (
            <Pressable accessibilityRole="button" onPress={() => void suggestionQuery.refetch()} style={styles.suggestionState}>
              <Text style={[styles.suggestionStateText, { color: theme.textSecondary }]}>추천 제목을 불러오지 못했어요 · 다시 시도</Text>
            </Pressable>
          ) : suggestionQuery.data?.length ? (
            suggestionQuery.data.map((title, index) => (
              <Pressable
                key={title}
                accessibilityRole="button"
                accessibilityLabel={`${title} 검색`}
                onPress={() => submitSearch(title)}
                style={({ pressed }) => [styles.suggestion, { borderTopColor: theme.border, borderTopWidth: index ? StyleSheet.hairlineWidth : 0, opacity: pressed ? 0.62 : 1 }]}>
                <Text numberOfLines={1} style={[styles.suggestionValue, { color: theme.text }]}>{title}</Text>
              </Pressable>
            ))
          ) : (
            <View style={styles.suggestionState}>
              <Text style={[styles.suggestionStateText, { color: theme.textSecondary }]}>추천할 책 제목이 없어요</Text>
            </View>
          )}
        </View>
      ) : null}

      {!query.trim() && recentSearches.length ? (
        <View style={styles.recentSection}>
          <View style={styles.recentHeading}>
            <Text style={[styles.recentTitle, { color: theme.text }]}>최근 검색어</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="최근 검색어 전체 삭제"
              onPress={() => setRecentSearches(clearRecentSearches(userID ?? ''))}
              style={({ pressed }) => [styles.clearAllButton, { opacity: pressed ? 0.55 : 1 }]}>
              <Text style={[styles.clearAllText, { color: theme.textSecondary }]}>전체 삭제</Text>
            </Pressable>
          </View>
          <View style={[styles.recentList, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {recentSearches.map((value, index) => (
              <View
                key={value}
                style={[
                  styles.recentRow,
                  { borderTopColor: theme.border, borderTopWidth: index ? StyleSheet.hairlineWidth : 0 },
                ]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${value} 다시 검색`}
                  onPress={() => submitSearch(value)}
                  style={({ pressed }) => [styles.recentValueButton, { opacity: pressed ? 0.58 : 1 }]}>
                  <Text style={[styles.recentIcon, { color: theme.textSecondary }]}>↻</Text>
                  <Text numberOfLines={1} style={[styles.recentValue, { color: theme.text }]}>{value}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${value} 최근 검색어에서 삭제`}
                  onPress={() => setRecentSearches(removeRecentSearch(userID ?? '', value))}
                  style={({ pressed }) => [styles.recentRemove, { opacity: pressed ? 0.52 : 1 }]}>
                  <Text style={[styles.recentRemoveText, { color: theme.textSecondary }]}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {query.trim().length < 1 ? (
        <View style={styles.state}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>어떤 책을 읽고 있나요?</Text>
          <Text style={[styles.stateCopy, { color: theme.textSecondary }]}>한 글자 제목부터 검색하거나 ISBN 바코드를 스캔해 보세요.</Text>
          <View style={styles.stateActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ISBN 바코드 스캔"
              onPress={() => router.push('/scan')}
              style={[styles.scanButton, { borderColor: theme.border }]}>
              <Text style={[styles.scanText, { color: theme.primary }]}>▣ ISBN 스캔</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="책 직접 등록"
              onPress={() => router.push('/manual-book')}
              style={[styles.scanButton, { borderColor: theme.border }]}>
              <Text style={[styles.scanText, { color: theme.primary }]}>＋ 직접 등록</Text>
            </Pressable>
          </View>
        </View>
      ) : !submittedQuery ? null : search.isLoading && books.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={styles.loader} />
      ) : search.isError && books.length === 0 ? (
        <FeedbackBanner title="책을 검색하지 못했어요" error={search.error} actionLabel="다시 검색" onAction={() => void search.refetch()} />
      ) : books.length ? (
        <View style={styles.results}>
          <View style={styles.resultHeading}>
            <Text style={[styles.count, { color: theme.textSecondary }]}>현재 {books.length}권</Text>
            {search.hasNextPage ? <Text style={[styles.moreHint, { color: theme.primary }]}>아래로 내리면 20권 더</Text> : null}
          </View>
          {books.map((book) => (
            <BookAddCard
              key={book.isbn}
              book={book}
              existingRun={existingRunsByISBN.get(book.isbn)}
              pending={
                (create.isPending && create.variables?.isbn === book.isbn) ||
                (update.isPending && update.variables?.readingRunID === existingRunsByISBN.get(book.isbn)?.id)
              }
              onOpenExisting={() => {
                const run = existingRunsByISBN.get(book.isbn);
                if (run) router.push({ pathname: '/book/[runID]', params: { runID: run.id } });
              }}
              onContinueExisting={() => {
                const run = existingRunsByISBN.get(book.isbn);
                if (run) void continueExisting(run);
              }}
              onAdd={(totalValue, progressBasis, status) => add(book.isbn, totalValue, progressBasis, status)}
            />
          ))}
          {search.isFetchNextPageError ? (
            <FeedbackBanner title="다음 검색 결과를 불러오지 못했어요" error={search.error} actionLabel="다시 불러오기" onAction={loadNextPage} />
          ) : search.isFetchingNextPage ? (
            <View style={styles.nextPageLoader}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[styles.nextPageCopy, { color: theme.textSecondary }]}>다음 20권을 불러오는 중…</Text>
            </View>
          ) : !search.hasNextPage && books.length > 20 ? (
            <Text style={[styles.endCopy, { color: theme.textSecondary }]}>검색 결과를 모두 불러왔어요</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.state}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>검색 결과가 없어요</Text>
          <Text style={[styles.stateCopy, { color: theme.textSecondary }]}>검색어를 줄이거나 책 정보를 직접 등록해 보세요.</Text>
          <Pressable accessibilityRole="button" onPress={openManualRegistration} style={[styles.manualButton, { backgroundColor: theme.primary }]}>
            <Text style={[styles.manualButtonText, { color: theme.inverse }]}>책 직접 등록</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: { height: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 9 },
  searchIcon: { fontSize: 24, fontWeight: '800' },
  input: { flex: 1, fontSize: 16 },
  clear: { fontSize: 27, paddingHorizontal: 3 },
  suggestions: { marginTop: -18, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  suggestion: { minHeight: 50, paddingHorizontal: 16, justifyContent: 'center' },
  suggestionValue: { fontSize: 14, fontWeight: '800' },
  suggestionLoader: { minHeight: 50 },
  suggestionState: { minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  suggestionStateText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  recentSection: { gap: 9 },
  recentHeading: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentTitle: { fontSize: 16, fontWeight: '900' },
  clearAllButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  clearAllText: { fontSize: 12, fontWeight: '800' },
  recentList: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  recentRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center' },
  recentValueButton: { minHeight: 50, flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16 },
  recentIcon: { fontSize: 17, fontWeight: '800' },
  recentValue: { flex: 1, fontSize: 14, fontWeight: '800' },
  recentRemove: { width: 50, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  recentRemoveText: { fontSize: 25, lineHeight: 28 },
  state: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 24, gap: 9 },
  stateTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  stateCopy: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  scanButton: { marginTop: 13, borderWidth: 1, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  stateActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  scanText: { fontSize: 14, fontWeight: '900' },
  manualButton: { marginTop: 12, minHeight: 48, borderRadius: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  manualButtonText: { fontSize: 13, fontWeight: '900' },
  loader: { marginTop: 70 },
  results: { gap: 12 },
  resultHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 12, fontWeight: '700' },
  moreHint: { fontSize: 11, fontWeight: '800' },
  nextPageLoader: { minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 9 },
  nextPageCopy: { fontSize: 12, fontWeight: '700' },
  endCopy: { paddingVertical: 20, textAlign: 'center', fontSize: 12, fontWeight: '700' },
});
