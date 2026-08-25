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

PostgreSQL은 호스트 포트를 공개하지 않고 내부 Docker 네트워크에서만 접근한다. `/admin`과 `/v1/admin/*`은 Caddy Basic Auth와 애플리케이션의 `ADMIN_API_KEY`로 이중 보호한다.

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
