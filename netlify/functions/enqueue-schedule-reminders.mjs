import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const REMINDER_MINUTES = Math.max(1, Number(process.env.SCHEDULE_REMINDER_MINUTES || 30));
const LOOKAHEAD_MINUTES = Math.max(1, Number(process.env.SCHEDULE_REMINDER_LOOKAHEAD_MINUTES || 2));
const GRACE_MINUTES = Math.max(0, Number(process.env.SCHEDULE_REMINDER_GRACE_MINUTES || 1));

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

function parseTime(time) {
  const [h, m] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { h, m };
}

function getOffsetMinutes(timeZone, atDate = new Date()) {
  const text = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  }).formatToParts(atDate).find((part) => part.type === 'timeZoneName')?.value || 'GMT+0';

  const match = text.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function localDateTimeToUtc(dateStr, timeStr, timeZone) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const time = parseTime(timeStr);
  if (!year || !month || !day || !time) return null;
  const offset = getOffsetMinutes(timeZone, new Date());
  const localAsUtcMillis = Date.UTC(year, month - 1, day, time.h, time.m, 0, 0);
  return new Date(localAsUtcMillis - offset * 60 * 1000);
}

function formatEventDate(dateStr, timeZone) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date.toLocaleDateString('id-ID', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildScheduleMessage(event, reminderMinutes, timeZone) {
  const timeLine = event.isAllDay
    ? 'Seharian'
    : event.startTime
      ? `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}`
      : '(tanpa jam)';

  return [
    '⏰ <b>Reminder Jadwal</b>',
    `<b>${escapeHtml(event.title || 'Kegiatan')}</b>`,
    `<i>${escapeHtml(formatEventDate(event.date, timeZone))}</i>`,
    `<i>Jam:</i> ${escapeHtml(timeLine)}`,
    `<i>Reminder:</i> ${reminderMinutes} menit sebelum jadwal`,
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
    for (const channel of channels) {
      const events = scheduleMap.get(channel.user_id) || [];
      const tz = channel.timezone || 'Asia/Jakarta';
      for (const eventItem of events) {
        const eventDate = String(eventItem?.date || '');
        if (!eventDate) continue;

        const eventTime = eventItem?.isAllDay ? '09:00' : (eventItem?.startTime || null);
        if (!eventTime) continue;

        const eventUtc = localDateTimeToUtc(eventDate, eventTime, tz);
        if (!eventUtc) continue;

        const reminderAt = new Date(eventUtc.getTime() - REMINDER_MINUTES * 60 * 1000);
        if (reminderAt < windowStart || reminderAt > windowEnd) continue;

        rows.push({
          source_type: 'schedule',
          source_id: String(eventItem.id || `${channel.user_id}-${eventDate}-${eventTime}`),
          user_id: channel.user_id,
          channel: 'telegram',
          idempotency_key: `schedule:${channel.user_id}:${eventItem.id || 'na'}:${eventDate}:${eventTime}:${REMINDER_MINUTES}`,
          payload: {
            text: buildScheduleMessage(eventItem, REMINDER_MINUTES, tz),
            parse_mode: 'HTML',
            telegram_chat_id: channel.telegram_chat_id,
            event_date: eventDate,
            event_time: eventTime,
            reminder_at: reminderAt.toISOString(),
          },
          status: 'pending',
          next_attempt_at: new Date().toISOString(),
        });
      }
    }

    if (rows.length === 0) {
      return json(200, { ok: true, enqueued: 0, usersScanned: channels.length, candidateRows: 0 });
    }

    let inserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { data: insertedRows, error: insertError } = await supabase
        .from('notification_dispatch_queue')
        .insert(chunk, { onConflict: 'idempotency_key', ignoreDuplicates: true })
        .select('id');
      if (insertError) throw insertError;
      inserted += (insertedRows || []).length;
    }

    return json(200, {
      ok: true,
      usersScanned: channels.length,
      candidateRows: rows.length,
      enqueued: inserted,
      reminderMinutes: REMINDER_MINUTES,
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Failed to enqueue schedule reminders' });
  }
};
