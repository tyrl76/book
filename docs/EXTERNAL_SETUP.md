# 책결 외부·인프라 작업 체크리스트

기준일: 2026-08-25

코드 저장소 밖에서 소유자가 직접 만들거나 승인해야 하는 작업이다. `필수` 항목이 끝나기 전에는 공개 베타로 배포하지 않는다.

CI/CD 코드, 서버 이미지, migration runner, Fly.io 프로세스 설정과 EAS build profile은 구현됐다. 실제 배포를 활성화하려면 [배포 파이프라인](DEPLOYMENT_PIPELINE.md)의 GitHub Environment와 외부 계정을 먼저 연결한다.

## 1. 공개 베타 차단 항목

### 1.1 도메인과 브랜드

- [ ] `책결` 상표·앱 이름 중복을 검색하고 최종 명칭을 확정한다.
- [ ] 서비스 도메인과 초대용 짧은 도메인을 확보한다.
- [ ] 고객지원 이메일과 개인정보 문의 이메일을 만든다.
- [ ] iOS bundle ID `com.bookgyeol.app`, Android package `com.bookgyeol.app`을 최종 조직 ID에 맞게 확정한다.

이 단계가 뒤늦게 바뀌면 OAuth redirect, APNs/FCM, Universal Links, 스토어 레코드를 모두 다시 설정해야 한다.

### 1.2 인증

개인 VIP 사용 단계는 아래 항목이 이미 구현되어 있으므로 Supabase가 필요하지 않다.

- [x] 첫 계정만 허용하는 이메일·비밀번호 가입과 로그인
- [x] `ALLOW_DEV_AUTH=false`, `LOCAL_AUTH_ENABLED=true`로 개발 헤더 우회 차단
- [x] Android SecureStore와 서버 해시 세션 저장
- [x] Tailscale Serve HTTPS로 사설망 외부 접속

공개 베타로 확장할 때는 비밀번호 복구·이메일 인증 또는 소셜 인증과 로그인 rate limit을 추가한다.

- [ ] 운영·스테이징 Supabase 프로젝트를 분리해 만든다.
- [ ] 비대칭 Auth signing key와 JWKS가 활성화됐는지 확인한다.
- [ ] Kakao·Google·Apple OAuth 앱을 만들고 Supabase 공급자에 연결한다.
- [ ] Redirect URLs에 `bookgyeol://auth/callback`과 운영 HTTPS callback을 등록한다.
- [ ] 모바일에는 publishable key만, 서버 비밀 저장소에는 서비스용 키만 넣는다.
- [ ] 서버 비밀 저장소에 Supabase Auth 관리용 `service_role` 키를 넣고 계정 삭제를 스테이징에서 시험한다.

서버:

```dotenv
ALLOW_DEV_AUTH=false
LOCAL_AUTH_ENABLED=false
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_JWT_ISSUER=https://PROJECT_REF.supabase.co/auth/v1
SUPABASE_JWKS_URL=https://PROJECT_REF.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_SERVICE_ROLE_KEY=서버_전용_service_role_키
ADMIN_API_KEY=32자_이상의_무작위_운영자_비밀
```

소셜 로그인 UI를 다시 도입할 때의 모바일 환경:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

운영에서 `ALLOW_DEV_AUTH=true`가 남으면 임의 사용자 헤더로 접근할 수 있으므로 배포 파이프라인에서 금지 규칙을 둔다. 현재 개인 모드는 `LOCAL_AUTH_ENABLED=true`이므로 Supabase 변수가 필요 없다.

### 1.3 도서 카탈로그

- [ ] Kakao Developers 앱을 만들고 도서 검색 사용 조건·쿼터를 확인한다.
- [ ] REST API 키를 서버 비밀 저장소에 `KAKAO_REST_API_KEY`로 넣는다.
- [ ] ISBN·표지·설명 저장 및 표시가 약관에 맞는지 법무/운영 확인을 받는다.
- [ ] 검색 장애 시 로컬 카탈로그 폴백과 수동 등록이 동작하는지 스테이징에서 시험한다.

### 1.4 PostgreSQL과 서버

- [ ] 한국 사용자 지연 시간이 낮은 리전에 PostgreSQL 17 호환 DB를 만든다.
- [ ] API와 Worker를 분리 프로세스로 배포한다.
- [ ] `migrations/000001`부터 `000006`까지 순서대로 적용한다.
- [ ] 자동 백업, 최소 7일 PITR, 암호화, 제한된 네트워크 접근을 켠다.
- [ ] API 도메인, TLS, 헬스 체크 `/healthz`, 무중단 배포를 설정한다.
- [ ] Worker를 1개 이상 상시 실행하고 실패 전달 큐를 경보로 연결한다.
- [ ] `ALLOWED_ORIGINS`를 실제 웹 도메인만 포함하도록 제한한다.
- [ ] DB 연결 문자열·OAuth 키·카탈로그 키를 저장소가 아닌 비밀 관리자에서 주입한다.
- [ ] Fly.io staging·production 앱과 앱별 deploy token을 만들고 API·Worker를 각각 1대 이상 유지한다.
- [ ] GitHub `staging`·`production` Environment에 Fly 앱 이름, health URL, deploy token을 등록한다.

```dotenv
DATABASE_URL=postgres://...
PORT=8080
ALLOWED_ORIGINS=https://app.example.com
KAKAO_REST_API_KEY=...
PUBLIC_APP_URL=https://links.example.com
ADMIN_API_KEY=32자_이상의_무작위_값
```

### 1.5 푸시와 EAS

- [x] Expo/EAS 프로젝트를 만들고 `app.json`의 `extra.eas.projectId`를 연결한다.
- [ ] Apple Developer에서 APNs 키, Google/Firebase에서 FCM v1 서비스 계정을 만든다.
- [ ] EAS credentials에 APNs/FCM을 등록한다.
- [ ] 서버 Worker에 Expo Push API 주소를 설정한다.
- [ ] 개발 빌드와 운영 빌드의 실제 기기에서 권한 거절·허용·토큰 갱신·알림 탭 이동을 시험한다.
- [ ] Expo push receipt 조회 잡을 추가하고 `DeviceNotRegistered` 토큰을 정리한다.
- [ ] GitHub `mobile-preview`·`mobile-production` Environment에 Expo token, owner, EAS project ID를 등록한다.
- [x] Android 최초 EAS build를 실행해 원격 서명 자격 증명을 만들었다.

```dotenv
EXPO_PUSH_URL=https://exp.host/--/api/v2/push/send
```

Android Expo Go에서는 원격 푸시가 동작하지 않으므로 development build 또는 배포 빌드가 필요하다.

### 1.6 초대 링크

- [ ] `https://도메인/invite/{token}`과 `/group-invite/{token}` 랜딩을 만든다.
- [ ] iOS Associated Domains와 `apple-app-site-association`을 설정한다.
- [ ] Android intent filter와 `assetlinks.json`을 설정한다.
- [ ] 앱 설치됨/미설치, 링크 만료, 이미 친구, 자기 초대, 차단 관계를 실기기에서 검증한다.
- [ ] `deploy/app-links` 템플릿에 Apple Team ID와 최종 Android 서명 지문을 넣어 `.well-known` 경로에 배포한다.
- [ ] API `PUBLIC_APP_URL`과 모바일 `EXPO_PUBLIC_APP_LINK_DOMAIN`을 같은 HTTPS 호스트로 설정한다.

모바일 빌드 환경:

```dotenv
EXPO_PUBLIC_APP_LINK_DOMAIN=links.example.com
```

HTTPS 폴백이 없으면 앱 미설치 사용자는 초대를 열 수 없다.

### 1.7 법적 문서와 운영 안전

- [ ] 개인정보처리방침, 이용약관, 커뮤니티 가이드, 저작권 신고 절차를 게시한다.
- [ ] 수집 데이터, 공개 범위, 푸시, 카메라, 보관 기간, 탈퇴 삭제 범위를 명시한다.
- [ ] `/admin` 운영 화면을 VPN/IAP/SSO 또는 허용 IP 뒤에 두고 공개 인터넷에서 직접 노출하지 않는다.
- [ ] 운영자 키 회전, 처리 담당자·SLA·제재 단계·이의제기 절차를 정한다.
- [ ] 사용자 생성 댓글과 공개 프로필을 포함한 스토어 UGC 요구사항을 충족한다.
- [ ] 미성년자 대상 여부와 앱 연령 등급을 결정한다.

## 2. 스토어 출시 작업

- [ ] Apple Developer Program과 Google Play Console 조직 계정을 개설한다.
- [ ] 개인정보 라벨/Data safety, 카메라·알림 권한 설명을 작성한다.
- [ ] 아이콘, 스플래시, 스크린샷, 미리보기, 한국어 설명, 지원 URL을 준비한다.
- [ ] 내부 테스트 → 비공개 베타 → 단계적 출시 순으로 배포한다.
- [ ] OAuth와 계정 삭제를 심사자가 재현할 수 있는 테스트 계정을 제공한다.
- [x] EAS Build/Submit 파이프라인과 원격 빌드 번호 자동 증가 규칙을 구현한다.
- [ ] App Store Connect numeric app ID와 Google/Apple 제출 자격 증명을 EAS에 연결한다.
- [ ] GitHub production Environment에 required reviewer를 지정한다.

## 3. 관측·보안·운영 권장 항목

- [ ] API 구조화 로그를 중앙 수집하고 요청 ID를 추가한다.
- [ ] 모바일 크래시·성능 추적, API 오류율·p95 지연, DB 연결, Worker 적체를 모니터링한다.
- [ ] 5xx 증가, `/healthz` 실패, outbox/notification pending 적체, 백업 실패 경보를 만든다.
- [ ] 의존성·컨테이너·비밀 노출 검사를 CI에 넣는다.
- [ ] API rate limit, 초대 생성 제한, 신고 남용 제한, 카탈로그 캐시를 적용한다.
- [ ] 복구 훈련으로 백업에서 별도 환경 복원을 실제 수행한다.
- [ ] 운영자 DB 직접 접근을 최소화하고 감사 로그를 보존한다.

## 4. 출시 직전 검증 명령

```bash
go test ./...
cd apps/mobile
pnpm typecheck
pnpm lint
pnpm exec expo export --platform web
```

추가로 iOS/Android development build에서 로그인, 카메라, 백그라운드 복귀 동기화, 푸시, 딥링크, 다크모드, 큰 글자, 네트워크 단절을 실제 기기로 확인한다.
