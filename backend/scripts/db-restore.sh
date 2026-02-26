#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup-file.dump> [target-db-name]"
  exit 1
fi

BACKUP_FILE="$1"
TARGET_DB="${2:-${DB_NAME:-monitoring}}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-postgres}"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "[restore] backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "[restore] host=${DB_HOST} port=${DB_PORT} db=${TARGET_DB} file=${BACKUP_FILE}"
PGHOST="${DB_HOST}" PGPORT="${DB_PORT}" PGUSER="${DB_USERNAME}" \
  pg_restore --clean --if-exists --no-owner --no-privileges --dbname="${TARGET_DB}" "${BACKUP_FILE}"

echo "[restore] completed"

