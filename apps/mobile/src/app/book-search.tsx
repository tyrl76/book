import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BookAddCard } from '@/components/product/book-add-card';
import { Screen } from '@/components/product/screen';
import { useBookSearch, useCreateReadingRun } from '@/features/catalog/hooks';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import type { ReadingRun } from '@/types/domain';

export default function BookSearchScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);
  const search = useBookSearch(debouncedQuery);
  const create = useCreateReadingRun();
  const waitingForSearch = query.trim().length >= 2 && query.trim() !== debouncedQuery;
  const openManualRegistration = () => router.push({ pathname: '/manual-book', params: { title: query.trim() } });

  const add = async (
    isbn: string,
    totalValue: number,
    progressBasis: ReadingRun['progressBasis'],
    status: Extract<ReadingRun['status'], 'reading' | 'want_to_read'>,
  ) => {
    try {
      await create.mutateAsync({ isbn, totalValue, progressBasis, status });
      Alert.alert(status === 'reading' ? '읽는 책에 추가했어요' : '읽고 싶은 책에 담았어요', status === 'reading' ? '공개 설정에 따라 첫 독서 시작도 공유됩니다.' : '내 책장에서 언제든 읽기를 시작할 수 있어요.', [
        { text: status === 'reading' ? '기록하러 가기' : '책장 보기', onPress: () => router.dismissTo(status === 'reading' ? '/record' : '/me') },
      ]);
    } catch (error) {
      const message = error instanceof ApiError && error.status === 409 ? '이미 읽는 중인 책입니다.' : error instanceof Error ? error.message : '책을 추가하지 못했습니다.';
      Alert.alert('추가하지 못했어요', message);
    }
  };

  return (
    <Screen>
      <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
        <Text style={[styles.searchIcon, { color: theme.textSecondary }]}>⌕</Text>
        <TextInput
          accessibilityLabel="책 검색어"
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="책 제목, 저자 또는 ISBN"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="search"
          style={[styles.input, { color: theme.text }]}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => setQuery('')}>
            <Text style={[styles.clear, { color: theme.textSecondary }]}>×</Text>
          </Pressable>
        ) : null}
      </View>

      {query.trim().length < 2 ? (
        <View style={styles.state}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>어떤 책을 읽고 있나요?</Text>
          <Text style={[styles.stateCopy, { color: theme.textSecondary }]}>두 글자 이상 입력하거나 ISBN 바코드를 스캔해 보세요.</Text>
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
      ) : waitingForSearch || search.isLoading ? (
        <ActivityIndicator color={theme.primary} style={styles.loader} />
      ) : search.isError ? (
        <View style={styles.state}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>검색하지 못했어요</Text>
          <Text style={[styles.stateCopy, { color: theme.textSecondary }]}>{search.error.message}</Text>
          <Pressable accessibilityRole="button" onPress={() => search.refetch()} style={[styles.manualButton, { backgroundColor: theme.primary }]}>
            <Text style={[styles.manualButtonText, { color: theme.inverse }]}>다시 검색</Text>
          </Pressable>
        </View>
      ) : search.data?.length ? (
        <View style={styles.results}>
          <Text style={[styles.count, { color: theme.textSecondary }]}>검색 결과 {search.data.length}권</Text>
          {search.data.map((book) => (
            <BookAddCard
              key={book.isbn}
              book={book}
              pending={create.isPending && create.variables?.isbn === book.isbn}
              onAdd={(totalValue, progressBasis, status) => add(book.isbn, totalValue, progressBasis, status)}
            />
          ))}
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
  count: { fontSize: 12, fontWeight: '700' },
});
