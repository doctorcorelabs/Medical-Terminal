# Production Deployment Runbook
**Date:** 2026-03-26  
**Status:** Ready for Execution  
**Stability Check:** ✅ Pass (Staging KPI: 0 errors, 8/8 tests passing)

---

## Executive Summary

Session exclusivity hardening is **stable in staging** and ready for **phased production rollout**:
- ✅ **8/8 worker security tests** passing (rate limiting, replay protection, device binding, session state)
- ✅ **Concurrent takeover** validated safe (concurrency lock guarantee)
- ✅ **Staging metrics** clean (120-min lookback: 0 errors, 0 complaints)
- ✅ **Build validation** successful (1498 modules, no regressions)

**Rollout Strategy:** Canary 10% → 20% → 50% → 100% with 30-min stability gate between steps.

---

## Phase 1: Production Worker Deployment (Immediate)

### Step 1a: Update Production Worker Code

**Worker:** `cloudflare/session-worker/src/index.js`  
**Current State:** Staging-tested, ready for production  
**Deployment Method:** Wrangler production environment

```powershell
cd cloudflare/session-worker
npx --yes wrangler deploy --env production
```

**Expected Output:**
```
Total Upload: 8.86 KiB / gzip: 2.62 KiB
Uploaded medical-terminal-session-worker (X.XX sec)
Deployed medical-terminal-session-worker triggers (X.XX sec)
https://medical-terminal-session-worker.daivanfebrijuansetiya.workers.dev
Current Version ID: <version-hash>
```

**Verification Post-Deploy:**
```powershell
curl -X GET "https://medical-terminal-session-worker.daivanfebrijuansetiya.workers.dev/" `
  -H "Authorization: Bearer <session-token>" `
  -H "User-Agent: ProductionSmokeTest"
# Expected: 400 Bad Request (no heartbeat data) or 401 (invalid token)
# NOT: 500 (would indicate deploy failure)
```

---

### Step 1b: Apply Production SQL Migration

**Target:** Production Supabase (hvhsoscduqektunuryky)  
**Migration:** `migration_exclusive_session_v1.sql`  
**Status:** Already applied to staging, tested with concurrent takeover

```powershell
npx supabase db query --linked --file migration_exclusive_session_v1.sql
```

**Verification:**
```powershell
npx supabase db query --linked "
  SELECT proname, pg_get_function_result(oid) as returns 
  FROM pg_proc 
  WHERE proname = 'takeover_exclusive_session';"
```

**Expected Return Signature:**
```
TABLE(success boolean, code text, message text, deactivated_sessions integer, reactivated_current boolean)
```

---

## Phase 2: Gradual Canary Rollout (30 minutos per step)

### Step 2a: Canary 10% (5-15 minutes)

**Configuration:**
```env
VITE_SESSION_WORKER_CANARY_PERCENT=10
VITE_SESSION_WORKER_CANARY_URL=https://medical-terminal-session-worker.daivanfebrijuansetiya.workers.dev
VITE_SESSION_WORKER_PRIMARY_URL=https://medical-terminal-session-worker.daivanfebrijuansetiya.workers.dev
```

**Note:** In production both canary and primary point to same worker (gradual code rollout via feature flags).

**Deploy Frontend:**
```powershell
npm run build
npm run deploy  # or your Netlify/Vercel deployment
```

**Monitor KPIs:**
```powershell
$env:LOOKBACK_MINUTES = "30"
node scripts/session-security/monitor-canary-metrics.mjs
```

**Success Criteria (all must pass):**
- ✅ Heartbeat 429 count ≤ 5 (acceptable threshold, not 0)
- ✅ Heartbeat 401 count = 0 (no auth failures)
- ✅ Heartbeat 403 count = 0 (no device binding rejections)
- ✅ Kicked detections = 0 (no false session terminations)
- ✅ False-kick complaints ≤ 2 (users can report issues)
- ✅ Takeover latency p95 < 500ms (acceptable performance)

**Wait Time:** 10-15 minutes to observe metrics

**If Failed:** Rollback to 0% canary and investigate
```powershell
$env:VITE_SESSION_WORKER_CANARY_PERCENT = "0"
npm run build && npm run deploy
```

---

### Step 2b: Canary 20% (30+ minutes observation)

**Configuration:**
```env
VITE_SESSION_WORKER_CANARY_PERCENT=20
```

**Deploy:** `npm run build && npm run deploy`

**Monitor:** Same KPI script, same success criteria

**Escalation:** If 20% stable for 30 min, proceed to Phase 3

---

### Step 2c: Canary 50% (30+ minutes observation)

**Configuration:**
```env
VITE_SESSION_WORKER_CANARY_PERCENT=50
```

**Deploy:** `npm run build && npm run deploy`

**Monitor:** Same KPI script, enhanced monitoring (check Sentry/error tracking)

**Escalation:** If 50% stable for 30 min, proceed to Phase 3

---

## Phase 3: Enable Strict Replay Protection (Post-Canary Stability)

### Step 3a: Deploy with ENFORCE_HEARTBEAT_REPLAY_PROTECTION=true

**Prerequisites:**
- ✅ Canary 50% stable for 30+ minutes with 0 unexpected errors
- ✅ No regression in takeover latency p95

**Deployment:**
```powershell
cd cloudflare/session-worker
npx wrangler deploy `
  --env production `
  -c "vars.ENFORCE_HEARTBEAT_REPLAY_PROTECTION=true"
```

**OR via PowerShell script:**
```powershell
pwsh -File scripts/session-security/deploy-session-worker-staging.ps1 `
  -AllowedOrigins "https://medicalterminal.app,https://www.medicalterminal.app" `
  -EnforceReplayProtection $true `
  -Environment "production"
```

**Expect:** Possible 400 errors from clients on outdated versions (missing x-session-nonce header)

**Monitor for 10 minutes:**
```powershell
node scripts/session-security/monitor-canary-metrics.mjs
```

**Expected Behavior:**
- Small spike in 400 errors (< 2% of heartbeats) from old clients
- No increase in 429 (rate limit) or 403 (device binding)
- Takeover latency p95 unchanged

**If 400 Errors > 5% of Heartbeats:** Rollback to `ENFORCE_HEARTBEAT_REPLAY_PROTECTION=false`

---

### Step 3b: Canary 100% (Final Step)

**Configuration:**
```env
VITE_SESSION_WORKER_CANARY_PERCENT=100
```

**Deploy:** `npm run build && npm run deploy`

**Monitor:** Full 30-minute stable observation

**Success Criteria:**
- ✅ All KPI same as baseline (0 429, 0 401/403, 0 kicked)
- ✅ No increase in error rates
- ✅ Takeover p95 latency consistent

---

## Phase 4: Production Traffic Observation (Ongoing)

### KPI Dashboard Setup

**Setup Automated Monitoring (Recommended):**
```powershell
# Create a Windows scheduled task
$trigger = New-ScheduledTaskTrigger -RepetingInterval (New-TimeSpan -Minutes 15) -At (Get-Date) -RepeatIndefinitelly
$action = New-ScheduledTaskAction -Execute "node" -Argument "scripts/session-security/monitor-canary-metrics.mjs" -WorkingDirectory "E:\Website\Medical Terminal"
Register-ScheduledTask -TaskName "SessionSecurityMonitoring" -Trigger $trigger -Action $action -RunLevel Highest
```

**Manual Monitoring (Every 15 minutes):**
```powershell
node scripts/session-security/monitor-canary-metrics.mjs
```

### Alert Thresholds

| Metric | Yellow Alert | Red Alert | Action |
|--------|-----|------|--------|
| Heartbeat 429 count/30min | > 10 | > 50 | ⚠️ Review, 🛑 Rollback |
| Heartbeat 401 count/30min | > 5 | > 20 | ⚠️ Review auth issues |
| Heartbeat 403 count/30min | > 5 | > 20 | 🛑 Device binding broken |
| False-kick complaints | > 5 | > 15 | ⚠️ Investigate kicked state |
| Takeover p95 latency | > 700ms | > 1500ms | ⚠️ Performance issue |

---

## Rollback Procedure (If Anything Goes Wrong)

### Quick Rollback (< 5 minutes)

**Option 1: Disable Canary (Keep Production Live)**
```powershell
$env:VITE_SESSION_WORKER_CANARY_PERCENT = "0"
npm run build && npm run deploy
```

**Option 2: Disable Replay Protection (Keep Worker Live)**
```powershell
cd cloudflare/session-worker
npx wrangler deploy --env production -c "vars.ENFORCE_HEARTBEAT_REPLAY_PROTECTION=false"
```

**Option 3: Full Rollback (Use Previous Version)**
```powershell
cd cloudflare/session-worker
npx wrangler deployments list --env production
npx wrangler deployments rollback --env production --version <previous-version-id>
```

### Emergency Rollback (Session Guard Disabled)

If production is critically broken:
1. **Disable Session Guard in Frontend:**
   ```javascript
   // src/context/AuthContext.jsx - Comment out ExclusiveSessionGuard
   // Allows users to login without session check (temporary)
   ```
2. **Rebuild and Deploy:** `npm run build && npm run deploy`
3. **Notify Users:** Post-incident communication

---

## Post-Deployment Checklist

- [ ] Step 1a: Worker deployed to production
- [ ] Step 1b: SQL migration applied to production DB
- [ ] Step 2a: Canary 10% stable (10-15 min observation)
- [ ] Step 2b: Canary 20% stable (30 min observation)
- [ ] Step 2c: Canary 50% stable (30 min observation)
- [ ] Step 3a: Replay protection enabled + monitoring (10 min)
- [ ] Step 3b: Canary 100% + final verification (30 min)
- [ ] Phase 4: Automated KPI monitoring setup
- [ ] Alert thresholds configured
- [ ] Team notified of successful rollout
- [ ] Documentation updated

---

## Success Metrics (Post-Deployment)

**After 1 hour of 100% canary traffic:**
- ✅ Heartbeat success rate > 99% (< 1% 4xx/5xx)
- ✅ Session takeover latency p95 < 500ms
- ✅ No false-kick complaints (or < 1 per 10k users)
- ✅ Device binding enforced (0 takeovers from unregistered devices)
- ✅ Replay protection working (0 duplicate/expired nonce issues)

---

## Team Communication Template

**Subject: Session Exclusivity Hardening - Production Deployment Complete**

```
Dear Team,

Session exclusivity hardening has been rolled out to production with the following improvements:

✅ **Exclusive Sessions:** One user can only have one active session at a time.
✅ **Device Binding:** Session takeover from unregistered devices is blocked.
✅ **Rate Protection:** Aggressive heartbeat spam (> 90 req/60s) is rate-limited.
✅ **Replay Prevention:** Timestamp + nonce prevents heartbeat replay attacks.

**Rollout Method:** Phased canary (10% → 20% → 50% → 100%)
**Stability:** All KPI metrics passing, no error rate increase.

If you encounter session kicked issues:
1. Check if you're logging in from a new device (legitimate kick)
2. Use "Laporkan Jika Ini Keliru" button to report false positives
3. Contact support with your device ID and session logs

Thank you!
```

---

## Appendix: Technical Details

### Database Function Signature (Production)
```sql
CREATE OR REPLACE FUNCTION public.takeover_exclusive_session(...)
RETURNS TABLE(
  success BOOLEAN,
  code TEXT,
  message TEXT,
  deactivated_sessions INTEGER,
  reactivated_current BOOLEAN
)
```

### Worker Endpoint (Production)
```
POST https://medical-terminal-session-worker.daivanfebrijuansetiya.workers.dev
Headers:
  Authorization: Bearer <session_id>
  User-Agent: <client-agent>
  Origin: https://medicalterminal.app (or configured origin)
  x-session-timestamp: <unix-ms> (required if replay protection enabled)
  x-session-nonce: <base64-random> (required if replay protection enabled)

Response: 
  200 OK { success: true, locked: false, ... }
  401 Unauthorized (invalid session)
  403 Forbidden (device mismatch or not primary)
  429 Too Many Requests (rate limit exceeded)
  400 Bad Request (missing replay headers if enforced)
```

### Canary Routing Formula
```javascript
userBucket = sha256(userId).chars.reduce((s,c) => s + c.charCodeAt(0), 0) % 100
isCanary = userBucket < VITE_SESSION_WORKER_CANARY_PERCENT
```

*Deterministic per-user allocation, order-independent.*

---

**Last Updated:** 2026-03-26 | **Prepared By:** Deployment Agent | **Status:** Ready for Rollout
