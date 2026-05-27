#!/bin/sh
# Backup diário — roda dentro do container `backup`
# Output: /backups/db-YYYYMMDD.sql.gz + uploads-YYYYMMDD.tar.zst
# Rotação: apaga > BACKUP_KEEP_DAYS

set -eu

TS=$(date +%Y%m%d)
KEEP="${BACKUP_KEEP_DAYS:-30}"

echo "[$(date -Iseconds)] === backup start ==="

# 1) Dump Postgres (gzip — alto compressão ratio com text)
pg_dump --clean --if-exists --no-owner --no-acl --quote-all-identifiers \
  | gzip -9 > "/backups/db-${TS}.sql.gz"
echo "[$(date -Iseconds)] DB dump: $(du -h /backups/db-${TS}.sql.gz | cut -f1)"

# 2) Tar /uploads com zstd (rápido + bom)
tar --zstd -cf "/backups/uploads-${TS}.tar.zst" -C /uploads .
echo "[$(date -Iseconds)] uploads tar: $(du -h /backups/uploads-${TS}.tar.zst | cut -f1)"

# 3) Rotação — apaga > KEEP dias
find /backups -name "db-*.sql.gz" -type f -mtime "+${KEEP}" -delete
find /backups -name "uploads-*.tar.zst" -type f -mtime "+${KEEP}" -delete

echo "[$(date -Iseconds)] === backup done ==="
df -h /backups | tail -1
ls -lh /backups | tail -10
