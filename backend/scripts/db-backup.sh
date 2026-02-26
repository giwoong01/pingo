#!/usr/bin/env bash
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_NAME="${DB_NAME:-monitoring}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

mkdir -p "${BACKUP_DIR}"
TS="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/aegis_ops_${DB_NAME}_${TS}.dump"

echo "[backup] host=${DB_HOST} port=${DB_PORT} db=${DB_NAME}"
PGHOST="${DB_HOST}" PGPORT="${DB_PORT}" PGUSER="${DB_USERNAME}" \
  pg_dump --format=custom --file="${OUT_FILE}" "${DB_NAME}"

echo "[backup] created ${OUT_FILE}"

