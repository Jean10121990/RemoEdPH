# PM2 (Hostinger KVM)

From the repo root:

```bash
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup
pm2 install pm2-logrotate
```

Useful checks:

```bash
pm2 status
pm2 logs remoedph
curl -sS https://remoedph.com/healthz
```

`GET /healthz` returns 200 when Mongo answers a ping and 503 when it does not. It does not print connection strings.

Atlas: open the cluster → Backup and confirm a daily snapshot exists. Do not drop the `test` database.
