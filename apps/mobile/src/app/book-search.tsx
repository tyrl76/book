import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BookAddCard } from '@/components/product/book-add-card';
import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { useFeedback } from '@/features/feedback/feedback-provider';
import { useBookSearch, useCreateReadingRun } from '@/features/catalog/hooks';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import type { Book, ReadingRun } from '@/types/domain';

export default function BookSearchScreen() {
  const theme = useTheme();
  const feedback = useFeedback();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const search = useBookSearch(debouncedQuery);
  const create = useCreateReadingRun();
  const waitingForSearch = query.trim().length >= 1 && query.trim() !== debouncedQuery;
  const books = useMemo(() => {
    const unique = new Map<string, Book>();
    for (const page of search.data?.pages ?? []) {
      for (const book of page.items) unique.set(book.isbn, book);
    }
    return [...unique.values()];
  }, [search.data]);
  const suggestions = useMemo(() => {
    const unique = new Set<string>();
    const items: { value: string; author: string }[] = [];
    for (const book of search.data?.pages[0]?.items ?? []) {
      const value = book.title.trim();
      const key = value.toLocaleLowerCase();
      if (!value || unique.has(key)) continue;
      unique.add(key);
      items.push({ value, author: book.author });
      if (items.length === 6) break;
    }
    return items;
  }, [search.data]);
  const showSuggestions = suggestionsVisible && query.trim().length >= 1 && query.trim() === debouncedQuery;
  const loadNextPage = () => {
    if (!waitingForSearch && search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
  };
  const selectSuggestion = (value: string) => {
    const normalized = value.trim();
    setQuery(normalized);
    setDebouncedQuery(normalized);
    setSuggestionsVisible(false);
    Keyboard.dismiss();
  };
  const openManualRegistration = () => router.push({ pathname: '/manual-book', params: { title: query.trim() } });

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
            setSuggestionsVisible(value.trim().length >= 1);
          }}
          onFocus={() => setSuggestionsVisible(query.trim().length >= 1)}
          onSubmitEditing={() => {
            setSuggestionsVisible(false);
            Keyboard.dismiss();
          }}
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
              setSuggestionsVisible(false);
            }}>
            <Text style={[styles.clear, { color: theme.textSecondary }]}>×</Text>
          </Pressable>
        ) : null}
      </View>

      {showSuggestions && suggestions.length ? (
        <View accessibilityLabel="연관 검색어" style={[styles.suggestions, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.suggestionHeading, { color: theme.textSecondary }]}>연관 검색어</Text>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.value}
              accessibilityRole="button"
              accessibilityLabel={`${suggestion.value} 검색`}
              onPress={() => selectSuggestion(suggestion.value)}
              style={({ pressed }) => [styles.suggestion, { borderTopColor: theme.border, opacity: pressed ? 0.62 : 1 }]}>
              <Text style={[styles.suggestionIcon, { color: theme.primary }]}>⌕</Text>
              <View style={styles.suggestionCopy}>
                <Text numberOfLines={1} style={[styles.suggestionValue, { color: theme.text }]}>{suggestion.value}</Text>
                {suggestion.author ? <Text numberOfLines={1} style={[styles.suggestionAuthor, { color: theme.textSecondary }]}>{suggestion.author}</Text> : null}
              </View>
              <Text style={[styles.suggestionArrow, { color: theme.textSecondary }]}>↗</Text>
            </Pressable>
          ))}
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
      ) : waitingForSearch || (search.isLoading && books.length === 0) ? (
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
              pending={create.isPending && create.variables?.isbn === book.isbn}
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
  suggestionHeading: { paddingHorizontal: 14, paddingVertical: 10, fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  suggestion: { minHeight: 54, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  suggestionIcon: { width: 20, fontSize: 18, fontWeight: '900' },
  suggestionCopy: { flex: 1, gap: 2 },
  suggestionValue: { fontSize: 14, fontWeight: '800' },
  suggestionAuthor: { fontSize: 11 },
  suggestionArrow: { fontSize: 14, fontWeight: '800' },
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
