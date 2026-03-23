import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

async function resolveEnqueueRunner() {
  try {
    const mod = await import('../netlify/functions/enqueue-schedule-reminders.mjs');
    if (typeof mod?.handler === 'function') {
      return async () => mod.handler({ httpMethod: 'GET', internalCall: true, headers: {} });
    }
  } catch {
    // Fallback to endpoint call below.
  }

  const baseUrl = process.env.NOTIFICATION_BASE_URL || process.env.VITE_NOTIFICATION_WORKER_URL || process.env.URL;
  if (!baseUrl) {
    throw new Error('Missing runtime runner for /enqueue-schedule-reminders. Set NOTIFICATION_BASE_URL or VITE_NOTIFICATION_WORKER_URL.');
  }

  const url = `${String(baseUrl).replace(/\/$/, '')}/enqueue-schedule-reminders`;
  return async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'script-smoke', triggeredAt: new Date().toISOString() }),
    });
    const text = await res.text();
    return { statusCode: res.status, body: text };
  };
}

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

function getWibNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

async function run() {
  const root = process.cwd();
  parseDotEnv(path.join(root, '.env'));

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase env vars for test run.');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const runEnqueue = await resolveEnqueueRunner();

  const { data: channels, error: channelErr } = await supabase
    .from('notification_channels')
    .select('user_id')
    .eq('channel', 'telegram')
    .eq('is_enabled', true)
    .eq('is_verified', true)
    .eq('schedule_enabled', true)
    .not('telegram_chat_id', 'is', null)
    .limit(1);
  if (channelErr) throw channelErr;
  if (!channels || channels.length === 0) throw new Error('No eligible verified Telegram channel found for invalidation test.');

  const userId = channels[0].user_id;
  const reminderMinutes = Math.max(1, Number(process.env.SCHEDULE_REMINDER_MINUTES || 10));

  const { data: scheduleRow, error: scheduleErr } = await supabase
    .from('user_schedules')
    .select('user_id, schedules_data')
    .eq('user_id', userId)
    .maybeSingle();
  if (scheduleErr) throw scheduleErr;

  const originalSchedules = Array.isArray(scheduleRow?.schedules_data) ? [...scheduleRow.schedules_data] : [];

  const wibNow = getWibNow();
  const startV1 = new Date(wibNow.getTime() + (reminderMinutes + 1) * 60 * 1000);
  const startV2 = new Date(wibNow.getTime() + (reminderMinutes + 2) * 60 * 1000);

  const eventId = `e2e-invalidation-test-${Date.now()}`;
  const v1Date = formatDate(startV1);
  const v1Time = formatTime(startV1);
  const v2Date = formatDate(startV2);
  const v2Time = formatTime(startV2);

  const v1Event = {
    id: eventId,
    title: '[AUTO TEST] Invalidation flow v1',
    description: 'Temporary event for queue invalidation test',
    date: v1Date,
    startTime: v1Time,
    endTime: '',
    isAllDay: false,
    category: 'pribadi',
    priority: 'sedang',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await supabase.from('user_schedules').upsert({
    user_id: userId,
    schedules_data: [...originalSchedules, v1Event],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id', ignoreDuplicates: false });

  const enqueueV1 = await runEnqueue();

  const v2Schedules = [...originalSchedules, {
    ...v1Event,
    title: '[AUTO TEST] Invalidation flow v2',
    date: v2Date,
    startTime: v2Time,
    updatedAt: new Date().toISOString(),
  }];

  await supabase.from('user_schedules').upsert({
    user_id: userId,
    schedules_data: v2Schedules,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id', ignoreDuplicates: false });

  const enqueueV2 = await runEnqueue();

  const v1Key = `schedule:${userId}:${eventId}:${v1Date}:${v1Time}:${reminderMinutes}`;
  const v2Key = `schedule:${userId}:${eventId}:${v2Date}:${v2Time}:${reminderMinutes}`;

  const { data: queueRows, error: queueErr } = await supabase
    .from('notification_dispatch_queue')
    .select('id, source_id, status, idempotency_key, created_at, updated_at')
    .eq('source_type', 'schedule')
    .eq('source_id', eventId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (queueErr) throw queueErr;

  const hasV1Key = (queueRows || []).some((row) => row.idempotency_key === v1Key);
  const hasV2Key = (queueRows || []).some((row) => row.idempotency_key === v2Key);

  await supabase.from('user_schedules').upsert({
    user_id: userId,
    schedules_data: originalSchedules,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id', ignoreDuplicates: false });

  // Final enqueue to clear pending stale rows from this temporary event.
  await runEnqueue();

  const parseBody = (res) => {
    try {
      return typeof res?.body === 'string' ? JSON.parse(res.body) : (res?.body || {});
    } catch {
      return {};
    }
  };

  const strictOk = !hasV1Key && hasV2Key;

  console.log(JSON.stringify({
    ok: strictOk,
    userId,
    reminderMinutes,
    eventId,
    v1: { date: v1Date, time: v1Time, idempotencyKey: v1Key },
    v2: { date: v2Date, time: v2Time, idempotencyKey: v2Key },
    enqueueV1: { statusCode: enqueueV1?.statusCode, body: parseBody(enqueueV1) },
    enqueueV2: { statusCode: enqueueV2?.statusCode, body: parseBody(enqueueV2) },
    queueRows,
    checks: {
      hasV1Key,
      hasV2Key,
      staleV1Removed: !hasV1Key,
      latestV2Exists: hasV2Key,
    },
    warning: strictOk
      ? null
      : 'Queue evidence for latest idempotency key is missing. Invalidation behavior cannot be confirmed.',
  }, null, 2));

  if (!strictOk) process.exitCode = 1;
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
  process.exitCode = 1;
});
