import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { registerPushToken } from '@/lib/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function enablePushNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('웹 푸시는 운영 도메인과 서비스 워커 연결 후 사용할 수 있어요.');
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('bookgyeol-social', {
      name: '친구와 독서 소식',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180],
      lightColor: '#2E6653',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('기기 설정에서 책결 알림을 허용해 주세요.');
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error('EAS 프로젝트 ID가 아직 연결되지 않았어요.');
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await registerPushToken(Platform.OS === 'ios' ? 'ios' : 'android', token);
}

function openNotification(notification: Notifications.Notification) {
  const url = notification.request.content.data?.url;
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
    router.push(url as never);
  }
}

export function PushNotificationObserver() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const previous = Notifications.getLastNotificationResponse();
    if (previous?.notification) openNotification(previous.notification);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotification(response.notification);
    });
    return () => subscription.remove();
  }, []);
  return null;
}
