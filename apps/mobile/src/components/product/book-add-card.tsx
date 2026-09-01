import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BookCover } from '@/components/product/book-cover';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Book, ReadingRun } from '@/types/domain';

type AddStatus = Extract<ReadingRun['status'], 'reading' | 'want_to_read' | 'finished'>;

type Props = {
  book: Book;
  pending?: boolean;
  compact?: boolean;
  existingRun?: ReadingRun;
  onOpenExisting?: () => void;
  onContinueExisting?: () => void;
  onAdd: (totalValue: number, progressBasis: ReadingRun['progressBasis'], status: AddStatus) => void;
};

const basisOptions: { value: ReadingRun['progressBasis']; label: string }[] = [
  { value: 'pages', label: '종이책' },
  { value: 'percent', label: '전자책' },
  { value: 'audio_seconds', label: '오디오북' },
];

const existingStatusCopy: Partial<Record<ReadingRun['status'], { label: string; action: string }>> = {
  want_to_read: { label: '읽고 싶음에 담긴 책', action: '읽기 시작' },
  reading: { label: '현재 읽는 중', action: '기록하기' },
  paused: { label: '잠시 멈춘 책', action: '계속 읽기' },
};

export function BookAddCard({
  book,
  pending = false,
  compact = false,
  existingRun,
  onOpenExisting,
  onContinueExisting,
  onAdd,
}: Props) {
  const theme = useTheme();
  const [basis, setBasis] = useState<ReadingRun['progressBasis']>(book.pageCount ? 'pages' : 'percent');
  const [amount, setAmount] = useState(book.pageCount ? String(book.pageCount) : '100');
  const numericAmount = Number(amount);
  const requiresAmount = basis !== 'percent';
  const amountValid = !requiresAmount || (Number.isInteger(numericAmount) && numericAmount > 0 && numericAmount <= (basis === 'pages' ? 100_000 : 16_666));
  const totalValue = basis === 'percent' ? 100 : basis === 'audio_seconds' ? numericAmount * 60 : numericAmount;
  const unit = basis === 'pages' ? '쪽' : basis === 'audio_seconds' ? '분' : '%';
  const existingCopy = existingRun ? existingStatusCopy[existingRun.status] : undefined;

  const selectBasis = (next: ReadingRun['progressBasis']) => {
    setBasis(next);
    if (next === 'pages') setAmount(book.pageCount ? String(book.pageCount) : '');
    if (next === 'percent') setAmount('100');
    if (next === 'audio_seconds') setAmount('');
  };

  return (
    <View style={[styles.card, compact && styles.compact, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.bookRow}>
        {book.coverUrl ? (
          <Image source={book.coverUrl} contentFit="cover" transition={150} style={styles.cover} />
        ) : (
          <BookCover title={book.title} color="#42624C" small />
        )}
        <View style={styles.info}>
          <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{book.title}</Text>
          <Text numberOfLines={1} style={[styles.meta, { color: theme.textSecondary }]}>{book.author || '저자 미상'}</Text>
          <Text numberOfLines={1} style={[styles.meta, { color: theme.textSecondary }]}>
            {[book.publisher, book.publishedAt?.slice(0, 10), book.pageCount ? `${book.pageCount}쪽` : ''].filter(Boolean).join(' · ') || `ISBN ${book.isbn}`}
          </Text>
        </View>
      </View>

      {existingRun && existingCopy ? (
        <View style={[styles.existingPanel, { backgroundColor: theme.primarySoft, borderColor: theme.primary }]}>
          <View style={styles.existingCopy}>
            <Text style={[styles.existingEyebrow, { color: theme.primary }]}>내 책장에 있어요</Text>
            <Text style={[styles.existingLabel, { color: theme.text }]}>{existingCopy.label}</Text>
          </View>
          <View style={styles.existingActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${book.title} 책장 상세 보기`}
              onPress={onOpenExisting}
              style={[styles.existingSecondary, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Text style={[styles.existingSecondaryText, { color: theme.textSecondary }]}>상세 보기</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${book.title} ${existingCopy.action}`}
              accessibilityState={{ disabled: pending }}
              disabled={pending}
              onPress={onContinueExisting}
              style={({ pressed }) => [
                styles.existingPrimary,
                { backgroundColor: theme.primary, opacity: pressed || pending ? 0.58 : 1 },
              ]}>
              <Text style={[styles.existingPrimaryText, { color: theme.inverse }]}>
                {pending ? '처리 중…' : existingCopy.action}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>

      <View accessibilityRole="radiogroup" style={styles.basisRow}>
        {basisOptions.map((item) => {
          const selected = basis === item.value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => selectBasis(item.value)}
              style={[styles.basis, { backgroundColor: selected ? theme.primarySoft : theme.backgroundElement, borderColor: selected ? theme.primary : theme.border }]}>
              <Text style={[styles.basisText, { color: selected ? theme.primary : theme.textSecondary }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {requiresAmount ? (
        <View style={[styles.inputWrap, { borderColor: amountValid ? theme.border : theme.accent }]}>
          <TextInput
            accessibilityLabel={`${book.title} ${basis === 'pages' ? '전체 페이지 수' : '전체 재생 시간(분)'}`}
            value={amount}
            onChangeText={setAmount}
            placeholder={basis === 'pages' ? '전체 페이지 수' : '전체 재생 시간'}
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            style={[styles.input, { color: theme.text }]}
          />
          <Text style={[styles.unit, { color: theme.textSecondary }]}>{unit}</Text>
        </View>
      ) : (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>전자책은 0~100% 기준으로 기록합니다.</Text>
      )}

      {!amountValid ? (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.accent }]}>
          {basis === 'pages' ? '페이지 수는 1부터 100,000 사이로 입력해 주세요.' : '재생 시간은 1분 이상 입력해 주세요.'}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${book.title} 읽고 싶음에 추가`}
          accessibilityState={{ disabled: pending || !amountValid }}
          disabled={pending || !amountValid}
          onPress={() => onAdd(totalValue, basis, 'want_to_read')}
          style={[styles.secondaryButton, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.secondaryButtonText, { color: theme.primary }]}>읽고 싶음</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${book.title} 읽기 시작`}
          accessibilityState={{ disabled: pending || !amountValid }}
          disabled={pending || !amountValid}
          onPress={() => onAdd(totalValue, basis, 'reading')}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: amountValid ? theme.primary : theme.backgroundElement, opacity: pressed ? 0.74 : 1 },
          ]}>
          <Text style={[styles.primaryButtonText, { color: amountValid ? theme.inverse : theme.textSecondary }]}>
            {pending ? '추가 중…' : '읽기 시작'}
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${book.title} 이미 읽은 책으로 등록`}
        accessibilityState={{ disabled: pending || !amountValid }}
        disabled={pending || !amountValid}
        onPress={() => onAdd(totalValue, basis, 'finished')}
        style={({ pressed }) => [
          styles.importButton,
          { borderColor: theme.border, opacity: pressed || pending ? 0.58 : 1 },
        ]}>
        <Text style={[styles.importButtonText, { color: theme.text }]}>이미 읽었어요</Text>
        <Text style={[styles.importHint, { color: theme.textSecondary }]}>과거 독서로 등록 · 오늘 통계와 피드에는 미포함</Text>
      </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 19, padding: 15, gap: 13 },
  compact: { borderWidth: 0, padding: 0 },
  bookRow: { flexDirection: 'row', gap: 13 },
  cover: { width: 66, height: 96, borderRadius: 7, backgroundColor: '#E7E0D2' },
  info: { flex: 1, justifyContent: 'center', gap: 5 },
  title: { fontSize: 17, lineHeight: 23, fontWeight: '900', letterSpacing: -0.3 },
  meta: { fontSize: 12, lineHeight: 17 },
  existingPanel: { borderWidth: 1, borderRadius: 15, padding: 13, gap: 12 },
  existingCopy: { gap: 3 },
  existingEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  existingLabel: { fontSize: 14, fontWeight: '900' },
  existingActions: { flexDirection: 'row', gap: 8 },
  existingSecondary: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  existingPrimary: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  existingSecondaryText: { fontSize: 12, fontWeight: '900' },
  existingPrimaryText: { fontSize: 12, fontWeight: '900' },
  basisRow: { flexDirection: 'row', gap: 7 },
  basis: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  basisText: { fontSize: 11, fontWeight: '900' },
  inputWrap: { height: 50, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, paddingHorizontal: 12, fontSize: 14 },
  unit: { paddingRight: 12, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  secondaryButton: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 12, fontWeight: '900' },
  primaryButtonText: { fontSize: 12, fontWeight: '900' },
  importButton: { minHeight: 52, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 2 },
  importButtonText: { fontSize: 12, fontWeight: '900' },
  importHint: { fontSize: 10, lineHeight: 14 },
  error: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  hint: { fontSize: 11, lineHeight: 16 },
});
