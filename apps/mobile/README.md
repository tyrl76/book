# 책결 모바일

Expo 57, React Native, TypeScript로 구현한 책결 모바일 앱이다.

## 포함된 흐름

- `함께`: 친구의 마일스톤 피드와 현재 읽는 책
- `기록`: 페이지 진척과 한 줄 메모 저장
- `나`: 개인 책장 요약과 설정 진입점
- `ISBN 스캔`: Expo Camera 기반 EAN-13/EAN-8 인식
- 오프라인: SQLite에 먼저 저장한 뒤 동일 `clientOperationId`로 Go API에 재전송
- 개인 계정: 첫 가입·이메일 로그인, Android SecureStore 세션, PostgreSQL 저장 상태 확인

서버가 꺼져 있어도 내 기록은 로컬 캐시에 반영되고 동기화 대기 수가 표시된다. 앱이 활성화되면 대기 작업을 생성 순서대로 다시 보낸다.

## 환경 변수

```dotenv
EXPO_PUBLIC_API_URL=http://127.0.0.1:8080
```

Android 에뮬레이터는 API URL을 지정하지 않으면 `http://10.0.2.2:8080`을 사용한다. 실제 기기는 개발 PC의 LAN 주소가 필요하다.

EAS의 `preview`·`production` 빌드는 `eas.json`에 지정한 개인 HTTPS 서버 `https://34-64-97-191.sslip.io`를 사용한다. 이 값은 공개 주소이므로 앱에 포함해도 되지만, `ADMIN_API_KEY`나 데이터베이스 비밀번호는 모바일 환경 변수에 넣지 않는다.

## 명령

```bash
pnpm install
pnpm start
pnpm typecheck
pnpm lint
```

앱을 처음 열면 한 번만 개인 계정을 만들 수 있다. 이후에는 같은 이메일·비밀번호로 로그인하며, 네이티브 세션은 Android 보안 저장소에 보관한다. 샘플 데이터는 자동 생성하지 않는다.
