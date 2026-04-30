#!/usr/bin/env bash
# scripts/backup-db.sh — Backup PostgreSQL ke file gzip, retensi 14 hari
#
# Contoh cron (setiap hari pukul 02:00 server time):
#   0 2 * * * /path/to/pos-frozen-food/scripts/backup-db.sh >> /var/log/pos-backup.log 2>&1
#
# Jalankan manual:
#   bash scripts/backup-db.sh
#
# Membutuhkan: pg_dump, gzip, DIRECT_URL di environment atau .env.local

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${ROOT_DIR}/backups"
RETENTION_DAYS=14
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz"

# ── Load env ─────────────────────────────────────────────────────────────────
for ENV_FILE in "${ROOT_DIR}/.env.local" "${ROOT_DIR}/.env"; do
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    break
  fi
done

if [ -z "${DIRECT_URL:-}" ]; then
  echo "[ERROR $(date)] DIRECT_URL tidak ditemukan. Set variabel environment DIRECT_URL." >&2
  exit 1
fi

# ── Backup ───────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Memulai backup → ${BACKUP_FILE}"
pg_dump "$DIRECT_URL" | gzip > "$BACKUP_FILE"
SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"
echo "[$(date)] Backup selesai. Ukuran: ${SIZE}"

# ── Retention ────────────────────────────────────────────────────────────────
echo "[$(date)] Menghapus backup lebih dari ${RETENTION_DAYS} hari..."
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
REMAINING="$(find "$BACKUP_DIR" -name "backup_*.sql.gz" | wc -l | tr -d ' ')"
echo "[$(date)] Selesai. ${REMAINING} file backup tersisa."
