# 책결 배포 파이프라인

기준일: 2026-08-24

## 1. 확정 배포 구조

```text
Pull request / main push
  └─ GitHub Actions CI
       ├─ Go format, vet, race test
       ├─ PostgreSQL 17 migration + integration test
       ├─ Expo typecheck, lint, web export
       └─ production Docker image build

main CI 성공
  └─ staging 자동 배포 (ENABLE_STAGING_DEPLOY=true일 때만)
       └─ Fly.io: migration → API → Worker → /healthz

수동 production 승인
  └─ 지정한 Git ref를 Fly.io production에 배포

수동 mobile release
  └─ EAS preview 또는 production build
       └─ production + submit=true일 때 스토어 테스트 트랙 제출
```

- 모바일: Expo SDK 57, EAS Build/Submit
- 서버: 동일한 Docker 이미지에서 Go API와 Worker를 별도 Fly.io process group으로 실행
- 데이터베이스: PostgreSQL 17 호환 관리형 DB
- 인증: 스테이징·운영을 분리한 Supabase
- CI/CD: GitHub Actions와 GitHub Environments

Fly.io는 API와 상시 Worker를 같은 이미지의 별도 Machine으로 운영할 수 있어 현재 outbox 구조와 잘 맞는다. Worker가 0대로 축소되면 알림과 계정 삭제가 처리되지 않으므로 `worker=1`을 유지한다.

## 2. 저장소에 구현된 항목

| 파일 | 역할 |
|---|---|
| `.github/workflows/ci.yml` | 모든 PR과 `main` push 검증 |
| `.github/workflows/deploy-backend.yml` | staging 자동 배포와 production 수동 배포 |
| `.github/workflows/release-mobile.yml` | EAS preview/production 빌드와 선택적 제출 |
| `Dockerfile` | API, Worker, migration 실행 파일을 포함한 non-root 이미지 |
| `deploy/fly/fly.toml` | Fly.io 프로세스, 헬스 체크, release migration 설정 |
| `cmd/migrate` | 순서·체크섬·advisory lock이 적용된 DB migration runner |
| `apps/mobile/eas.json` | preview/production 빌드와 production 제출 프로필 |
| `.github/dependabot.yml` | Go, npm, GitHub Actions 주간 업데이트 PR |

## 3. 배포 정책

### 3.1 staging

1. PR에서 CI 필수 검사를 통과한다.
2. `main`에 병합한다.
3. `ENABLE_STAGING_DEPLOY=true`이면 CI 성공 이벤트가 staging 배포를 시작한다.
4. 새 이미지의 `/app/migrate`가 먼저 실행된다.
5. migration이 성공한 경우에만 API와 Worker가 순차 교체된다.
6. 공개 API의 `/healthz`가 성공해야 워크플로가 완료된다.

migration이 실패하면 새 서버 배포도 중단된다. 이미 적용된 migration 파일을 수정하면 체크섬 오류로 실패하므로 수정 대신 새 번호의 SQL 파일을 추가한다.

### 3.2 production

`Deploy backend` 워크플로를 수동 실행하고 `environment=production`, 배포할 tag 또는 commit SHA를 입력한다. GitHub `production` Environment에 required reviewer를 지정해 승인 전에는 secret 접근과 배포가 시작되지 않도록 한다.

스키마 migration은 forward-only다. 서버 코드는 이전 Git SHA를 다시 배포해 롤백할 수 있지만, 이미 적용된 DB 변경은 자동으로 되돌리지 않는다. 새 migration은 최소 한 버전 동안 이전 서버와 호환되도록 expand → migrate data → contract 순서로 작성한다.

### 3.3 mobile

- `preview`: 내부 설치용 Android APK와 iOS internal distribution build
- `production`: 스토어용 Android AAB와 iOS archive, 원격 build number 자동 증가
- `submit=false`: 빌드만 예약하고 워크플로 종료
- `submit=true`: production에서만 허용하며 EAS Submit으로 스토어 테스트 트랙에 제출

스토어 공개 전환은 Play Console과 App Store Connect에서 사람이 검토한 뒤 단계적으로 수행한다. GitHub Actions가 곧바로 전체 사용자에게 공개하지 않는다.

## 4. GitHub 설정

Repository **Settings → Environments**에서 다음 환경을 만든다.

### `staging`

- Secret `FLY_API_TOKEN`: staging 앱 전용 deploy token
- Variable `FLY_APP_NAME`: staging Fly 앱 이름
- Variable `API_HEALTH_URL`: `https://staging-api.example.com`

### `production`

- Secret `FLY_API_TOKEN`: production 앱 전용 deploy token
- Variable `FLY_APP_NAME`: production Fly 앱 이름
- Variable `API_HEALTH_URL`: `https://api.example.com`
- Required reviewers 활성화

### `mobile-preview`, `mobile-production`

- Secret `EXPO_TOKEN`: 최소 권한·만료 정책을 적용한 Expo access token
- Variable `EAS_PROJECT_ID`: EAS 프로젝트 UUID
- Variable `EXPO_OWNER`: Expo account 또는 organization 이름
- `mobile-production`에는 Required reviewers 활성화

Repository variable `ENABLE_STAGING_DEPLOY`는 인프라와 secret 검증이 끝날 때까지 `false`로 둔다. 준비 후 `true`로 바꾸면 다음 `main` CI 성공부터 staging 자동 배포가 활성화된다.

Branch protection에서 `main` 병합 전에 다음 CI job을 필수로 지정한다.

- `Go test and migration`
- `Expo static validation`
- `Production container build`

## 5. Fly.io 최초 1회 설정

스테이징과 운영 앱을 별도로 만든다. 앱 이름은 아래 예시를 실제 값으로 바꾼다.

```bash
fly apps create bookgyeol-staging
fly apps create bookgyeol-production
```

각 앱에 서버 secret을 주입한다. 값은 명령 기록에 남지 않도록 로컬 보안 절차 또는 Fly dashboard를 사용한다.

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_JWT_ISSUER
SUPABASE_JWKS_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_API_KEY
KAKAO_REST_API_KEY
EXPO_PUSH_URL
PUBLIC_APP_URL
ALLOWED_ORIGINS
```

`ALLOW_DEV_AUTH=false`와 `PORT=8080`은 `fly.toml`에 안전 기본값으로 고정돼 있다. production에서 개발 인증이 켜지면 임의 사용자 헤더 접근이 가능해지므로 secret으로 덮어쓰지 않는다.

앱별 deploy token을 만들고 해당 GitHub Environment의 `FLY_API_TOKEN`에 저장한다. 개인 전체 권한 token을 CI에 넣지 않는다.

첫 배포 전 process group 수를 확인한다.

```bash
fly scale count api=1 worker=1 -a bookgyeol-staging
fly scale count api=1 worker=1 -a bookgyeol-production
```

DB는 Fly 앱과 가까운 리전에 두고 TLS 연결 문자열을 사용한다. `deploy/fly/fly.toml`의 기본 primary region은 한국 사용자를 고려해 `nrt`이며, DB 리전이 다르면 함께 변경한다.

기존 스키마를 새 migration runner에 연결할 때는 자동으로 baseline하지 않는다. 빈 DB에는 runner가 `000001`부터 적용한다. 이미 테이블이 있는 DB는 실제 스키마와 migration 5개가 일치하는지 먼저 감사한 뒤 별도 baseline 절차를 만들어야 한다. 불완전한 DB를 baseline하면 누락된 컬럼이 배포 후 런타임 오류로 나타날 수 있다.

## 6. Expo/EAS 최초 1회 설정

Expo SDK 57의 최소 Node.js 버전은 22.13.x이며 CI는 Node 22.17.1과 pnpm 11.19.0을 사용한다.

```bash
cd apps/mobile
pnpm install --frozen-lockfile
npx eas-cli login
npx eas-cli init
```

생성된 EAS project ID를 GitHub `mobile-preview`, `mobile-production` Environment variable `EAS_PROJECT_ID`에 동일하게 넣는다. 앱 공개 환경변수는 EAS의 `preview`와 `production` environment에 각각 등록한다.

```text
EXPO_PUBLIC_API_URL
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
EXPO_PUBLIC_APP_LINK_DOMAIN
```

CI의 비대화형 빌드 전에 로컬에서 플랫폼별 최초 빌드를 한 번 실행해 Android keystore와 iOS 인증서·provisioning profile을 EAS에 생성한다.

```bash
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform ios --profile preview
npx eas-cli build --platform android --profile production
npx eas-cli build --platform ios --profile production
```

App Store Connect 앱을 만든 뒤 숫자 app ID를 `apps/mobile/eas.json`의 `submit.production.ios.ascAppId`에 추가한다. Google Play service account와 Apple ASC API key도 EAS credentials에 연결한다. 이 값들이 없으면 production build는 가능해도 `submit=true` 비대화형 제출은 실패한다.

## 7. 배포 전 검증과 복구

로컬 검증:

```bash
go test ./...
docker build -t bookgyeol:local .
cd apps/mobile
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm exec expo export --platform web
```

배포 직후 확인:

- `/healthz`가 200인지 확인
- API JSON 로그에서 DB/Auth 설정 오류가 없는지 확인
- Worker 로그가 계속 실행되고 outbox를 처리하는지 확인
- staging 실기기에서 로그인, 책 추가, 진척 공유, 푸시를 왕복 검증
- migration 기록과 pending outbox 수를 확인

서버 코드 복구는 `Deploy backend`를 수동 실행해 정상 동작했던 commit SHA를 `ref`에 입력한다. DB 파괴적 변경은 자동 복구되지 않으므로 backup/PITR 복구는 별도 운영 승인 절차로 수행한다.

## 8. 공식 참고 문서

- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/)
- [EAS Build profiles](https://docs.expo.dev/build/eas-json/)
- [EAS Build on CI](https://docs.expo.dev/build/building-on-ci/)
- [EAS Submit profiles](https://docs.expo.dev/submit/eas-json/)
- [Fly.io GitHub Actions deployment](https://fly.io/docs/launch/continuous-deployment-with-github-actions/)
- [Fly.io app configuration](https://fly.io/docs/reference/configuration/)
- [Fly.io access tokens](https://fly.io/docs/security/tokens/)
