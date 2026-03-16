import { createClient } from '@supabase/supabase-js';
import {
  WIB_TIMEZONE,
  localDateTimeToUtcWib,
  buildScheduleIdempotencyKey,
  computeStaleScheduleQueueIds,
} from './_schedule-reminder-utils.mjs';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const REMINDER_MINUTES = Math.max(1, Number(process.env.SCHEDULE_REMINDER_MINUTES || 10));
const LOOKAHEAD_MINUTES = Math.max(1, Number(process.env.SCHEDULE_REMINDER_LOOKAHEAD_MINUTES || 60));
const GRACE_MINUTES = Math.max(0, Number(process.env.SCHEDULE_REMINDER_GRACE_MINUTES || 15));

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  };
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatEventDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date.toLocaleDateString('id-ID', {
    timeZone: WIB_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildScheduleMessage(event, reminderMinutes) {
  const timeLine = event.isAllDay
    ? 'Seharian'
    : event.startTime
      ? `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}`
      : '(tanpa jam)';

  return [
    '⏰ <b>Reminder Jadwal</b>',
    `<b>${escapeHtml(event.title || 'Kegiatan')}</b>`,
    `<i>${escapeHtml(formatEventDate(event.date))}</i>`,
    `<i>Jam:</i> ${escapeHtml(timeLine)}`,
    '<i>Zona waktu:</i> WIB (GMT+7)',
    `<i>Reminder:</i> ±${reminderMinutes} menit (estimasi) sebelum jadwal`,
  ].join('\n');
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - GRACE_MINUTES * 60 * 1000);
    const windowEnd = new Date(now.getTime() + LOOKAHEAD_MINUTES * 60 * 1000);

    const { data: channels, error: channelsError } = await supabase
      .from('notification_channels')
      .select('user_id, telegram_chat_id, timezone')
      .eq('channel', 'telegram')
      .eq('is_enabled', true)
      .eq('is_verified', true)
      .eq('schedule_enabled', true)
      .not('telegram_chat_id', 'is', null)
      .limit(10000);

    if (channelsError) throw channelsError;
    if (!channels || channels.length === 0) {
      return json(200, { ok: true, enqueued: 0, usersScanned: 0 });
    }

    const userIds = channels.map((item) => item.user_id);
    const { data: schedulesRows, error: schedulesError } = await supabase
      .from('user_schedules')
      .select('user_id, schedules_data')
      .in('user_id', userIds);

    if (schedulesError) throw schedulesError;

    const scheduleMap = new Map((schedulesRows || []).map((row) => [row.user_id, Array.isArray(row.schedules_data) ? row.schedules_data : []]));

    const rows = [];
    const activeIdempotencyKeys = new Set();
    for (const channel of channels) {
      const events = scheduleMap.get(channel.user_id) || [];
      for (const eventItem of events) {
        const eventDate = String(eventItem?.date || '');
        if (!eventDate) continue;

        const eventTime = eventItem?.isAllDay ? '09:00' : (eventItem?.startTime || '09:00');
        if (!eventTime) continue;

        const eventUtc = localDateTimeToUtcWib(eventDate, eventTime);
        if (!eventUtc) continue;

        const reminderAt = new Date(eventUtc.getTime() - REMINDER_MINUTES * 60 * 1000);
        
        // ADD TO ACTIVE KEYS BEFORE WINDOW CHECK
        // This ensures the notification isn't deleted as "stale" just because it's 
        // outside the current processing window.
        const idempotencyKey = buildScheduleIdempotencyKey(
          channel.user_id,
          eventItem.id,
          eventDate,
          eventTime,
          REMINDER_MINUTES,
        );
        activeIdempotencyKeys.add(idempotencyKey);

        if (reminderAt < windowStart || reminderAt > windowEnd) {
          continue;
        }

        const effectiveNextAttempt = reminderAt > now ? reminderAt.toISOString() : now.toISOString();

        rows.push({
          source_type: 'schedule',
          source_id: String(eventItem.id || `${channel.user_id}-${eventDate}-${eventTime}`),
          user_id: channel.user_id,
          channel: 'telegram',
          idempotency_key: idempotencyKey,
          payload: {
            text: buildScheduleMessage(eventItem, REMINDER_MINUTES),
            parse_mode: 'HTML',
            telegram_chat_id: channel.telegram_chat_id,
            event_date: eventDate,
            event_time: eventTime,
            reminder_at: reminderAt.toISOString(),
            timezone: WIB_TIMEZONE,
          },
          status: 'pending',
          next_attempt_at: effectiveNextAttempt,
        });
      }
    }

    let staleRemoved = 0;
    if (userIds.length > 0) {
      const { data: existingRows, error: existingError } = await supabase
        .from('notification_dispatch_queue')
        .select('id, idempotency_key')
        .eq('source_type', 'schedule')
        .in('status', ['pending', 'failed'])
        .in('user_id', userIds)
        .like('idempotency_key', 'schedule:%')
        .limit(10000);

      if (existingError) throw existingError;

      const staleIds = computeStaleScheduleQueueIds(existingRows || [], activeIdempotencyKeys);
      if (staleIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('notification_dispatch_queue')
          .delete()
          .in('id', staleIds);
        if (deleteError) throw deleteError;
        staleRemoved = staleIds.length;
      }
    }

    if (rows.length === 0) {
      return json(200, {
        ok: true,
        enqueued: 0,
        usersScanned: channels.length,
        candidateRows: 0,
        staleRemoved,
        timezone: WIB_TIMEZONE,
      });
    }

    // Clear terminal-state rows that would block re-enqueue via ignoreDuplicates.
    // E.g. skipped_quiet_hours / skipped_opt_out rows keep the same idempotency_key
    // and prevent a fresh 'pending' row from being inserted.
    const enqueueKeys = rows.map((r) => r.idempotency_key);
    const keyChunkSize = 500;
    let clearedTerminal = 0;
    for (let i = 0; i < enqueueKeys.length; i += keyChunkSize) {
      const keyChunk = enqueueKeys.slice(i, i + keyChunkSize);
      const { data: deleted, error: delErr } = await supabase
        .from('notification_dispatch_queue')
        .delete()
        .in('idempotency_key', keyChunk)
        .in('status', ['skipped_quiet_hours', 'skipped_opt_out', 'dead'])
        .select('id');
      if (delErr) throw delErr;
      clearedTerminal += (deleted || []).length;
    }

    let inserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { data: insertedRows, error: insertError } = await supabase
        .from('notification_dispatch_queue')
        .upsert(chunk, { onConflict: 'idempotency_key', ignoreDuplicates: true })
        .select('id');
      if (insertError) throw insertError;
      inserted += (insertedRows || []).length;
    }

    return json(200, {
      ok: true,
      usersScanned: channels.length,
      candidateRows: rows.length,
      enqueued: inserted,
      clearedTerminal,
      reminderMinutes: REMINDER_MINUTES,
      staleRemoved,
      timezone: WIB_TIMEZONE,
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Failed to enqueue schedule reminders' });
  }
};
