# 책결 (가칭)

> 친한 사람들과 서로의 독서 근황을 나누는 가장 가벼운 방법.

책결은 친구·연인·가족·소그룹이 서로 다른 책을 읽으면서도 시작, 진척, 완독과 짧은 생각을 안전하게 나누는 모바일 우선 소셜 독서 앱이다. 현재 저장소에는 Go API·Worker, PostgreSQL 스키마, Expo 앱과 로컬 실행 환경이 함께 들어 있다. `책결`은 가칭이며 출시 전에 상표·앱 이름·도메인을 확정해야 한다.

## 현재 구현

- Expo 57 + React Native + TypeScript 앱, 시스템·라이트·다크 테마
- 최초 소유자 등록 후 운영자 화면에서 테스트 계정을 추가할 수 있는 개인 로그인, bcrypt 비밀번호 해시, 30일 불투명 세션과 Android 보안 저장소
- Kakao 도서 검색·Google Books 전체 페이지 수 보강·ISBN 카메라 스캔·직접 등록과 로컬 폴백
- 종이책·전자책·오디오북, 검색·상태 필터·정렬·회차 제거를 갖춘 다권 책장, 5개 독서 상태와 재독 회차
- 진척·메모·재실행 복원·일시정지·초기화를 지원하는 타이머, 과거 기록, 네이티브 SQLite 오프라인 큐와 멱등 재전송
- 친구 초대·수락·삭제·차단, 비공개 그룹·초대·그룹 한정 공유
- 시작·25·50·75·완독 피드, 응원, 위치 기반 스포일러 댓글
- 책별 공개 범위와 진척 정밀도, 신고, 프로필, 통계, 목표·주간 리포트
- Expo 푸시 토큰·알림 설정·전달 큐·재시도 Worker
- PostgreSQL 저장 상태·건수 확인, 내 데이터 JSON 내보내기와 개인 계정 완전 삭제
- 운영자 신고 콘솔, 콘텐츠 숨김·제재·복원과 감사 로그

기능별 사용자 동작·API·상태·인수 조건은 [기능 명세표](docs/FEATURE_SPECIFICATION.md), 실제 완료 범위와 남은 작업은 [구현 현황](docs/IMPLEMENTATION_STATUS.md)을 기준으로 한다. Kakao 결과의 ISBN에 Google Books 전체 페이지 수를 보강하고 값이 없거나 판본과 다르면 사용자가 쪽수·퍼센트·오디오 시간을 선택한다. 웹은 개발·QA용이며 첫 출시는 iOS/Android를 우선한다.

## 로컬 실행

필수 도구는 Go 1.25+, Node.js, pnpm, Docker다. 저장소 루트에서 다음 세 프로세스를 각각 실행한다.

```bash
docker compose up -d db
go run ./cmd/api
```

```bash
go run ./cmd/worker
```

```bash
cd apps/mobile
pnpm install
pnpm start
```

Expo 터미널에서 `w`를 누르면 웹, `a`는 Android, `i`는 iOS가 열린다. 기본 주소는 앱 `http://localhost:8081`, API 상태 확인 `http://localhost:8080/healthz`다. Android 에뮬레이터는 API에 `10.0.2.2:8080`, iOS 시뮬레이터는 `127.0.0.1:8080`으로 접근한다.

실제 기기는 `apps/mobile/.env.local`에 개발 PC의 LAN 주소를 지정한다.

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.0.10:8080
```

개발 PostgreSQL은 호스트 `55432`를 사용한다. 초기 컨테이너에는 `migrations/000001`부터 `000006`이 적용되며 샘플 사용자나 책은 넣지 않는다. 앱을 처음 열면 닉네임·이메일·10자 이상 비밀번호로 최초 개인 계정을 만든다. 기존 볼륨에 새 마이그레이션을 반영할 때는 migration runner를 사용하고, 데이터가 있는 볼륨을 단순 삭제하지 않는다.

## 개인 서버 설정

기본 모드는 Supabase 없이 로컬 자격 증명을 쓰는 개인 서버 계정이다. 최초 소유자 등록 후 공개 가입은 자동으로 닫히며, 필요한 테스트 계정은 운영 센터에서 추가한다. 개발 사용자 우회 헤더는 기본적으로 꺼져 있다.

```dotenv
ALLOW_DEV_AUTH=false
LOCAL_AUTH_ENABLED=true
KAKAO_REST_API_KEY=서버용_REST_API_키
GOOGLE_BOOKS_API_KEY=서버용_GOOGLE_BOOKS_API_키
EXPO_PUSH_URL=https://exp.host/--/api/v2/push/send
ADMIN_API_KEY=32자_이상의_운영자_비밀
PUBLIC_APP_URL=https://links.example.com
```

모바일 `apps/mobile/.env.local`에는 공개 가능한 값만 둔다.

```dotenv
EXPO_PUBLIC_API_URL=https://api.example.com
EXPO_PUBLIC_APP_LINK_DOMAIN=links.example.com
```

휴대폰과 PC는 Tailscale에 연결하고 `EXPO_PUBLIC_API_URL`에는 `tailscale serve`의 HTTPS 주소를 사용한다. Funnel은 필요하지 않다. Expo/EAS projectId와 APNs·FCM 자격 증명이 있어야 실제 기기 푸시 토큰이 발급된다. Kakao REST API 키와 DB 접속 문자열은 앱 번들에 넣지 않는다. `EXPO_PUSH_URL`이 비어 있으면 Worker는 전달 대상을 큐에 만들지만 외부로 발송하지 않는다.

App Links와 푸시는 Expo Go가 아닌 development build 또는 배포 빌드에서 검증한다. 비밀번호 원문은 저장하지 않으며 앱 세션은 Android Keystore 기반 SecureStore에, 서버에는 토큰의 SHA-256 해시만 저장한다. 계정을 삭제하면 해당 계정의 서비스 데이터·자격 증명·세션이 함께 삭제된다.

로컬 운영 센터는 `http://localhost:8080/admin`이다. 운영 현황, API 요청 실시간 로그, 신고 큐와 감사 기록을 한 화면에서 확인한다. 실시간 로그는 현재 API 프로세스의 최근 1,000건만 메모리에 보관하고 재시작 시 초기화되므로, 장기 보관은 `stdout` 수집 시스템을 별도로 연결한다. `ADMIN_API_KEY`는 브라우저 탭 세션에만 보관하며 URL이나 로그에 포함하지 않는다. 운영에서는 이 경로를 IAP/SSO 또는 제한된 네트워크 뒤에 둔다. HTTPS 초대 링크에 필요한 도메인 파일은 `deploy/app-links` 템플릿을 사용한다.

전체 계정·인프라·스토어 작업은 [외부·인프라 체크리스트](docs/EXTERNAL_SETUP.md)에 정리돼 있다.

## 검증

```bash
go test ./...
cd apps/mobile
pnpm typecheck
pnpm lint
pnpm exec expo export --platform web
```

웹 빌드는 `https://34-64-97-191.sslip.io/app/`에 사용자용 웹앱으로 배포한다. 웹에서는 네이티브 푸시 등록을 비활성화하고, Expo SQLite의 OPFS 다중 탭 충돌을 피하기 위해 브라우저 `localStorage` 캐시 어댑터를 사용한다. `deploy/vm/publish-android.ps1`은 APK 게시 후 웹앱도 기본적으로 함께 갱신하며, 웹만 갱신할 때는 `deploy/vm/publish-web.ps1`을 실행한다.

## 배포 파이프라인

모든 PR과 `main` push에서 Go 테스트·DB migration·Expo 정적 검증·production 컨테이너 빌드를 수행한다. staging은 CI 성공 후 자동 배포할 수 있고, production 서버와 EAS 모바일 빌드·제출은 GitHub Environment 승인 뒤 수동 실행한다.

```bash
# 운영 이미지와 동일한 로컬 빌드
docker build -t bookgyeol:local .

# 빈 PostgreSQL에 순서대로 migration 적용
DATABASE_URL=postgres://... go run ./cmd/migrate
```

배포 흐름, GitHub secret/variable, Fly.io, EAS, 스토어 최초 설정과 복구 절차는 [배포 파이프라인](docs/DEPLOYMENT_PIPELINE.md)을 따른다.

## 문서

- [기능 명세표](docs/FEATURE_SPECIFICATION.md): 전체 기능 ID, 사용자 흐름, 화면·API, 상태, 인수 조건, 외부 의존성
- [최종 제품 기획서](docs/PRODUCT_PLAN_V2.md): 시장 비교, 사용자, 정책, 화면, 지표, 출시 계획
- [구현 현황](docs/IMPLEMENTATION_STATUS.md): 실행 가능한 기능, 외부 연결 기능, 후속 로드맵
- [외부·인프라 체크리스트](docs/EXTERNAL_SETUP.md): 소유자가 직접 해야 하는 베타·출시 준비
- [배포 파이프라인](docs/DEPLOYMENT_PIPELINE.md): CI/CD, 환경별 배포, secret, migration, 복구 절차
- [기술 설계](docs/TECHNICAL_DESIGN.md): 아키텍처, 데이터 모델, 보안, 배포 구조
- [OpenAPI](api/openapi.yaml): 현재 Go 서버 REST 계약
- [초기 제품 설계](docs/PRODUCT_SPEC.md): v1 의사결정 기록

## 제품 방향

- 한국 모바일 사용자를 먼저 대상으로 한다.
- 일방향 팔로우보다 상호 수락한 친구와 2~20명 소그룹을 우선한다.
- 전자책 뷰어를 만들지 않고 종이책·전자책·오디오북의 과정을 기록한다.
- 원시 업데이트를 모두 노출하지 않고 시작·25·50·75·완독 이벤트를 피드로 만든다.
- 메모는 기본 비공개이며, 친구·특정 그룹·전체 공개를 책별로 선택한다.
- 같은 책의 대화는 상대가 해당 지점에 도달하기 전까지 잠근다.

핵심 성공 조건은 신규 사용자가 첫날 책 한 권과 친구 한 명을 연결하고, 7일 안에 양쪽 모두 진척을 기록한 뒤 상대 기록에 한 번 이상 반응하는 것이다.
