# MongoDB operations (production hygiene)

## Least-privilege app user

The application user should **not** use `Atlas admin` or `readWriteAnyDatabase` if you can avoid it. Prefer a **custom role** on a single database that omits `dropDatabase`, `dropCollection`, and cluster management actions.

1. Connect with an administrative user (or MongoDB Atlas UI → Database Access).
2. Edit `create-app-role.mongosh.js`: set `APP_DB` to your database name (the segment after `/` in the connection string).
3. Run with `mongosh`:

```bash
mongosh "YOUR_ADMIN_URI" scripts/mongo/create-app-role.mongosh.js
```

4. Create an application user whose only role is `remoedAppReadWriteLimited` on that database (Atlas: “Custom Role” → pick the privileges from the script if UI-driven).

`readWrite` on a database still includes `dropCollection`. For stricter separation, use backup/archival jobs with a different user.

## Backups and restore drills

**Atlas:** enable Cloud Backup / Point-in-Time Recovery; quarterly restore into a **staging** cluster and run smoke tests.

**Self-hosted / mongodump:**

```bash
# Backup (replace URI; avoid logging password)
mongodump --uri="mongodb+srv://USER:PASS@host/dbname" --out="./backup-$(date +%Y%m%d)"

# Restore to a non-production DB first (drill)
mongorestore --uri="mongodb+srv://USER:PASS@host" --nsInclude="dbname.*" ./backup-YYYYMMDD/dbname
```

Drill checklist:

- Prove you can restore to an empty namespace and start the app against the restored data.
- Record RTO/RPO targets and whether the drill met them.
- Rotate credentials used for backup if shared.

## Field-level PII encryption (app layer)

If `PII_ENCRYPTION_KEY` is set in `.env`, phone-style fields (student/teacher contacts, GCash number on payment details, assessment prefill, referral `studentContact`) are encrypted at rest with AES-256-GCM. Rotate key only with a documented re-encryption migration (not automated here).

## Admin audit trail

Manual credit grants via `POST /api/credits/update` append documents to the `adminauditlogs` collection and are listed via `GET /api/admin/audit-logs?action=admin_credit_grant&limit=100` (admin session/JWT).
