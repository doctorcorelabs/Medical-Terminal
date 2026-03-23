# Sync Health Worker

Cloudflare Worker ini mengagregasi event `offline_sync_degraded` dari tabel `user_activity_events` ke `system_health_metrics`.

## Fitur

- Cron aggregation setiap 5 menit (`*/5 * * * *`)
- Endpoint manual `POST /run-sync-health`
- Health endpoint `GET /health`
- Akses manual endpoint: hanya `x-internal-key`/internal bearer atau bearer user dengan role `admin`
- Metrik yang ditulis:
  - `offline_sync_degraded_count`
  - `offline_sync_degraded_users`
  - `offline_sync_warning_avg`

## Prasyarat

Set secrets berikut di Cloudflare Worker:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPS_INTERNAL_KEY`

Opsional:

- `SYNC_HEALTH_LOOKBACK_MINUTES` (default 15)

## Deploy

Dari folder ini:

```bash
npm install
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put OPS_INTERNAL_KEY
npm run deploy
```

Alternatif setup secret interaktif dari root project:

```bash
powershell -ExecutionPolicy Bypass -File ./scripts/setup-sync-health-secrets.ps1
```

## Uji Manual

1. Cek health:

```bash
curl https://<worker-domain>/health
```

2. Jalankan agregasi manual:

```bash
curl -X POST https://<worker-domain>/run-sync-health \
  -H "Authorization: Bearer <OPS_INTERNAL_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"lookbackMinutes":15}'
```

## Respons Sukses (contoh)

```json
{
  "ok": true,
  "lookbackMinutes": 15,
  "insertedMetrics": 3,
  "summarized": {
    "eventCount": 12,
    "uniqueUsers": 4,
    "warningCountTotal": 35,
    "warningAvg": 2.92,
    "topWarningCodes": [
      { "code": "server_row_fetch_failed", "count": 8 }
    ]
  }
}
```
