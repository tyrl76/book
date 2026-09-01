# 단일 VM 배포

`compose.yml`은 PostgreSQL, migration, Go API, Worker와 Caddy HTTPS 프록시를 하나의 VM에 분리된 컨테이너로 실행한다.

## 최초 배포

```bash
cd /opt/bookgyeol/repo/deploy/vm
cp .env.example .env
chmod 600 .env
# .env의 비밀과 도메인을 실제 값으로 교체한다.
docker compose config --quiet
docker compose build api
docker compose up -d db
docker compose run --rm migrate
docker compose up -d api worker caddy
curl --fail --show-error "https://${APP_DOMAIN}/healthz"
```

PostgreSQL은 호스트 포트를 공개하지 않고 내부 Docker 네트워크에서만 접근한다. `/admin`과 `/v1/admin/*`은 Caddy Basic Auth와 애플리케이션의 `ADMIN_API_KEY`로 이중 보호한다. 빈 개인 DB를 제3자가 먼저 선점하지 못하도록 `/v1/auth/register`도 Basic Auth로 보호하며, 최초 계정은 운영자가 인증된 요청으로 생성한다.

## 개발 모드 무인증 접근

개인 개발 중 브라우저 인증, `ADMIN_API_KEY`, 앱 최초 가입 제한을 모두 생략하려면 VM의 `.env`에 다음 두 값을 설정한다.

```dotenv
ADMIN_OPEN_ACCESS=true
CADDYFILE_NAME=Caddyfile.dev
```

그다음 API와 Caddy를 다시 생성한다.

```bash
docker compose build api
docker compose up -d --force-recreate api worker caddy
```

이 모드에서는 `/admin`, `/v1/admin/*`, `/v1/auth/register`가 공개 인터넷에서 인증 없이 열리므로 개인 개발 단계에서만 사용한다. 운영 전환 전에는 `ADMIN_OPEN_ACCESS=false`, `CADDYFILE_NAME=Caddyfile`로 되돌리고 서비스를 다시 생성한다. 값을 되돌리지 않으면 누구나 운영 로그를 열람하고 최초 계정을 생성할 수 있다.

## 업데이트

```bash
cd /opt/bookgyeol/repo
git pull --ff-only origin main
cd deploy/vm
docker compose build api
docker compose run --rm migrate
docker compose up -d --remove-orphans api worker caddy
docker image prune -f
```

## Android APK 고정 다운로드 주소

현재 Android 빌드는 아래 고정 주소로 배포한다. APK가 바뀌어도 휴대폰에서는 같은 주소를 사용한다.

```text
https://34-64-97-191.sslip.io/download/
https://34-64-97-191.sslip.io/download/bookgyeol-latest.apk
```

PC에서 새 APK를 빌드한 다음 저장소 루트에서 게시 스크립트를 실행한다.

```powershell
.\deploy\vm\publish-android.ps1 -ApkPath .\bin\bookgyeol-android-v1.0.0-4.apk
```

스크립트는 APK의 패키지명, 버전 증가, 기존 앱과 동일한 서명 지문을 확인하고 서버의 파일을 원자적으로 교체한 다음 HTTPS 응답까지 검증한다. Android는 낮거나 같은 `versionCode`의 APK를 업데이트로 거부할 수 있으므로 새 빌드마다 `apps/mobile/app.json`의 `expo.android.versionCode`를 증가시킨다. 앱 서명 키도 기존 버전과 같아야 하며, 서명이 달라지면 설치된 앱 위에 업데이트할 수 없다.

APK 게시가 성공하면 기본적으로 Expo Web 빌드도 이어서 실행하여 아래 주소를 같은 소스로 갱신한다.

```text
https://34-64-97-191.sslip.io/app/
```

웹앱만 갱신하려면 다음 명령을 실행한다.

```powershell
.\deploy\vm\publish-web.ps1
```

긴급하게 APK만 교체해야 할 때만 `publish-android.ps1`에 `-SkipWeb`을 지정한다. 웹 배포는 새 릴리스 디렉터리를 완성한 후 `current` 심볼릭 링크를 한 번에 전환하므로 사용 중인 페이지에 불완전한 파일 세트가 노출되지 않는다.

APK 설치는 휴대폰 브라우저에서 직접 승인해야 한다. Play 스토어를 사용하지 않는 이 방식은 파일 다운로드 주소를 고정할 수 있지만 무인 자동 설치는 지원하지 않는다.

## 상태와 로그

```bash
docker compose ps
docker compose logs --tail=200 api
docker compose logs --tail=200 worker
docker compose logs --tail=200 caddy
docker compose exec db psql -U book -d book
```

## 백업

systemd timer를 설치하면 매일 03:15 전후에 백업하고 7일이 지난 로컬 백업을 삭제한다.

```bash
chmod 700 backup.sh
install -m 644 bookgyeol-backup.service /etc/systemd/system/
install -m 644 bookgyeol-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bookgyeol-backup.timer
systemctl start bookgyeol-backup.service
systemctl status bookgyeol-backup.timer
```

백업은 `/opt/bookgyeol/backups`에 권한 600으로 저장된다. 같은 VM 디스크의 논리 백업이므로 디스크 장애 대비에는 별도 객체 저장소 복제가 필요하다.

서버의 80/tcp와 443/tcp가 클라우드 방화벽에서 열려 있어야 Caddy가 인증서를 발급할 수 있다. 인증서 발급 전에는 HTTPS 헬스 체크가 실패하고 Caddy 로그에 ACME 연결 오류가 반복된다.
