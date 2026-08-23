import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/product/screen';
import { Radius, Spacing } from '@/constants/theme';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/features/account/hooks';
import { useTheme } from '@/hooks/use-theme';
import { disablePushTokens } from '@/lib/api';
import { enablePushNotifications } from '@/lib/push-notifications';
import type { NotificationPreferences } from '@/types/domain';

const items: { key: keyof Pick<NotificationPreferences, 'pushEnabled' | 'friendRequests' | 'comments' | 'milestones' | 'dailyDigest'>; label: string; description: string }[] = [
  { key: 'pushEnabled', label: '푸시 알림', description: '기기에서 책결 알림을 받을 수 있게 해요' },
  { key: 'friendRequests', label: '친구 연결', description: '초대 수락과 새 연결을 바로 알려줘요' },
  { key: 'comments', label: '응원과 한마디', description: '내 기록에 새 반응이 생기면 알려줘요' },
  { key: 'milestones', label: '친구 마일스톤', description: '친구의 중요한 독서 지점만 알려줘요' },
  { key: 'dailyDigest', label: '하루 한 번 모아보기', description: '일반 독서 소식을 묶어서 조용히 보내요' },
];

export default function NotificationsScreen() {
  const theme = useTheme();
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const value = preferences.data;

  const save = async (next: NotificationPreferences) => {
    try {
      if (value && next.pushEnabled !== value.pushEnabled) {
        if (next.pushEnabled) await enablePushNotifications();
        else await disablePushTokens();
      }
      await update.mutateAsync(next);
    } catch (error) {
      Alert.alert('알림 설정을 저장하지 못했어요', error instanceof Error ? error.message : '다시 시도해 주세요');
    }
  };

  return (
    <Screen>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>GENTLE REMINDERS</Text>
        <Text style={[styles.title, { color: theme.text }]}>부담 없는 알림</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>읽지 않았다는 압박 대신 친구와 이어지는 순간만 골라 알려드려요.</Text>
      </View>
      {value ? (
        <View style={[styles.list, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {items.map((item, index) => (
            <Pressable
              key={item.key}
              accessibilityRole="switch"
              accessibilityState={{ checked: value[item.key] }}
              onPress={() => void save({ ...value, [item.key]: !value[item.key] })}
              style={[styles.row, index < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{item.label}</Text>
                <Text style={[styles.rowDescription, { color: theme.textSecondary }]}>{item.description}</Text>
              </View>
              <SwitchVisual active={value[item.key]} />
            </Pressable>
          ))}
        </View>
      ) : <Text style={[styles.loading, { color: theme.textSecondary }]}>알림 설정을 불러오는 중…</Text>}

      {value ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: Boolean(value.quietStart && value.quietEnd) }}
          onPress={() => void save({
            ...value,
            quietStart: value.quietStart ? undefined : '22:00',
            quietEnd: value.quietEnd ? undefined : '07:00',
          })}
          style={[styles.quietCard, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>밤에는 조용히</Text>
            <Text style={[styles.rowDescription, { color: theme.textSecondary }]}>22:00부터 07:00까지 푸시를 다음 시간대로 미뤄요.</Text>
          </View>
          <SwitchVisual active={Boolean(value.quietStart && value.quietEnd)} />
        </Pressable>
      ) : null}

      <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}>
        <Text style={[styles.noticeTitle, { color: theme.text }]}>기기 푸시 준비 완료</Text>
        <Text style={[styles.noticeCopy, { color: theme.textSecondary }]}>알림을 켜면 이 기기의 Expo 푸시 토큰을 서버에 등록합니다. 실제 발송은 EAS 프로젝트와 APNs·FCM 인증 정보를 연결한 빌드에서 동작해요.</Text>
      </View>
    </Screen>
  );
}

function SwitchVisual({ active }: { active: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.switchTrack, { backgroundColor: active ? theme.primary : theme.backgroundElement }]}>
      <View style={[styles.switchThumb, { backgroundColor: theme.inverse, transform: [{ translateX: active ? 18 : 0 }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 29, lineHeight: 37, fontWeight: '900', letterSpacing: -0.9 },
  copy: { fontSize: 14, lineHeight: 21 },
  list: { borderWidth: 1, borderRadius: Radius.large, overflow: 'hidden' },
  row: { minHeight: 76, paddingHorizontal: Spacing.three, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '900' },
  rowDescription: { marginTop: 3, fontSize: 11, lineHeight: 16 },
  switchTrack: { width: 46, height: 28, borderRadius: 14, padding: 3 },
  switchThumb: { width: 22, height: 22, borderRadius: 11 },
  quietCard: { minHeight: 84, borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: 14 },
  notice: { borderRadius: Radius.medium, padding: Spacing.three, gap: 5 },
  noticeTitle: { fontSize: 14, fontWeight: '900' },
  noticeCopy: { fontSize: 12, lineHeight: 18 },
  loading: { textAlign: 'center', fontSize: 13 },
});
