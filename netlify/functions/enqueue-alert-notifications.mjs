import { createClient } from '@supabase/supabase-js';
import { requireOperationalAccess } from './_operation-auth.mjs';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const LOOKBACK_MINUTES = Math.max(1, Number(process.env.NOTIFICATION_ALERT_LOOKBACK_MINUTES || 10));

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-internal-key',
    },
    body: JSON.stringify(body),
  };
}

function buildAlertMessage(alert) {
  const levelEmoji = alert.level === 'critical' ? '🚨' : alert.level === 'warning' ? '⚠️' : 'ℹ️';
  const statusText = alert.status === 'resolved' ? 'RESOLVED' : 'OPEN';
  const isAdminBroadcast = alert.source === 'admin-broadcast' || alert.payload?.is_admin_broadcast === true;
  const header = isAdminBroadcast ? `${levelEmoji} <b>Pengumuman Admin ${statusText}</b>` : `${levelEmoji} <b>System Alert ${statusText}</b>`;
  return [
    header,
    `<b>${escapeHtml(alert.title || 'Alert')}</b>`,
    escapeHtml(alert.message || ''),
    alert.rule_key ? `<i>Rule:</i> ${escapeHtml(alert.rule_key)}` : null,
    `<i>Waktu:</i> ${new Date(alert.updated_at || alert.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
  ].filter(Boolean).join('\n');
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  const access = await requireOperationalAccess(event, {
    allowInternal: true,
    allowSchedule: true,
    allowAdminBearer: false,
  });
  if (!access.ok) {
    return json(access.statusCode || 401, { ok: false, error: access.error || 'Unauthorized' });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const sinceIso = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();

    const { data: alerts, error: alertsError } = await supabase
      .from('alert_events')
      .select('id, level, title, message, status, source, rule_key, payload, created_at, updated_at')
      .in('status', ['open', 'resolved'])
      .gte('updated_at', sinceIso)
      .order('updated_at', { ascending: true })
      .limit(1000);

    if (alertsError) throw alertsError;

    if (!alerts || alerts.length === 0) {
      return json(200, { ok: true, enqueued: 0, alertsScanned: 0, recipients: 0 });
    }

    const { data: channels, error: channelsError } = await supabase
      .from('notification_channels')
      .select('user_id, telegram_chat_id')
      .eq('channel', 'telegram')
      .eq('is_enabled', true)
      .eq('is_verified', true)
      .eq('alert_enabled', true)
      .not('telegram_chat_id', 'is', null)
      .limit(10000);

    if (channelsError) throw channelsError;

    if (!channels || channels.length === 0) {
      return json(200, { ok: true, enqueued: 0, alertsScanned: alerts.length, recipients: 0 });
    }

    const rows = [];
    for (const alert of alerts) {
      const text = buildAlertMessage(alert);
      const forceSend = Boolean(
        alert.source === 'admin-broadcast'
        && alert.level === 'critical'
        && alert.payload?.critical_override === true,
      );
      for (const channel of channels) {
        rows.push({
          source_type: 'alert',
          source_id: String(alert.id),
          user_id: channel.user_id,
          channel: 'telegram',
          idempotency_key: `alert:${alert.id}:${channel.user_id}:telegram`,
          payload: {
            text,
            parse_mode: 'HTML',
            telegram_chat_id: channel.telegram_chat_id,
            level: alert.level,
            status: alert.status,
            title: alert.title,
            source: alert.source || null,
            is_admin_broadcast: alert.source === 'admin-broadcast' || alert.payload?.is_admin_broadcast === true,
            correlation_id: alert.payload?.correlation_id || null,
            force_send: forceSend,
          },
          status: 'pending',
          next_attempt_at: new Date().toISOString(),
        });
      }
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
      alertsScanned: alerts.length,
      recipients: channels.length,
      attemptedQueueRows: rows.length,
      enqueued: inserted,
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Failed to enqueue alert notifications' });
  }
};
