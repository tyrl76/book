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

```bash
docker compose exec -T db pg_dump -U book -d book -Fc > "book-$(date +%Y%m%d-%H%M%S).dump"
```

서버의 80/tcp, 443/tcp, 443/udp가 클라우드 방화벽에서 열려 있어야 Caddy가 인증서를 발급할 수 있다. 인증서 발급 전에는 HTTPS 헬스 체크가 실패하고 Caddy 로그에 ACME 연결 오류가 반복된다.
