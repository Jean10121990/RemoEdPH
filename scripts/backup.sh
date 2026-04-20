#!/usr/bin/env bash
#
# RemoEdPH — MongoDB backup (mongodump → gzip archive) for Hostinger VPS / Linux.
#
# Prereqs: mongodb-database-tools (mongodump) installed, e.g.:
#   Ubuntu/Debian: apt install mongodb-database-tools
#
# One-time on VPS:
#   sudo mkdir -p /backups && sudo chmod 700 /backups
#   sudo mkdir -p /etc/remoed && sudo chmod 700 /etc/remoed
#   sudo nano /etc/remoed/backup.env   # put: MONGODB_URI='mongodb+srv://...'
#   sudo chmod 600 /etc/remoed/backup.env
#   sudo cp /path/to/repo/scripts/backup.sh /usr/local/bin/remoed-mongodb-backup.sh
#   sudo chmod 700 /usr/local/bin/remoed-mongodb-backup.sh
#
# Cron (daily 02:00 server time):
#   0 2 * * * /bin/bash /usr/local/bin/remoed-mongodb-backup.sh >> /backups/backup-cron.log 2>&1
#
set -euo pipefail

# Optional secrets file (recommended on production — do not commit credentials).
if [[ -f /etc/remoed/backup.env ]]; then
  # shellcheck source=/dev/null
  set -a
  source /etc/remoed/backup.env
  set +a
fi

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "$(date -Is) ERROR: MONGODB_URI is not set. Export it or add it to /etc/remoed/backup.env" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_NAME="remoed-mongodump-${STAMP}.archive.gz"
LOG_LINE() { echo "$(date -Is) $*"; }

if ! command -v mongodump >/dev/null 2>&1; then
  LOG_LINE "ERROR: mongodump not found. Install mongodb-database-tools." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

DEST="${BACKUP_DIR}/${ARCHIVE_NAME}"
LOG_LINE "Starting mongodump → ${DEST}"

# Single compressed stream (standard for automated Mongo backups).
mongodump --uri="${MONGODB_URI}" --gzip --archive="${DEST}"

LOG_LINE "mongodump finished (${ARCHIVE_NAME})"

# Remove backup archives older than RETENTION_DAYS (GNU find mtime; Hostinger VPS is Linux).
# +N = last modified more than N*24 hours ago (keeps roughly the last week when N=7).
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'remoed-mongodump-*.archive.gz' \
  -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null | while read -r removed; do
  LOG_LINE "Deleted old backup: ${removed}"
done || true
LOG_LINE "Retention: removed files older than ${RETENTION_DAYS} days (if any)."

LOG_LINE "Done."
