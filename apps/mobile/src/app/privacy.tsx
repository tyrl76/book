import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/product/screen';
import { Radius, Spacing } from '@/constants/theme';
import { useProfile, useUpdateProfile } from '@/features/account/hooks';
import { useTheme } from '@/hooks/use-theme';
import type { Profile } from '@/types/domain';

const visibilityOptions: { value: Profile['defaultVisibility']; label: string; description: string }[] = [
  { value: 'private', label: '나만 보기', description: '새 독서 기록을 공유하지 않아요' },
  { value: 'friends', label: '친구에게', description: '서로 수락한 친구에게만 보여요' },
  { value: 'public', label: '전체 공개', description: '책결 사용자 누구나 피드에서 볼 수 있어요' },
];

const precisionOptions: { value: Profile['progressPrecision']; label: string; description: string }[] = [
  { value: 'hidden', label: '진척 숨김', description: '읽고 있다는 사실만 보여요' },
  { value: 'milestone', label: '마일스톤만', description: '25·50·75%와 완독만 보여요' },
  { value: 'exact', label: '정확한 진척', description: '현재 퍼센트를 함께 보여요' },
];

export default function PrivacyScreen() {
  const theme = useTheme();
  const profile = useProfile();
  const update = useUpdateProfile();

  const change = async (input: Parameters<typeof update.mutateAsync>[0]) => {
    try {
      await update.mutateAsync(input);
    } catch (error) {
      Alert.alert('공개 범위를 바꾸지 못했어요', error instanceof Error ? error.message : '다시 시도해 주세요');
    }
  };

  return (
    <Screen>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>PRIVACY FIRST</Text>
        <Text style={[styles.title, { color: theme.text }]}>기록의 주인은 나예요</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>이 설정은 새로 추가하는 책의 기본값입니다. 기존 책은 책 상세에서 따로 바꿀 수 있어요.</Text>
      </View>
      <OptionGroup
        title="기본 공개 범위"
        items={visibilityOptions}
        selected={profile.data?.defaultVisibility}
        onSelect={(defaultVisibility) => change({ defaultVisibility })}
      />
      <OptionGroup
        title="기본 진척 공개"
        items={precisionOptions}
        selected={profile.data?.progressPrecision}
        onSelect={(progressPrecision) => change({ progressPrecision })}
      />
      <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}>
        <Text style={[styles.noticeTitle, { color: theme.text }]}>메모는 더 조심스럽게</Text>
        <Text style={[styles.noticeCopy, { color: theme.textSecondary }]}>한 줄 메모는 마일스톤 공유가 켜진 책에서만 선택한 범위에 표시됩니다. 스포일러 대화는 상대의 진척에 따라 별도로 잠깁니다.</Text>
      </View>
    </Screen>
  );
}

function OptionGroup<T extends string>({ title, items, selected, onSelect }: {
  title: string;
  items: { value: T; label: string; description: string }[];
  selected?: T;
  onSelect: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: theme.text }]}>{title}</Text>
      <View style={[styles.options, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {items.map((item, index) => {
          const active = selected === item.value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => onSelect(item.value)}
              style={[styles.option, index < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <View style={styles.optionCopy}>
                <Text style={[styles.optionLabel, { color: active ? theme.primary : theme.text }]}>{item.label}</Text>
                <Text style={[styles.optionDescription, { color: theme.textSecondary }]}>{item.description}</Text>
              </View>
              <View style={[styles.radio, { borderColor: active ? theme.primary : theme.border }]}>
                {active ? <View style={[styles.radioDot, { backgroundColor: theme.primary }]} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 29, lineHeight: 37, fontWeight: '900', letterSpacing: -0.9 },
  copy: { fontSize: 14, lineHeight: 21 },
  group: { gap: 10 },
  groupTitle: { fontSize: 17, fontWeight: '900' },
  options: { borderWidth: 1, borderRadius: Radius.large, overflow: 'hidden' },
  option: { minHeight: 76, paddingHorizontal: Spacing.three, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 14 },
  optionCopy: { flex: 1 },
  optionLabel: { fontSize: 14, fontWeight: '900' },
  optionDescription: { marginTop: 3, fontSize: 11, lineHeight: 16 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  notice: { borderRadius: Radius.medium, padding: Spacing.three, gap: 5 },
  noticeTitle: { fontSize: 14, fontWeight: '900' },
  noticeCopy: { fontSize: 12, lineHeight: 18 },
});
