# Session Security Staging Rollout Runbook

## 1) Apply SQL migration (takeover hardening + latency telemetry)

```powershell
pwsh -File scripts/session-security/apply-staging-takeover-migration.ps1 -DbUrl "<STAGING_DB_URL>"
```

Validation query (Supabase SQL editor):

```sql
SELECT proname, proargtypes::regtype[]
FROM pg_proc
WHERE proname = 'takeover_exclusive_session';
```

## 2) Deploy session worker with replay protection OFF first

```powershell
pwsh -File scripts/session-security/deploy-session-worker-staging.ps1 -AllowedOrigins "https://staging.medicalterminal.app,https://medicalterminal.app" -EnforceReplayProtection false
```

## 3) Configure frontend canary to 10-20%

Set env vars on staging frontend:

- `VITE_SESSION_WORKER_URL` = primary worker URL
- `VITE_SESSION_WORKER_CANARY_URL` = canary worker URL
- `VITE_SESSION_WORKER_CANARY_PERCENT` = `10` (then `20`)

## 4) Monitor canary metrics every 10-15 minutes

```powershell
$env:SUPABASE_URL="<STAGING_SUPABASE_URL>"
$env:SUPABASE_SERVICE_ROLE_KEY="<STAGING_SERVICE_ROLE_KEY>"
$env:LOOKBACK_MINUTES="30"
node scripts/session-security/monitor-canary-metrics.mjs
```

Track these KPIs:

- Heartbeat 429 count
- Heartbeat 401 count
- Heartbeat 403 count
- False-kick complaints (`session_false_kick_reported`)
- Takeover latency p95 (`security_events.metadata.duration_ms`)

## 5) Progressive enablement of replay protection

When metrics are stable:

```powershell
pwsh -File scripts/session-security/deploy-session-worker-staging.ps1 -AllowedOrigins "https://staging.medicalterminal.app,https://medicalterminal.app" -EnforceReplayProtection true
```

Suggested gradual rollout:

1. Keep frontend canary at 10% for 30-60 minutes
2. Raise to 20% for 60-120 minutes
3. If stable, raise canary to 50%
4. If stable, promote to 100%

## 6) Rollback path

- Set `VITE_SESSION_WORKER_CANARY_PERCENT=0` immediately.
- Redeploy worker with `-EnforceReplayProtection false`.
- Keep SQL migration as-is (safe to keep).
