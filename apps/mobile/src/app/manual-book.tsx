import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/product/screen';
import { Radius, Spacing } from '@/constants/theme';
import { useCreateManualReadingRun } from '@/features/catalog/hooks';
import { useTheme } from '@/hooks/use-theme';
import type { ReadingRun } from '@/types/domain';

const basisOptions: { value: ReadingRun['progressBasis']; label: string; unit: string }[] = [
  { value: 'pages', label: '종이책', unit: '쪽' },
  { value: 'percent', label: '전자책', unit: '%' },
  { value: 'audio_seconds', label: '오디오북', unit: '분' },
];

export default function ManualBookScreen() {
  const theme = useTheme();
  const create = useCreateManualReadingRun();
  const params = useLocalSearchParams<{ title?: string }>();
  const initialTitle = Array.isArray(params.title) ? params.title[0] : params.title;
  const [title, setTitle] = useState(initialTitle ?? '');
  const [author, setAuthor] = useState('');
  const [basis, setBasis] = useState<ReadingRun['progressBasis']>('pages');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Extract<ReadingRun['status'], 'reading' | 'want_to_read'>>('reading');
  const numericAmount = Number(amount);
  const totalValue = basis === 'percent' ? 100 : basis === 'audio_seconds' ? numericAmount * 60 : numericAmount;
  const valid = title.trim().length > 0 && title.trim().length <= 200 && author.trim().length <= 120 &&
    (basis === 'percent' || (Number.isInteger(numericAmount) && numericAmount > 0 && totalValue <= 1_000_000));

  const save = async () => {
    if (!valid) return;
    try {
      await create.mutateAsync({ title: title.trim(), author: author.trim(), totalValue, progressBasis: basis, status });
      Alert.alert(status === 'reading' ? '읽는 책에 추가했어요' : '읽고 싶은 책에 담았어요', undefined, [
        { text: '확인', onPress: () => router.dismissTo(status === 'reading' ? '/record' : '/me') },
      ]);
    } catch (error) {
      Alert.alert('책을 등록하지 못했어요', error instanceof Error ? error.message : '다시 시도해 주세요');
    }
  };

  const selectedBasis = basisOptions.find((item) => item.value === basis)!;

  return (
    <Screen>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>MANUAL BOOK</Text>
        <Text style={[styles.title, { color: theme.text }]}>책을 직접 등록해요</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>검색되지 않는 책, 독립출판물과 오디오북도 기록할 수 있어요.</Text>
      </View>

      <View style={styles.form}>
        <Field label="책 제목" required>
          <TextInput accessibilityLabel="직접 등록할 책 제목" value={title} onChangeText={setTitle} maxLength={200} placeholder="책 제목" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]} />
        </Field>
        <Field label="저자">
          <TextInput accessibilityLabel="직접 등록할 책 저자" value={author} onChangeText={setAuthor} maxLength={120} placeholder="저자 미상이라면 비워두세요" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]} />
        </Field>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>책 형식</Text>
          <View style={styles.options}>
            {basisOptions.map((item) => {
              const selected = basis === item.value;
              return (
                <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => { setBasis(item.value); setAmount(''); }} style={[styles.option, { backgroundColor: selected ? theme.primarySoft : theme.card, borderColor: selected ? theme.primary : theme.border }]}>
                  <Text style={[styles.optionText, { color: selected ? theme.primary : theme.textSecondary }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {basis !== 'percent' ? (
          <Field label={basis === 'pages' ? '전체 페이지' : '전체 재생 시간'} required>
            <View style={[styles.amountWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <TextInput accessibilityLabel={`${selectedBasis.label} 전체 분량`} value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="0" placeholderTextColor={theme.textSecondary} style={[styles.amountInput, { color: theme.text }]} />
              <Text style={[styles.unit, { color: theme.textSecondary }]}>{selectedBasis.unit}</Text>
            </View>
          </Field>
        ) : (
          <View style={[styles.percentNotice, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.percentText, { color: theme.textSecondary }]}>전자책은 전체 분량 없이 0~100%로 기록합니다.</Text>
          </View>
        )}

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>책장에 추가</Text>
          <View style={styles.options}>
            {([
              { value: 'reading' as const, label: '지금 읽기' },
              { value: 'want_to_read' as const, label: '읽고 싶음' },
            ]).map((item) => {
              const selected = status === item.value;
              return (
                <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setStatus(item.value)} style={[styles.option, { backgroundColor: selected ? theme.primarySoft : theme.card, borderColor: selected ? theme.primary : theme.border }]}>
                  <Text style={[styles.optionText, { color: selected ? theme.primary : theme.textSecondary }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !valid || create.isPending }} disabled={!valid || create.isPending} onPress={save} style={[styles.save, { backgroundColor: valid ? theme.primary : theme.backgroundElement }]}>
        <Text style={[styles.saveText, { color: valid ? theme.inverse : theme.textSecondary }]}>{create.isPending ? '등록 중…' : '책 등록'}</Text>
      </Pressable>
    </Screen>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}{required ? <Text style={{ color: theme.accent }}> *</Text> : null}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 29, lineHeight: 37, fontWeight: '900', letterSpacing: -0.9 },
  copy: { fontSize: 14, lineHeight: 21 },
  form: { gap: Spacing.four },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '900' },
  input: { minHeight: 54, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 14, fontSize: 15 },
  options: { flexDirection: 'row', gap: 7 },
  option: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  optionText: { fontSize: 12, fontWeight: '900' },
  amountWrap: { minHeight: 54, borderWidth: 1, borderRadius: Radius.medium, flexDirection: 'row', alignItems: 'center' },
  amountInput: { flex: 1, paddingHorizontal: 14, fontSize: 17, fontWeight: '900' },
  unit: { paddingRight: 14, fontSize: 13, fontWeight: '800' },
  percentNotice: { borderRadius: Radius.medium, padding: Spacing.three },
  percentText: { fontSize: 12, lineHeight: 18 },
  save: { minHeight: 54, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 15, fontWeight: '900' },
});
