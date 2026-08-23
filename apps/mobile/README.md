# 책결 모바일

Expo 57, React Native, TypeScript로 구현한 책결 모바일 앱이다.

## 포함된 흐름

- `함께`: 친구의 마일스톤 피드와 현재 읽는 책
- `기록`: 페이지 진척과 한 줄 메모 저장
- `나`: 개인 책장 요약과 설정 진입점
- `ISBN 스캔`: Expo Camera 기반 EAN-13/EAN-8 인식
- 오프라인: SQLite에 먼저 저장한 뒤 동일 `clientOperationId`로 Go API에 재전송

서버가 꺼져 있어도 내 기록은 로컬 캐시에 반영되고 동기화 대기 수가 표시된다. 앱이 활성화되면 대기 작업을 생성 순서대로 다시 보낸다.

## 환경 변수

```dotenv
EXPO_PUBLIC_API_URL=http://127.0.0.1:8080
EXPO_PUBLIC_DEV_USER_ID=11111111-1111-4111-8111-111111111111
```

Android 에뮬레이터는 API URL을 지정하지 않으면 `http://10.0.2.2:8080`을 사용한다. 실제 기기는 개발 PC의 LAN 주소가 필요하다.

## 명령

```bash
pnpm install
pnpm start
pnpm typecheck
pnpm lint
```

현재 인증 헤더는 로컬 개발용이다. Supabase 로그인과 안전한 세션 저장, Go 서버의 JWT 검증은 다음 제품 슬라이스에서 연결한다.
