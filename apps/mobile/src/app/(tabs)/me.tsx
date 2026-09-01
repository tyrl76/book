import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/product/progress-bar';
import { Screen } from '@/components/product/screen';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { Radius, Spacing } from '@/constants/theme';
import { useProfile, useReadingStats } from '@/features/account/hooks';
import { useAuth } from '@/features/auth/auth-provider';
import { useFeedback } from '@/features/feedback/feedback-provider';
import { useReadingRuns } from '@/features/reading/hooks';
import { type ThemePreference, useThemeSelection } from '@/features/theme/theme-provider';
import { useTheme } from '@/hooks/use-theme';
import type { ReadingRun } from '@/types/domain';

const themeOptions: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'system', label: '시스템', icon: '◐' },
  { value: 'light', label: '라이트', icon: '☀' },
  { value: 'dark', label: '다크', icon: '●' },
];

const shelfOptions: { status: ReadingRun['status']; label: string }[] = [
  { status: 'reading', label: '읽는 중' },
  { status: 'want_to_read', label: '읽고 싶음' },
  { status: 'finished', label: '완독' },
  { status: 'paused', label: '잠시 멈춤' },
  { status: 'dnf', label: '중단' },
];

const settings = [
  { label: '프로필 편집', description: '닉네임과 소개를 바꿔요', route: '/profile-edit' as const },
  { label: '친구와 그룹', description: '함께 읽는 사람을 관리해요', route: '/friends' as const },
  { label: '독서 통계와 목표', description: '달력과 연간 목표를 확인해요', route: '/stats' as const },
  { label: '공개 범위', description: '기본 공유 범위를 선택해요', route: '/privacy' as const },
  { label: '알림 설정', description: '응원과 독서 소식 알림을 정해요', route: '/notifications' as const },
  { label: '데이터와 계정', description: '내보내기와 계정 삭제를 관리해요', route: '/account-data' as const },
];

export default function MeScreen() {
  const theme = useTheme();
  const feedback = useFeedback();
  const themeSelection = useThemeSelection();
  const auth = useAuth();
  const profile = useProfile();
  const stats = useReadingStats();
  const runs = useReadingRuns();
  const displayName = profile.data?.nickname ?? auth.session?.user.nickname ?? '독서가';
  const bio = profile.data?.bio || '천천히 오래 읽어요';
  const pages = Math.round(stats.data?.pagesRead ?? 0);
  const goal = stats.data?.annualGoalBooks ?? 0;
  const finished = stats.data?.annualFinishedBooks ?? 0;
  const goalProgress = goal > 0 ? Math.min(100, (finished / goal) * 100) : 0;
  const pageError = profile.error ?? stats.error ?? runs.error;

  const shelfCount = (status: ReadingRun['status']) => (runs.data ?? []).filter((run) => run.status === status).length;

  const signOut = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      feedback.showError('로그아웃하지 못했어요', error, { label: '다시 시도', onPress: () => void signOut() });
    }
  };

  return (
    <Screen>
      <View style={styles.pageHeading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>MY BOOKGYEOL</Text>
        <Text style={[styles.pageTitle, { color: theme.text }]}>나의 독서</Text>
      </View>

      {runs.syncError ? (
        <FeedbackBanner
          compact
          tone="warning"
          title="저장된 독서 정보를 표시하고 있어요"
          error={runs.syncError}
          actionLabel="다시 연결"
          onAction={() => void runs.refetch()}
        />
      ) : null}
      {pageError ? (
        <FeedbackBanner
          title="내 독서 정보를 모두 불러오지 못했어요"
          error={pageError}
          onAction={() => {
            void profile.refetch();
            void stats.refetch();
            void runs.refetch();
          }}
        />
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="프로필 편집"
        onPress={() => router.push('/profile-edit')}
        style={[styles.profileCard, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <Text style={[styles.avatarText, { color: theme.inverse }]}>{displayName.slice(0, 1)}</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={[styles.name, { color: theme.text }]}>{displayName}</Text>
          <Text numberOfLines={2} style={[styles.bio, { color: theme.textSecondary }]}>{bio}</Text>
        </View>
        <View style={[styles.readerPill, { backgroundColor: theme.card }]}>
          <Text style={[styles.readerPillText, { color: theme.primary }]}>편집</Text>
        </View>
      </Pressable>

      <View style={[styles.stats, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: theme.text }]}>{stats.data?.reading ?? 0}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>읽는 중</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: theme.text }]}>{pages}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>올해 읽은 쪽</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: theme.text }]}>{profile.data?.friendCount ?? 0}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>독서 친구</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="연간 독서 목표와 통계 열기"
        onPress={() => router.push('/stats')}
        style={[styles.goalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.goalHeading}>
          <View>
            <Text style={[styles.goalEyebrow, { color: theme.primary }]}>{new Date().getFullYear()} READING GOAL</Text>
            <Text style={[styles.goalTitle, { color: theme.text }]}>{goal > 0 ? `${goal}권 중 ${finished}권 완독` : '올해의 독서 목표를 정해보세요'}</Text>
          </View>
          <Text style={[styles.goalPercent, { color: theme.primary }]}>{Math.round(goalProgress)}%</Text>
        </View>
        <ProgressBar value={goalProgress} />
        <Text style={[styles.goalMeta, { color: theme.textSecondary }]}>현재 연속 {stats.data?.currentStreakDays ?? 0}일 · 최장 {stats.data?.longestStreakDays ?? 0}일</Text>
      </Pressable>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>내 책장</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/library')}>
            <Text style={[styles.sectionMeta, { color: theme.primary }]}>전체 보기</Text>
          </Pressable>
        </View>
        <View style={styles.shelfRow}>
          {shelfOptions.map((item) => (
            <Pressable
              key={item.status}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} 책 ${shelfCount(item.status)}권 보기`}
              onPress={() => router.push({ pathname: '/library', params: { status: item.status } })}
              style={[styles.shelf, { backgroundColor: item.status === 'reading' ? theme.primarySoft : theme.card, borderColor: theme.border }]}>
              <Text style={[styles.shelfCount, { color: item.status === 'reading' ? theme.primary : theme.text }]}>{shelfCount(item.status)}</Text>
              <Text style={[styles.shelfLabel, { color: theme.textSecondary }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>화면 테마</Text>
          <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>기기 설정을 따르거나 직접 선택할 수 있어요.</Text>
        </View>
        <View accessibilityRole="radiogroup" style={[styles.themePicker, { backgroundColor: theme.backgroundElement }]}>
          {themeOptions.map((option) => {
            const selected = themeSelection.preference === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={`${option.label} 테마`}
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                onPress={() => themeSelection.setPreference(option.value)}
                style={[styles.themeOption, selected && { backgroundColor: theme.backgroundSelected }]}>
                <Text style={[styles.themeIcon, { color: selected ? theme.primary : theme.textSecondary }]}>{option.icon}</Text>
                <Text style={[styles.themeOptionText, { color: selected ? theme.primary : theme.textSecondary }]}>{option.label}</Text>
                {selected ? <Text style={[styles.check, { color: theme.primary }]}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>설정</Text>
        <View style={[styles.settings, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {settings.map((item, index) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}, ${item.description}`}
              onPress={() => router.push(item.route)}
              style={[styles.settingRow, index < settings.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
              <View style={styles.settingCopy}>
                <Text style={[styles.settingText, { color: theme.text }]}>{item.label}</Text>
                <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>{item.description}</Text>
              </View>
              <Text style={[styles.chevron, { color: theme.textSecondary }]}>›</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel="로그아웃" onPress={signOut} style={styles.signOut}>
        <Text style={[styles.signOutText, { color: theme.accent }]}>로그아웃</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pageHeading: { gap: 3 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  pageTitle: { fontSize: 34, lineHeight: 42, fontWeight: '900', letterSpacing: -1.2 },
  profileCard: { minHeight: 104, borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatar: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '900' },
  profileCopy: { flex: 1 },
  name: { fontSize: 23, fontWeight: '900', letterSpacing: -0.5 },
  bio: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  readerPill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.pill },
  readerPillText: { fontSize: 10, fontWeight: '900' },
  stats: { borderWidth: 1, borderRadius: Radius.large, flexDirection: 'row', paddingVertical: 18 },
  stat: { flex: 1, alignItems: 'center', gap: 5 },
  statValue: { fontSize: 21, fontWeight: '900' },
  statLabel: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  divider: { width: 1 },
  goalCard: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, gap: 11 },
  goalHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  goalEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  goalTitle: { marginTop: 4, fontSize: 16, fontWeight: '900' },
  goalPercent: { fontSize: 22, fontWeight: '900' },
  goalMeta: { fontSize: 11, fontWeight: '700' },
  section: { gap: 13 },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  sectionMeta: { fontSize: 11, fontWeight: '800' },
  sectionDescription: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  shelfRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shelf: { width: '48%', minHeight: 76, borderRadius: Radius.medium, borderWidth: 1, padding: Spacing.three },
  shelfCount: { fontSize: 22, fontWeight: '900' },
  shelfLabel: { fontSize: 13, marginTop: 3 },
  themePicker: { flexDirection: 'row', borderRadius: Radius.medium, padding: 5 },
  themeOption: { flex: 1, minHeight: 50, borderRadius: Radius.small, alignItems: 'center', justifyContent: 'center', gap: 2 },
  themeIcon: { fontSize: 12, fontWeight: '900' },
  themeOptionText: { fontSize: 11, fontWeight: '900' },
  check: { position: 'absolute', right: 8, top: 6, fontSize: 10, fontWeight: '900' },
  settings: { borderWidth: 1, borderRadius: Radius.large, overflow: 'hidden' },
  settingRow: { minHeight: 68, paddingHorizontal: Spacing.three, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingCopy: { flex: 1 },
  settingText: { fontSize: 14, fontWeight: '900' },
  settingDescription: { marginTop: 3, fontSize: 11, lineHeight: 16 },
  chevron: { fontSize: 25, fontWeight: '500' },
  signOut: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontSize: 13, fontWeight: '900' },
});
