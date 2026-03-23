import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function parseDotEnv(dotEnvPath) {
  if (!fs.existsSync(dotEnvPath)) return;
  const content = fs.readFileSync(dotEnvPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function toIsoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function countQueueByStatus(supabase, status) {
  const { count, error } = await supabase
    .from('notification_dispatch_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', status);

  if (error) throw error;
  return Number(count || 0);
}

async function countLogsByStatusSince(supabase, status, sinceIso) {
  const { count, error } = await supabase
    .from('notification_dispatch_logs')
    .select('queue_id', { count: 'exact', head: true })
    .eq('status', status)
    .gte('created_at', sinceIso);

  if (error) throw error;
  return Number(count || 0);
}

function buildWarnings(snapshot) {
  const warnings = [];

  const pendingWarnThreshold = Number(process.env.NOTIF_PENDING_WARN_THRESHOLD || 200);
  const deadWarnThreshold = Number(process.env.NOTIF_DEAD_WARN_THRESHOLD || 1);
  const failed24hWarnThreshold = Number(process.env.NOTIF_FAILED_24H_WARN_THRESHOLD || 10);
  const staleDeleteErrorWarnThreshold = Number(process.env.NOTIF_STALE_DELETE_ERROR_WARN_THRESHOLD || 1);

  if (Number.isFinite(pendingWarnThreshold) && snapshot.queue.pending > pendingWarnThreshold) {
    warnings.push(`pending_queue_high:${snapshot.queue.pending}`);
  }
  if (Number.isFinite(deadWarnThreshold) && snapshot.queue.dead >= deadWarnThreshold) {
    warnings.push(`dead_letter_present:${snapshot.queue.dead}`);
  }
  if (Number.isFinite(failed24hWarnThreshold) && snapshot.logs24h.failed >= failed24hWarnThreshold) {
    warnings.push(`failed_24h_high:${snapshot.logs24h.failed}`);
  }
  if (
    Number.isFinite(staleDeleteErrorWarnThreshold)
    && snapshot.logs24h.staleDeleteErrors >= staleDeleteErrorWarnThreshold
  ) {
    warnings.push(`stale_delete_errors_24h:${snapshot.logs24h.staleDeleteErrors}`);
  }

  return warnings;
}

async function run() {
  parseDotEnv(path.join(process.cwd(), '.env'));

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase env vars. Require SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const since24h = toIsoHoursAgo(24);

  const [pending, processing, sent, failed, dead] = await Promise.all([
    countQueueByStatus(supabase, 'pending'),
    countQueueByStatus(supabase, 'processing'),
    countQueueByStatus(supabase, 'sent'),
    countQueueByStatus(supabase, 'failed'),
    countQueueByStatus(supabase, 'dead'),
  ]);

  const [sent24h, failed24h, dead24h] = await Promise.all([
    countLogsByStatusSince(supabase, 'sent', since24h),
    countLogsByStatusSince(supabase, 'failed', since24h),
    countLogsByStatusSince(supabase, 'dead', since24h),
  ]);

  const { count: staleDeleteErrorCount, error: staleDeleteErr } = await supabase
    .from('notification_dispatch_logs')
    .select('queue_id', { count: 'exact', head: true })
    .ilike('error_message', '%Stale cleanup%')
    .gte('created_at', since24h);
  if (staleDeleteErr) throw staleDeleteErr;

  const { data: recentErrors, error: recentErrorsErr } = await supabase
    .from('notification_dispatch_logs')
    .select('queue_id, status, error_message, created_at')
    .in('status', ['failed', 'dead'])
    .not('error_message', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);
  if (recentErrorsErr) throw recentErrorsErr;

  const snapshot = {
    ok: true,
    generatedAt: new Date().toISOString(),
    queue: {
      pending,
      processing,
      sent,
      failed,
      dead,
      total: pending + processing + sent + failed + dead,
    },
    logs24h: {
      since: since24h,
      sent: sent24h,
      failed: failed24h,
      dead: dead24h,
      staleDeleteErrors: Number(staleDeleteErrorCount || 0),
    },
    recentErrors: recentErrors || [],
  };

  const warnings = buildWarnings(snapshot);

  const output = {
    ...snapshot,
    warning: warnings.length > 0 ? warnings.join(', ') : null,
  };

  console.log(JSON.stringify(output, null, 2));
  if (warnings.length > 0) process.exitCode = 2;
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
  process.exitCode = 1;
});
