import { Redirect } from 'expo-router';
import { type ComponentProps, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';

export default function SignInScreen() {
  const auth = useAuth();
  const theme = useTheme();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);
  const sessionStorageCopy = Platform.OS === 'web'
    ? '로그인 정보는 현재 브라우저에 보관됩니다.'
    : '로그인 정보는 Android 보안 저장소에 보관됩니다.';

  const isRegistration = auth.registrationOpen === true;
  const valid = useMemo(() => {
    const credentialsValid = email.trim().includes('@') && password.length >= 10;
    return isRegistration
      ? credentialsValid && nickname.trim().length > 0 && password === passwordConfirmation
      : credentialsValid;
  }, [email, isRegistration, nickname, password, passwordConfirmation]);

  if (auth.session) return <Redirect href="/" />;

  const submit = async () => {
    if (!valid || pending) return;
    setPending(true);
    setFormError(null);
    try {
      if (isRegistration) await auth.register(nickname, email, password);
      else await auth.signIn(email, password);
    } catch (error) {
      setFormError(error);
    } finally {
      setPending(false);
    }
  };

  if (auth.loading || auth.registrationOpen === null) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        {auth.loading ? <ActivityIndicator color={theme.primary} /> : null}
        <Text style={[styles.centerTitle, { color: theme.text }]}>
          {auth.loading ? '계정 정보를 확인하고 있어요' : '서버에 연결하지 못했어요'}
        </Text>
        {!auth.loading ? (
          <>
            <Text style={[styles.centerCopy, { color: theme.textSecondary }]}>{auth.statusError}</Text>
            <Pressable onPress={auth.refreshStatus} style={[styles.retry, { backgroundColor: theme.primary }]}>
              <Text style={[styles.submitText, { color: theme.inverse }]}>다시 연결</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.page, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.heading}>
          <View style={[styles.mark, { backgroundColor: theme.primary }]}>
            <Text style={[styles.markText, { color: theme.inverse }]}>책</Text>
          </View>
          <View style={styles.headingCopy}>
            <Text style={[styles.eyebrow, { color: theme.primary }]}>PRIVATE BOOKGYEOL</Text>
            <Text style={[styles.title, { color: theme.text }]}>
              {isRegistration ? '나만의 독서 공간을 시작해요' : '다시 독서 흐름으로'}
            </Text>
            <Text style={[styles.copy, { color: theme.textSecondary }]}>
              {isRegistration
                ? '첫 계정만 만들 수 있어요. 기록은 내 전용 서버의 PostgreSQL에 저장됩니다.'
                : '내 전용 서버에 저장된 계정으로 안전하게 로그인하세요.'}
            </Text>
          </View>
        </View>

        {formError ? (
          <FeedbackBanner
            title={isRegistration ? '계정을 만들지 못했어요' : '로그인하지 못했어요'}
            error={formError}
            actionLabel="다시 시도"
            onAction={submit}
          />
        ) : null}

        <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {isRegistration ? (
            <Field label="닉네임" value={nickname} onChangeText={setNickname} placeholder="앱에서 사용할 이름" theme={theme} autoCapitalize="none" />
          ) : null}
          <Field label="이메일" value={email} onChangeText={setEmail} placeholder="name@example.com" theme={theme} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
          {email.length > 0 && !email.trim().includes('@') ? (
            <Text accessibilityLiveRegion="polite" style={[styles.validation, { color: theme.accent }]}>올바른 이메일 주소를 입력해 주세요.</Text>
          ) : null}
          <Field label="비밀번호" value={password} onChangeText={setPassword} placeholder="10자 이상" theme={theme} secureTextEntry autoCapitalize="none" autoComplete={isRegistration ? 'new-password' : 'current-password'} />
          {password.length > 0 && password.length < 10 ? (
            <Text accessibilityLiveRegion="polite" style={[styles.validation, { color: theme.accent }]}>비밀번호는 10자 이상이어야 해요.</Text>
          ) : null}
          {isRegistration ? (
            <Field label="비밀번호 확인" value={passwordConfirmation} onChangeText={setPasswordConfirmation} placeholder="한 번 더 입력" theme={theme} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
          ) : null}
          {isRegistration && passwordConfirmation && password !== passwordConfirmation ? (
            <Text accessibilityLiveRegion="polite" style={[styles.validation, { color: theme.accent }]}>비밀번호가 서로 달라요.</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !valid || pending }}
            disabled={!valid || pending}
            onPress={submit}
            style={[styles.submit, { backgroundColor: valid ? theme.primary : theme.backgroundElement }]}>
            {pending ? <ActivityIndicator color={theme.inverse} /> : null}
            <Text style={[styles.submitText, { color: valid ? theme.inverse : theme.textSecondary }]}>
              {pending ? '처리 중…' : isRegistration ? '개인 계정 만들기' : '로그인'}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.security, { backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.securityTitle, { color: theme.primary }]}>내 데이터, 내 서버</Text>
          <Text style={[styles.securityCopy, { color: theme.textSecondary }]}>비밀번호는 암호화된 해시로 저장되며, {sessionStorageCopy}</Text>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

type FieldProps = ComponentProps<typeof TextInput> & {
  label: string;
  theme: ReturnType<typeof useTheme>;
};

function Field({ label, theme, ...props }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: Spacing.four, paddingVertical: Spacing.four, justifyContent: 'center', gap: 22 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28 },
  centerTitle: { fontSize: 18, fontWeight: '900', textAlign: 'center' },
  centerCopy: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  retry: { minHeight: 48, paddingHorizontal: 24, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  heading: { gap: 18 },
  mark: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  markText: { fontSize: 24, fontWeight: '900' },
  headingCopy: { gap: 7 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '900', letterSpacing: -1 },
  copy: { fontSize: 14, lineHeight: 21 },
  formCard: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.four, gap: 14 },
  field: { gap: 7 },
  label: { fontSize: 12, fontWeight: '900' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 14, fontSize: 15 },
  validation: { marginTop: -5, fontSize: 12, fontWeight: '700' },
  submit: { minHeight: 54, marginTop: 4, borderRadius: Radius.medium, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  submitText: { fontSize: 15, fontWeight: '900' },
  security: { borderRadius: Radius.medium, padding: Spacing.three, gap: 4 },
  securityTitle: { fontSize: 12, fontWeight: '900' },
  securityCopy: { fontSize: 11, lineHeight: 17 },
});
