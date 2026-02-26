#!/usr/bin/env bash
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_NAME="${DB_NAME:-monitoring}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
REHEARSAL_DB="${DB_NAME}_rehearsal_$(date +%Y%m%d_%H%M%S)"

mkdir -p "${BACKUP_DIR}"
TMP_BACKUP="${BACKUP_DIR}/rehearsal_${DB_NAME}_$(date +%Y%m%d_%H%M%S).dump"

echo "[rehearsal] step1 backup source db=${DB_NAME}"
PGHOST="${DB_HOST}" PGPORT="${DB_PORT}" PGUSER="${DB_USERNAME}" \
  pg_dump --format=custom --file="${TMP_BACKUP}" "${DB_NAME}"

echo "[rehearsal] step2 create temp db=${REHEARSAL_DB}"
PGHOST="${DB_HOST}" PGPORT="${DB_PORT}" PGUSER="${DB_USERNAME}" \
  createdb "${REHEARSAL_DB}"

cleanup() {
  echo "[rehearsal] cleanup drop db=${REHEARSAL_DB}"
  PGHOST="${DB_HOST}" PGPORT="${DB_PORT}" PGUSER="${DB_USERNAME}" \
    dropdb --if-exists "${REHEARSAL_DB}" || true
}
trap cleanup EXIT

echo "[rehearsal] step3 restore into temp db"
PGHOST="${DB_HOST}" PGPORT="${DB_PORT}" PGUSER="${DB_USERNAME}" \
  pg_restore --clean --if-exists --no-owner --no-privileges --dbname="${REHEARSAL_DB}" "${TMP_BACKUP}"

echo "[rehearsal] step4 verify core tables"
PGHOST="${DB_HOST}" PGPORT="${DB_PORT}" PGUSER="${DB_USERNAME}" \
  psql -d "${REHEARSAL_DB}" -c "SELECT COUNT(*) AS users_count FROM users;"
PGHOST="${DB_HOST}" PGPORT="${DB_PORT}" PGUSER="${DB_USERNAME}" \
  psql -d "${REHEARSAL_DB}" -c "SELECT COUNT(*) AS rules_count FROM rules;"
PGHOST="${DB_HOST}" PGPORT="${DB_PORT}" PGUSER="${DB_USERNAME}" \
  psql -d "${REHEARSAL_DB}" -c "SELECT COUNT(*) AS apps_count FROM apps;"

echo "[rehearsal] success"

