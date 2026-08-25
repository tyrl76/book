#!/bin/sh
set -eu

deploy_dir="${BOOKGYEOL_DEPLOY_DIR:-/opt/bookgyeol/repo/deploy/vm}"
backup_dir="${BOOKGYEOL_BACKUP_DIR:-/opt/bookgyeol/backups}"
retention_days="${BOOKGYEOL_BACKUP_RETENTION_DAYS:-7}"
timestamp="$(date -u +%Y%m%d-%H%M%S)"
backup_file="${backup_dir}/bookgyeol-${timestamp}.dump"
partial_file="${backup_file}.partial"

umask 077
install -d -m 700 "$backup_dir"
cd "$deploy_dir"

cleanup() {
	rm -f -- "$partial_file"
}
trap cleanup EXIT INT TERM

docker compose exec -T db pg_dump \
	-U "${POSTGRES_USER:-book}" \
	-d "${POSTGRES_DB:-book}" \
	-Fc --no-owner >"$partial_file"

mv -- "$partial_file" "$backup_file"
find "$backup_dir" -type f -name 'bookgyeol-*.dump' -mtime "+${retention_days}" -delete
printf 'backup=%s\n' "$backup_file"
