export async function enablePushNotifications(): Promise<void> {
  throw new Error('웹 푸시는 운영 도메인과 서비스 워커 연결 후 사용할 수 있어요.');
}

export function PushNotificationObserver() {
  return null;
}
