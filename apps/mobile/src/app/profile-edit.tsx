import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/product/screen';
import { Radius, Spacing } from '@/constants/theme';
import { useProfile, useUpdateProfile } from '@/features/account/hooks';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileEditScreen() {
  const theme = useTheme();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [nicknameDraft, setNicknameDraft] = useState<string | null>(null);
  const [bioDraft, setBioDraft] = useState<string | null>(null);
  const nickname = nicknameDraft ?? profile.data?.nickname ?? '';
  const bio = bioDraft ?? profile.data?.bio ?? '';

  const valid = nickname.trim().length >= 1 && nickname.trim().length <= 40 && bio.trim().length <= 160;

  const save = async () => {
    if (!valid) return;
    try {
      await update.mutateAsync({ nickname: nickname.trim(), bio: bio.trim() });
      router.back();
    } catch (error) {
      Alert.alert('프로필을 저장하지 못했어요', error instanceof Error ? error.message : '다시 시도해 주세요');
    }
  };

  return (
    <Screen>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>PROFILE</Text>
        <Text style={[styles.title, { color: theme.text }]}>나를 소개해 주세요</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>연결된 친구에게만 표시되는 독서 프로필이에요.</Text>
      </View>
      <View style={styles.form}>
        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: theme.text }]}>닉네임</Text>
            <Text style={[styles.counter, { color: theme.textSecondary }]}>{nickname.length}/40</Text>
          </View>
          <TextInput
            accessibilityLabel="프로필 닉네임"
            value={nickname}
            onChangeText={setNicknameDraft}
            maxLength={40}
            placeholder="독서가"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
          />
        </View>
        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: theme.text }]}>소개</Text>
            <Text style={[styles.counter, { color: theme.textSecondary }]}>{bio.length}/160</Text>
          </View>
          <TextInput
            accessibilityLabel="프로필 소개"
            value={bio}
            onChangeText={setBioDraft}
            maxLength={160}
            multiline
            placeholder="어떤 독서가인지 가볍게 알려주세요"
            placeholderTextColor={theme.textSecondary}
            style={[styles.bioInput, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
          />
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !valid || update.isPending }}
        disabled={!valid || update.isPending}
        onPress={save}
        style={[styles.save, { backgroundColor: valid ? theme.primary : theme.backgroundElement }]}>
        <Text style={[styles.saveText, { color: valid ? theme.inverse : theme.textSecondary }]}>{update.isPending ? '저장 중…' : '프로필 저장'}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 29, lineHeight: 37, fontWeight: '900', letterSpacing: -0.9 },
  copy: { fontSize: 14, lineHeight: 21 },
  form: { gap: Spacing.four },
  field: { gap: 8 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 14, fontWeight: '900' },
  counter: { fontSize: 11, fontWeight: '700' },
  input: { minHeight: 54, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 14, fontSize: 15 },
  bioInput: { minHeight: 120, borderWidth: 1, borderRadius: Radius.medium, padding: 14, fontSize: 14, lineHeight: 21, textAlignVertical: 'top' },
  save: { minHeight: 54, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 15, fontWeight: '900' },
});
